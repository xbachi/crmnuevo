/**
 * POST /api/expedientes/recalcular?quarter=&year=
 *
 * Recalcula los expedientes del trimestre indicado (o todos, si no se pasa
 * quarter) contra la evidencia en DB (automation_logs + facturas_registro).
 * Devuelve resumen de cambios. Solo promueve items a presente; nunca
 * desmarca lo marcado a mano.
 *
 * Protegido por X-Admin-Secret (en whitelist del middleware, mismo patrón
 * que /api/admin/pre-cierre).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { quarterRange } from '@/lib/facturasMonitor'
import { recalcularExpediente, type ResultadoRecalculo } from '@/lib/expedientes'

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || (request.headers.get('x-admin-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sp = request.nextUrl.searchParams
  const year = parseInt(sp.get('year') || String(new Date().getFullYear()), 10)
  const quarterRaw = sp.get('quarter')
  const quarter = quarterRaw ? parseInt(quarterRaw, 10) : null
  if (quarter !== null && ![1, 2, 3, 4].includes(quarter)) {
    return NextResponse.json({ error: 'quarter debe ser 1, 2, 3 o 4' }, { status: 400 })
  }

  try {
    const reg = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass('public.expedientes') AS reg`
    )
    if (!reg.rows[0]?.reg) {
      return NextResponse.json(
        {
          ok: false,
          verificable: false,
          nota: 'La tabla expedientes no existe todavía — aplicar create-expedientes.sql',
        },
        { status: 409 }
      )
    }

    let ids: { rows: { id: number }[] }
    if (quarter) {
      const { from, to } = quarterRange(year, quarter)
      ids = await pool.query<{ id: number }>(
        `SELECT id FROM expedientes
          WHERE invoice_date >= $1 AND invoice_date < $2
          ORDER BY id`,
        [from, to]
      )
    } else {
      ids = await pool.query<{ id: number }>(`SELECT id FROM expedientes ORDER BY id`)
    }

    const cambios: ResultadoRecalculo[] = []
    for (const { id } of ids.rows) {
      const r = await recalcularExpediente(pool, id)
      if (r?.cambio) cambios.push(r)
    }

    const porEstadoRes = await pool.query<{ estado: string; n: number }>(
      `SELECT estado, COUNT(*)::int AS n FROM expedientes GROUP BY estado`
    )
    const porEstado: Record<string, number> = {}
    for (const row of porEstadoRes.rows) porEstado[row.estado] = row.n

    return NextResponse.json({
      ok: true,
      year,
      quarter,
      total: ids.rows.length,
      cambiados: cambios.length,
      porEstado,
      cambios,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
