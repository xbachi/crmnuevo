/**
 * Bookkeeping for `webhook_outbox` (see create-webhook-outbox.sql).
 *
 * C-23: notifyGestoriaInvoice() has no retry and, until now, no trace of a
 * failed send. These helpers make every send attempt leave a row behind —
 * 'pendiente' on insert, 'enviado' on success, incremented intentos +
 * ultimo_error (and 'agotado' once max_intentos is hit) on failure.
 *
 * All functions swallow their own errors (never throw): outbox bookkeeping
 * must never be the reason an invoice-issuance request fails.
 */

import { pool } from '@/lib/direct-database'

export type OutboxEstado = 'pendiente' | 'enviado' | 'agotado'

export interface WebhookOutboxRow {
  id: number
  tipo: string
  payload: unknown
  numero_factura: string | null
  intentos: number
  max_intentos: number
  estado: OutboxEstado
  ultimo_error: string | null
  created_at: string
  updated_at: string
  enviado_at: string | null
}

export async function insertOutboxPending(
  tipo: string,
  payload: unknown,
  numeroFactura: string | null
): Promise<number | null> {
  try {
    const res = await pool.query<{ id: number }>(
      `INSERT INTO webhook_outbox (tipo, payload, numero_factura, estado)
       VALUES ($1, $2, $3, 'pendiente')
       RETURNING id`,
      [tipo, JSON.stringify(payload), numeroFactura]
    )
    return res.rows[0]?.id ?? null
  } catch (err) {
    console.error('[webhookOutbox] insert failed:', (err as Error)?.message ?? err)
    return null
  }
}

export async function markOutboxEnviado(id: number): Promise<void> {
  try {
    await pool.query(
      `UPDATE webhook_outbox
          SET estado = 'enviado', enviado_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [id]
    )
  } catch (err) {
    console.error('[webhookOutbox] mark enviado failed:', (err as Error)?.message ?? err)
  }
}

/**
 * Records a failed attempt: intentos += 1, ultimo_error set, and estado
 * flips to 'agotado' once intentos reaches max_intentos (otherwise stays
 * 'pendiente' so it's picked up by the retry endpoint).
 */
export async function markOutboxFallo(id: number, error: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE webhook_outbox
          SET intentos = intentos + 1,
              ultimo_error = $2,
              estado = CASE WHEN intentos + 1 >= max_intentos THEN 'agotado' ELSE 'pendiente' END,
              updated_at = NOW()
        WHERE id = $1`,
      [id, error]
    )
  } catch (err) {
    console.error('[webhookOutbox] mark fallo failed:', (err as Error)?.message ?? err)
  }
}
