/**
 * GET /api/expedientes?quarter=&year=&estado=
 *
 * Lista de expedientes de venta con conteos por estado. Requiere sesión
 * (middleware + requireApiSession). Si la tabla `expedientes` todavía no
 * existe (migración create-expedientes.sql sin aplicar) devuelve
 * verificable:false con lista vacía en vez de un 500.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import { quarterRange } from '@/lib/facturasMonitor'
import { ESTADOS_EXPEDIENTE } from '@/lib/expedienteChecklist'

export async function GET(request: NextRequest) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const sp = request.nextUrl.searchParams
  const year = parseInt(sp.get('year') || String(new Date().getFullYear()), 10)
  const quarterRaw = sp.get('quarter')
  const quarter = quarterRaw ? parseInt(quarterRaw, 10) : null
  if (quarter !== null && ![1, 2, 3, 4].includes(quarter)) {
    return NextResponse.json({ error: 'quarter debe ser 1, 2, 3 o 4' }, { status: 400 })
  }
  const estado = sp.get('estado')
  if (estado && !(ESTADOS_EXPEDIENTE as readonly string[]).includes(estado)) {
    return NextResponse.json(
      { error: `estado inválido. Válidos: ${ESTADOS_EXPEDIENTE.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const reg = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.expedientes') AS reg`
    )
    if (!reg.rows[0]?.reg) {
      return NextResponse.json({
        verificable: false,
        nota: 'La tabla expedientes no existe todavía — aplicar create-expedientes.sql',
        year,
        quarter,
        total: 0,
        counts: {},
        expedientes: [],
      })
    }

    const range = quarter
      ? quarterRange(year, quarter)
      : { from: `${year}-01-01`, to: `${year + 1}-01-01` }
    const periodo = `(invoice_date >= $1 AND invoice_date < $2)`

    const countsRes = await pool.query<{ estado: string; n: number }>(
      `SELECT estado, COUNT(*)::int AS n
         FROM expedientes
        WHERE ${periodo}
        GROUP BY estado`,
      [range.from, range.to]
    )
    const counts: Record<string, number> = {}
    for (const e of ESTADOS_EXPEDIENTE) counts[e] = 0
    for (const row of countsRes.rows) counts[row.estado] = row.n

    const params: unknown[] = [range.from, range.to]
    let where = periodo
    if (estado) {
      params.push(estado)
      where += ` AND estado = $3`
    }
    const list = await pool.query(
      `SELECT id, tipo_operacion, deal_id, b2b_venta_id, vehiculo_id, matricula,
              numero_factura, invoice_date::text, estado, checklist, notas,
              created_at, updated_at
         FROM expedientes
        WHERE ${where}
        ORDER BY invoice_date DESC NULLS LAST, id DESC`,
      params
    )

    return NextResponse.json({
      verificable: true,
      year,
      quarter,
      estado: estado ?? null,
      total: countsRes.rows.reduce((acc, r) => acc + r.n, 0),
      counts,
      expedientes: list.rows,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
