/**
 * GET /api/comisiones?year=&month=
 *
 * Ventas del mes (facturas emitidas activas — mismo criterio ISSUED/IMPORTED/
 * PDF_PENDING que el chequeo de expedientes; invoice_date = fecha de venta)
 * con sus condiciones de pago (LEFT JOIN venta_condiciones_pago), la comisión
 * calculada por fila (con el tramo aplicado, para poder auditar el porqué) y,
 * a nivel mes, subtotal + bono por cantidad de ventas + total.
 *
 * El precio de venta que manda el ratio es Deal."importeTotal" (el mismo con
 * el que se validó contado + financiado al capturar las condiciones); si el
 * deal no lo tiene cargado se cae al total de la factura.
 *
 * Las ventas sin condiciones registradas (anteriores a la feature, o B2B sin
 * deal) salen con sinDatos=true y comisión null: no se inventa un tramo.
 * Sesión normal (middleware + requireApiSession).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import {
  calcularBonoMensual,
  calcularComision,
  configPorDefecto,
  normalizarConfig,
  type ComisionConfig,
  type FormaPago,
} from '@/lib/comisiones'

const ACTIVE_STATUSES = ['ISSUED', 'IMPORTED', 'PDF_PENDING']

interface VentaRow {
  invoice_id: number
  deal_id: number | null
  full_invoice_number: string
  invoice_date: string
  total_amount: string
  vehicle_plate: string | null
  marca: string | null
  modelo: string | null
  importe_total: string | null
  forma_pago: FormaPago | null
  banco: string | null
  interes: string | null
  cuotas: number | null
  monto_financiado: string | null
  monto_contado: string | null
  garantia_premium: boolean | null
}

/**
 * Config vigente. Si la tabla no existe o la fila está corrupta se cae a la
 * tabla por defecto (la real) y se marca configDisponible=false para avisar
 * en la UI: nunca se calcula con ceros silenciosos.
 */
async function cargarConfig(): Promise<{
  config: ComisionConfig
  configDisponible: boolean
}> {
  const reg = await pool.query<{ reg: string | null }>(
    `SELECT to_regclass('public.comision_config') AS reg`
  )
  if (!reg.rows[0]?.reg) {
    return { config: configPorDefecto(), configDisponible: false }
  }
  const res = await pool.query<{ config: unknown }>(
    `SELECT config FROM comision_config WHERE id = 1`
  )
  const config = normalizarConfig(res.rows[0]?.config)
  if (!config) return { config: configPorDefecto(), configDisponible: false }
  return { config, configDisponible: true }
}

export async function GET(request: NextRequest) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const sp = request.nextUrl.searchParams
  const now = new Date()
  const year = parseInt(sp.get('year') || String(now.getFullYear()), 10)
  const month = parseInt(sp.get('month') || String(now.getMonth() + 1), 10)
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    month < 1 ||
    month > 12 ||
    year < 2000 ||
    year > 2100
  ) {
    return NextResponse.json(
      { error: 'year/month inválidos (month 1-12)' },
      { status: 400 }
    )
  }
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

  try {
    const { config, configDisponible } = await cargarConfig()

    const vcpReg = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.venta_condiciones_pago') AS reg`
    )
    const conCondiciones = Boolean(vcpReg.rows[0]?.reg)

    const joinCondiciones = conCondiciones
      ? `LEFT JOIN venta_condiciones_pago c ON c.deal_id = i.deal_id`
      : ''
    const colsCondiciones = conCondiciones
      ? `c.forma_pago, c.banco, c.interes, c.cuotas, c.monto_financiado,
         c.monto_contado, c.garantia_premium`
      : `NULL AS forma_pago, NULL AS banco, NULL AS interes, NULL AS cuotas,
         NULL AS monto_financiado, NULL AS monto_contado,
         NULL AS garantia_premium`

    const ventasDb = await pool.query<VentaRow>(
      `SELECT i.id AS invoice_id, i.deal_id, i.full_invoice_number,
              i.invoice_date::text, i.total_amount, i.vehicle_plate,
              v.marca, v.modelo, d."importeTotal" AS importe_total,
              ${colsCondiciones}
         FROM invoices i
         LEFT JOIN "Vehiculo" v ON v.id = i.vehiculo_id
         LEFT JOIN "Deal" d ON d.id = i.deal_id
         ${joinCondiciones}
        WHERE i.status = ANY($1)
          AND i.invoice_type <> 'RECTIFYING'
          AND i.invoice_date >= $2 AND i.invoice_date < $3
        ORDER BY i.invoice_date, i.full_invoice_number`,
      [ACTIVE_STATUSES, from, to]
    )

    let subtotalVentas = 0
    let sinDatos = 0

    const ventas = ventasDb.rows.map((r) => {
      const importeFactura = Number(r.total_amount)
      const precioVenta =
        r.importe_total != null && Number(r.importe_total) > 0
          ? Number(r.importe_total)
          : importeFactura
      const montoFinanciado =
        r.monto_financiado != null ? Number(r.monto_financiado) : null

      const tieneCondiciones = r.forma_pago !== null
      // Sin precio de venta no hay ratio → no se puede ubicar el tramo.
      const calculable = tieneCondiciones && precioVenta > 0

      const comision = calculable
        ? calcularComision(
            {
              formaPago: r.forma_pago as FormaPago,
              garantiaPremium: Boolean(r.garantia_premium),
              montoFinanciado,
              precioVenta,
            },
            config
          )
        : null

      if (comision) subtotalVentas += comision.total
      else sinDatos += 1

      return {
        invoiceId: r.invoice_id,
        dealId: r.deal_id,
        numeroFactura: r.full_invoice_number,
        fecha: r.invoice_date,
        importe: importeFactura,
        precioVenta,
        matricula: r.vehicle_plate,
        vehiculo: [r.marca, r.modelo].filter(Boolean).join(' ') || null,
        condiciones: tieneCondiciones
          ? {
              formaPago: r.forma_pago,
              banco: r.banco,
              interes: r.interes != null ? Number(r.interes) : null,
              cuotas: r.cuotas,
              montoFinanciado,
              montoContado:
                r.monto_contado != null ? Number(r.monto_contado) : null,
              garantiaPremium: Boolean(r.garantia_premium),
            }
          : null,
        comision,
        sinDatos: !calculable,
      }
    })

    // El bono cuenta los coches vendidos del mes (todas las facturas activas),
    // tengan o no condiciones cargadas: el coche se vendió igual.
    const ventasContadas = ventas.length
    const bono = calcularBonoMensual(ventasContadas, config)

    const round2 = (n: number) => Math.round(n * 100) / 100
    const subtotal = round2(subtotalVentas)

    return NextResponse.json({
      year,
      month,
      config,
      configDisponible,
      condicionesDisponibles: conCondiciones,
      ventas,
      totales: {
        ventasContadas,
        sinDatos,
        subtotalVentas: subtotal,
        escalonBono: bono.escalon,
        importeBono: bono.importe,
        siguienteEscalon: bono.siguienteEscalon,
        faltanParaSiguiente: bono.faltanParaSiguiente,
        total: round2(subtotal + bono.importe),
      },
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
