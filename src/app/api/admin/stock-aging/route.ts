/**
 * GET /api/admin/stock-aging
 *
 * Stock aging / recon tracking (patrón vAuto): por cada vehículo NO vendido,
 * días en stock (desde fechaCompra o createdAt), coste acumulado (compra +
 * gastos por tipo), margen estimado contra precio de venta previsto y alertas:
 * margen-negativo, aging-60/90, sin-precio-compra, gastos-sin-coste-base.
 * Orden: más días primero. Protegido por X-Admin-Secret. Sólo lee.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'

interface Row {
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

export async function GET(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-admin-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const res = await pool.query<Row>(
      `SELECT v.id, v.referencia, v.matricula, v.marca, v.modelo, v.estado,
              GREATEST(0, EXTRACT(DAY FROM NOW() - COALESCE(v."fechaCompra", v."createdAt"))::int) AS "diasEnStock",
              v."precioCompra"::float, v."gastosTransporte"::float, v."gastosTasas"::float,
              v."gastosMecanica"::float, v."gastosPintura"::float, v."gastosLimpieza"::float,
              v."gastosOtros"::float, v."gastosCNGarantia"::float,
              v."precioPublicacion"::float, v."precioVenta"::float
         FROM "Vehiculo" v
        WHERE UPPER(TRIM(COALESCE(v.estado, ''))) <> 'VENDIDO'
        ORDER BY "diasEnStock" DESC, v.id`
    )

    const num = (x: number | null) => (x != null ? Number(x) : 0)

    const vehiculos = res.rows.map((r) => {
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

      const alertas: string[] = []
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

    const conteo = (flag: string) =>
      vehiculos.filter((v) => v.alertas.includes(flag)).length

    const resumen = {
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

    return NextResponse.json({ resumen, vehiculos })
  } catch (e) {
    console.error('stock-aging error:', e)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
