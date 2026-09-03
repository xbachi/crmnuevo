/**
 * GET /api/admin/periodos?year=2026 — lista los períodos contables y su estado.
 * Sólo lee. X-Admin-Secret. Los meses sin fila están implícitamente abiertos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'

export async function GET(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-admin-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const yearRaw = searchParams.get('year')
  const year = yearRaw ? parseInt(yearRaw, 10) : null
  if (yearRaw && Number.isNaN(year)) {
    return NextResponse.json({ error: 'year inválido' }, { status: 400 })
  }

  try {
    const reg = await pool.query<{ t: string | null }>(
      `SELECT to_regclass('public.periodos_contables')::text AS t`
    )
    if (!reg.rows[0]?.t) {
      return NextResponse.json({
        ok: true,
        periodos: [],
        nota: 'tabla periodos_contables no existe todavía (correr create-periodos-contables.sql); todos los meses están abiertos',
      })
    }
    const res = year
      ? await pool.query(
          `SELECT * FROM periodos_contables WHERE anio = $1 ORDER BY anio, mes`,
          [year]
        )
      : await pool.query(`SELECT * FROM periodos_contables ORDER BY anio, mes`)
    return NextResponse.json({ ok: true, periodos: res.rows })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
