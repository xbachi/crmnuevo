/**
 * GET /api/admin/anomalias-costos?year=2026
 *
 * Reporte de anomalías de costos (para revisión visual dirigida): por cada coche
 * vendido, marca lo sospechoso — sin compra, compra > precio de venta (pérdida),
 * costos fuera de rango, margen negativo. La idea: leer/verificar SÓLO estos
 * pocos, no todos los PDFs.
 *
 * Protegido por X-Admin-Secret. Sólo lee.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { EMITTED_STATUSES, monthRange } from '@/lib/facturasMonitor'
import { validarImporte, RANGO_GASTO } from '@/lib/gastoRangos'
import { CN_INFORME } from '@/lib/costoBeneficioSheet'

interface Row {
  ref: string | null
  matricula: string | null
  venta: number
  precioCompra: number | null
  gastosTransporte: number | null
  gastosMecanica: number | null
  gastosPintura: number | null
  gastosLimpieza: number | null
  gastosOtros: number | null
}

export async function GET(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || (request.headers.get('x-admin-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const year = parseInt(new URL(request.url).searchParams.get('year') || String(new Date().getFullYear()), 10)
  const { from, to } = monthRange(year)

  try {
    const res = await pool.query<Row>(
      `SELECT v.referencia AS ref, v.matricula,
              i.total_amount::float AS venta,
              v."precioCompra"::float, v."gastosTransporte"::float, v."gastosMecanica"::float,
              v."gastosPintura"::float, v."gastosLimpieza"::float, v."gastosOtros"::float
         FROM invoices i
         JOIN "Deal" d ON d.id = i.deal_id
         JOIN "Vehiculo" v ON v.id = d."vehiculoId"
        WHERE i.invoice_date >= $1 AND i.invoice_date < $2 AND i.status = ANY($3)
        ORDER BY v.referencia`,
      [from, to, EMITTED_STATUSES as unknown as string[]]
    )

    const num = (x: number | null) => (x != null ? Number(x) : 0)
    const campos: [keyof Row, string][] = [
      ['precioCompra', 'precioCompra'], ['gastosTransporte', 'gastosTransporte'],
      ['gastosMecanica', 'gastosMecanica'], ['gastosPintura', 'gastosPintura'],
      ['gastosLimpieza', 'gastosLimpieza'], ['gastosOtros', 'gastosOtros'],
    ]

    const anomalias: Record<string, unknown>[] = []
    for (const r of res.rows) {
      const flags: string[] = []
      // 1. sin compra
      if (!r.precioCompra || r.precioCompra <= 0) flags.push('sin-compra')
      // 2. compra > venta (pérdida sospechosa / posible error)
      else if (r.precioCompra > r.venta) flags.push(`compra (${r.precioCompra}) > venta (${r.venta})`)
      // 3. cada costo fuera de rango DURO o en banda de aviso
      for (const [k, campo] of campos) {
        const val = r[k] as number | null
        if (val == null || val === 0) continue
        const v = validarImporte(campo, val)
        if (!v.ok) flags.push(`RANGO: ${v.reason}`)
        else if (v.warn) flags.push(v.warn)
      }
      // 4. margen negativo (coste estimado > venta)
      const coste = num(r.precioCompra) + CN_INFORME + num(r.gastosMecanica) + num(r.gastosPintura) + num(r.gastosLimpieza) + num(r.gastosOtros)
      if (r.precioCompra && coste > r.venta) flags.push(`margen negativo (coste≈${coste.toFixed(0)} > venta ${r.venta})`)

      if (flags.length) anomalias.push({ ref: r.ref, matricula: r.matricula, venta: r.venta, compra: r.precioCompra, flags })
    }

    return NextResponse.json({
      ok: anomalias.length === 0,
      year,
      total: res.rows.length,
      anomalias: anomalias.length,
      rangos: RANGO_GASTO,
      detalle: anomalias,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
