/**
 * GET /api/comisiones?year=&month=
 *
 * Ventas del mes (facturas emitidas activas — mismo criterio ISSUED/IMPORTED/
 * PDF_PENDING que el chequeo de expedientes; invoice_date = fecha de venta)
 * con sus condiciones de pago (LEFT JOIN venta_condiciones_pago) y la
 * comisión calculada por fila + totales. Las ventas anteriores a la captura
 * de condiciones (o B2B sin deal) salen con sinDatos=true y comisión null.
 * Sesión normal (middleware + requireApiSession).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import {
  calcularComision,
  configVacia,
  esConfigPendiente,
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
  forma_pago: FormaPago | null
  banco: string | null
  interes: string | null
  cuotas: number | null
  monto_financiado: string | null
  monto_contado: string | null
  garantia_premium: boolean | null
}

async function cargarConfig(): Promise<{
  config: ComisionConfig
  configDisponible: boolean
}> {
  const reg = await pool.query<{ reg: string | null }>(
    `SELECT to_regclass('public.comision_config') AS reg`
  )
  if (!reg.rows[0]?.reg) {
    return { config: configVacia(), configDisponible: false }
  }
  const res = await pool.query<{ config: unknown }>(
    `SELECT config FROM comision_config WHERE id = 1`
  )
  const config = normalizarConfig(res.rows[0]?.config) ?? configVacia()
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
    const pendienteConfig = esConfigPendiente(config)

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
              v.marca, v.modelo,
              ${colsCondiciones}
         FROM invoices i
         LEFT JOIN "Vehiculo" v ON v.id = i.vehiculo_id
         ${joinCondiciones}
        WHERE i.status = ANY($1)
          AND i.invoice_type <> 'RECTIFYING'
          AND i.invoice_date >= $2 AND i.invoice_date < $3
        ORDER BY i.invoice_date, i.full_invoice_number`,
      [ACTIVE_STATUSES, from, to]
    )

    let totalBase = 0
    let totalExtra = 0
    let totalComision = 0
    let sinDatos = 0

    const ventas = ventasDb.rows.map((r) => {
      const tieneCondiciones = r.forma_pago !== null
      let comision = null
      if (tieneCondiciones) {
        comision = calcularComision(
          {
            formaPago: r.forma_pago as FormaPago,
            garantiaPremium: Boolean(r.garantia_premium),
            montoFinanciado:
              r.monto_financiado != null ? Number(r.monto_financiado) : null,
          },
          config
        )
        totalBase += comision.base
        totalExtra += comision.extraFinanciacion
        totalComision += comision.total
      } else {
        sinDatos += 1
      }
      return {
        invoiceId: r.invoice_id,
        dealId: r.deal_id,
        numeroFactura: r.full_invoice_number,
        fecha: r.invoice_date,
        importe: Number(r.total_amount),
        matricula: r.vehicle_plate,
        vehiculo:
          [r.marca, r.modelo].filter(Boolean).join(' ') || null,
        condiciones: tieneCondiciones
          ? {
              formaPago: r.forma_pago,
              banco: r.banco,
              interes: r.interes != null ? Number(r.interes) : null,
              cuotas: r.cuotas,
              montoFinanciado:
                r.monto_financiado != null ? Number(r.monto_financiado) : null,
              montoContado:
                r.monto_contado != null ? Number(r.monto_contado) : null,
              garantiaPremium: Boolean(r.garantia_premium),
            }
          : null,
        comision,
        sinDatos: !tieneCondiciones,
      }
    })

    const round2 = (n: number) => Math.round(n * 100) / 100
    return NextResponse.json({
      year,
      month,
      config,
      configDisponible,
      pendienteConfig,
      condicionesDisponibles: conCondiciones,
      ventas,
      totales: {
        ventas: ventas.length,
        sinDatos,
        base: round2(totalBase),
        extraFinanciacion: round2(totalExtra),
        comision: round2(totalComision),
      },
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
