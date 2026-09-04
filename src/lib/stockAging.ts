/**
 * Stock aging / recon tracking (patrón vAuto): por cada vehículo NO vendido,
 * días en stock (desde fechaCompra o createdAt), coste acumulado (compra +
 * gastos por tipo), margen estimado contra precio de venta previsto y alertas:
 * margen-negativo, aging-60/90, sin-precio-compra, gastos-sin-coste-base.
 *
 * Lo consumen GET /api/admin/stock-aging y el cron de alertas. Sólo lee.
 */

import { pool } from '@/lib/direct-database'

export interface StockAgingRow {
  id: number
  referencia: string | null
  matricula: string | null
  marca: string | null
  modelo: string | null
  estado: string | null
  diasEnStock: number
  precioCompra: number | null
  gastosTransporte: number | null
  gastosTasas: number | null
  gastosMecanica: number | null
  gastosPintura: number | null
  gastosLimpieza: number | null
  gastosOtros: number | null
  gastosCNGarantia: number | null
  precioPublicacion: number | null
  precioVenta: number | null
}

export type StockAgingFlag =
  | 'margen-negativo'
  | 'aging-60'
  | 'aging-90'
  | 'sin-precio-compra'
  | 'gastos-sin-coste-base'

export interface StockAgingVehiculo {
  id: number
  referencia: string | null
  matricula: string | null
  marca: string | null
  modelo: string | null
  estado: string | null
  diasEnStock: number
  precioCompra: number | null
  gastos: Record<string, number>
  totalGastos: number
  costeTotal: number
  precioPublicacion: number | null
  precioVenta: number | null
  margenEstimado: number | null
  alertas: StockAgingFlag[]
}

export interface StockAgingResumen {
  totalEnStock: number
  conAlertas: number
  margenNegativo: number
  aging60: number
  aging90: number
  sinPrecioCompra: number
  gastosSinCosteBase: number
  capitalInmovilizado: number
}

export const STOCK_AGING_SQL = `SELECT v.id, v.referencia, v.matricula, v.marca, v.modelo, v.estado,
              GREATEST(0, EXTRACT(DAY FROM NOW() - COALESCE(v."fechaCompra", v."createdAt"))::int) AS "diasEnStock",
              v."precioCompra"::float, v."gastosTransporte"::float, v."gastosTasas"::float,
              v."gastosMecanica"::float, v."gastosPintura"::float, v."gastosLimpieza"::float,
              v."gastosOtros"::float, v."gastosCNGarantia"::float,
              v."precioPublicacion"::float, v."precioVenta"::float
         FROM "Vehiculo" v
        WHERE UPPER(TRIM(COALESCE(v.estado, ''))) <> 'VENDIDO'
        ORDER BY "diasEnStock" DESC, v.id`

const num = (x: number | null) => (x != null ? Number(x) : 0)

/** Pura: calcula alertas y resumen a partir de las filas de STOCK_AGING_SQL. */
export function calcularStockAging(rows: StockAgingRow[]): {
  resumen: StockAgingResumen
  vehiculos: StockAgingVehiculo[]
} {
  const vehiculos: StockAgingVehiculo[] = rows.map((r) => {
    const gastos = {
      gastosTransporte: num(r.gastosTransporte),
      gastosTasas: num(r.gastosTasas),
      gastosMecanica: num(r.gastosMecanica),
      gastosPintura: num(r.gastosPintura),
      gastosLimpieza: num(r.gastosLimpieza),
      gastosOtros: num(r.gastosOtros),
      gastosCNGarantia: num(r.gastosCNGarantia),
    }
    const totalGastos = Object.values(gastos).reduce((a, b) => a + b, 0)
    const sinCompra = !r.precioCompra || r.precioCompra <= 0
    const costeTotal = num(r.precioCompra) + totalGastos
    // Precio de venta previsto: precioVenta si está cargado, si no publicación
    const precioPrevisto = r.precioVenta ?? r.precioPublicacion ?? null
    const margenEstimado =
      precioPrevisto != null ? Number(precioPrevisto) - costeTotal : null

    const alertas: StockAgingFlag[] = []
    if (margenEstimado != null && margenEstimado < 0)
      alertas.push('margen-negativo')
    if (r.diasEnStock > 90) alertas.push('aging-90')
    else if (r.diasEnStock > 60) alertas.push('aging-60')
    if (sinCompra) alertas.push('sin-precio-compra')
    if (sinCompra && totalGastos > 0) alertas.push('gastos-sin-coste-base')

    return {
      id: r.id,
      referencia: r.referencia,
      matricula: r.matricula,
      marca: r.marca,
      modelo: r.modelo,
      estado: r.estado,
      diasEnStock: r.diasEnStock,
      precioCompra: r.precioCompra != null ? Number(r.precioCompra) : null,
      gastos,
      totalGastos,
      costeTotal,
      precioPublicacion:
        r.precioPublicacion != null ? Number(r.precioPublicacion) : null,
      precioVenta: r.precioVenta != null ? Number(r.precioVenta) : null,
      margenEstimado,
      alertas,
    }
  })

  const conteo = (flag: StockAgingFlag) =>
    vehiculos.filter((v) => v.alertas.includes(flag)).length

  const resumen: StockAgingResumen = {
    totalEnStock: vehiculos.length,
    conAlertas: vehiculos.filter((v) => v.alertas.length > 0).length,
    margenNegativo: conteo('margen-negativo'),
    aging60: conteo('aging-60'),
    aging90: conteo('aging-90'),
    sinPrecioCompra: conteo('sin-precio-compra'),
    gastosSinCosteBase: conteo('gastos-sin-coste-base'),
    capitalInmovilizado: Math.round(
      vehiculos.reduce((a, v) => a + v.costeTotal, 0)
    ),
  }

  return { resumen, vehiculos }
}

export async function getStockAging() {
  const res = await pool.query<StockAgingRow>(STOCK_AGING_SQL)
  return calcularStockAging(res.rows)
}
