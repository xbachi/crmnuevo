/**
 * POST /api/admin/periodos/cerrar — cierra un mes contable.
 *
 * Body: { anio: number, mes: number, confirm: true, usuario?: string }
 *
 * Al cerrar se calcula y persiste un snapshot JSONB con los totales del mes
 * (facturas emitidas, documentos del registro por categoría, gastos), que queda
 * como evidencia de lo entregado a gestoría. Un mes cerrado rechaza emisión de
 * facturas y registro de documentos con fecha en ese mes (guards en app).
 *
 * X-Admin-Secret. En whitelist del middleware.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { monthRange } from '@/lib/facturasMonitor'
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
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return NextResponse.json({ error: 'anio inválido' }, { status: 400 })
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'mes inválido (1-12)' }, { status: 400 })
  }
  if (b.confirm !== true) {
    return NextResponse.json(
      {
        error:
          'cerrar un período es irreversible sin reapertura explícita; falta confirm: true',
        code: 'CONFIRM_REQUERIDO',
      },
      { status: 400 }
    )
  }
  const usuario = b.usuario ? String(b.usuario).trim() : 'admin-api'

  try {
    const reg = await pool.query<{ t: string | null }>(
      `SELECT to_regclass('public.periodos_contables')::text AS t`
    )
    if (!reg.rows[0]?.t) {
      return NextResponse.json(
        {
          error:
            'tabla periodos_contables no existe; correr create-periodos-contables.sql primero',
        },
        { status: 503 }
      )
    }

    const existing = await pool.query(
      `SELECT estado FROM periodos_contables WHERE anio = $1 AND mes = $2`,
      [anio, mes]
    )
    if (existing.rows[0]?.estado === 'cerrado') {
      return NextResponse.json(
        {
          error: `el período ${anio}-${String(mes).padStart(2, '0')} ya está cerrado`,
        },
        { status: 409 }
      )
    }

    // Snapshot de totales del mes (evidencia de lo que se entregó al cerrar).
    const { from, to } = monthRange(anio, mes)
    const emitidas = await pool.query<{ n: number; suma: string }>(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(total_amount), 0) AS suma
         FROM invoices
        WHERE invoice_date >= $1 AND invoice_date < $2
          AND status IN ('ISSUED', 'PDF_PENDING', 'IMPORTED')`,
      [from, to]
    )
    const registro = await pool.query<{
      categoria: string
      n: number
      suma: string
    }>(
      `SELECT categoria, COUNT(*)::int AS n, COALESCE(SUM(importe), 0) AS suma
         FROM facturas_registro
        WHERE anio = $1 AND mes = $2
        GROUP BY categoria
        ORDER BY categoria`,
      [anio, mes]
    )
    // gasto_facturas no tiene fecha propia del gasto → created_at como proxy
    // del período (mismo criterio que /api/admin/pre-cierre).
    const gastos = await pool.query<{ n: number; suma: string }>(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(importe), 0) AS suma
         FROM gasto_facturas
        WHERE created_at >= $1 AND created_at < $2`,
      [from, to]
    )

    const snapshot = {
      generado_at: new Date().toISOString(),
      facturas_emitidas: {
        count: emitidas.rows[0].n,
        suma: Number(emitidas.rows[0].suma),
      },
      facturas_registro: registro.rows.map((r) => ({
        categoria: r.categoria,
        count: r.n,
        suma: Number(r.suma),
      })),
      gastos: { count: gastos.rows[0].n, suma: Number(gastos.rows[0].suma) },
    }

    const res = await pool.query(
      `INSERT INTO periodos_contables (anio, mes, estado, snapshot, cerrado_at, cerrado_por)
       VALUES ($1, $2, 'cerrado', $3, NOW(), $4)
       ON CONFLICT (anio, mes) DO UPDATE
         SET estado = 'cerrado', snapshot = EXCLUDED.snapshot,
             cerrado_at = NOW(), cerrado_por = EXCLUDED.cerrado_por
       RETURNING *`,
      [anio, mes, JSON.stringify(snapshot), usuario]
    )

    return NextResponse.json({ ok: true, periodo: res.rows[0] })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
