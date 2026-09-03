/**
 * POST /api/admin/webhook-outbox/retry
 *
 * Reintenta el envío del webhook de gestoría para filas 'pendiente' de
 * webhook_outbox con intentos < max_intentos (C-23). Lo dispara el cron
 * diario /api/cron/costobeneficio (paso 3) o un humano.
 *
 * Protegido por X-Admin-Secret.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import {
  postGestoriaWebhook,
  type GestoriaInvoicePayload,
} from '@/lib/gestoriaWebhook'
import { markOutboxEnviado, markOutboxFallo } from '@/lib/webhookOutbox'
import { safeEqual } from '@/lib/secrets'

interface PendingRow {
  id: number
  payload: GestoriaInvoicePayload
  numero_factura: string | null
}

export async function POST(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-admin-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const pending = await pool.query<PendingRow>(
      `SELECT id, payload, numero_factura
         FROM webhook_outbox
        WHERE estado = 'pendiente' AND intentos < max_intentos
        ORDER BY created_at ASC`
    )

    let exitosas = 0
    let fallidas = 0
    const detalle: {
      id: number
      numeroFactura: string | null
      ok: boolean
      error: string | null
    }[] = []

    for (const row of pending.rows) {
      const result = await postGestoriaWebhook(row.payload)
      if (result.ok) {
        exitosas++
        await markOutboxEnviado(row.id)
      } else {
        fallidas++
        await markOutboxFallo(row.id, result.error ?? 'unknown error')
      }
      detalle.push({
        id: row.id,
        numeroFactura: row.numero_factura,
        ok: result.ok,
        error: result.error ?? null,
      })
    }

    return NextResponse.json({
      ok: fallidas === 0,
      reintentadas: pending.rows.length,
      exitosas,
      fallidas,
      detalle,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
