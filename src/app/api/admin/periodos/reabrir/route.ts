/**
 * POST /api/admin/periodos/reabrir — reabre un mes cerrado.
 *
 * Body: { anio: number, mes: number, motivo: string, usuario?: string }
 * `motivo` es obligatorio y queda persistido en la fila (auditoría de por qué
 * se tocó un período ya entregado a gestoría).
 *
 * X-Admin-Secret. En whitelist del middleware.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'

export async function POST(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-admin-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const anio = Number(b.anio)
  const mes = Number(b.mes)
  const motivo = b.motivo ? String(b.motivo).trim() : ''
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return NextResponse.json({ error: 'anio inválido' }, { status: 400 })
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'mes inválido (1-12)' }, { status: 400 })
  }
  if (!motivo) {
    return NextResponse.json(
      {
        error:
          'motivo obligatorio para reabrir un período (queda registrado en la fila)',
        code: 'MOTIVO_REQUERIDO',
      },
      { status: 400 }
    )
  }
  const usuario = b.usuario ? String(b.usuario).trim() : 'admin-api'

  try {
    const res = await pool.query(
      `UPDATE periodos_contables
          SET estado = 'abierto', reabierto_at = NOW(),
              reabierto_por = $3, motivo_reapertura = $4
        WHERE anio = $1 AND mes = $2 AND estado = 'cerrado'
        RETURNING *`,
      [anio, mes, usuario, motivo]
    )
    if (res.rows.length === 0) {
      return NextResponse.json(
        {
          error: `el período ${anio}-${String(mes).padStart(2, '0')} no está cerrado (o no existe fila)`,
        },
        { status: 409 }
      )
    }
    return NextResponse.json({ ok: true, periodo: res.rows[0] })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e.code === '42P01') {
      return NextResponse.json(
        {
          error:
            'tabla periodos_contables no existe; correr create-periodos-contables.sql primero',
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { ok: false, error: e.message ?? String(err) },
      { status: 500 }
    )
  }
}
