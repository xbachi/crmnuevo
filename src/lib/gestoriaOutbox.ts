import type { PoolClient } from 'pg'
import { pool } from '@/lib/direct-database'
import { sendGestoriaInvoice } from '@/lib/gestoriaWebhook'
import type { Invoice } from '@/lib/invoiceRepository'

const MAX_ATTEMPTS = 8

interface ClaimedEvent {
  id: string
  dedupe_key: string
  invoice_id: number
  attempts: number
  payload_json: InvoiceDeliveryData
}

interface InvoiceDeliveryData {
  full_invoice_number: string
  invoice_date: string
  invoice_type: string
  vehicle_plate: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  pdf_url: string
}

export function nextOutboxAttempt(attempts: number, now = new Date()): Date {
  const minutes = Math.min(2 ** Math.max(0, attempts - 1), 360)
  return new Date(now.getTime() + minutes * 60_000)
}

export async function enqueueGestoriaInvoice(
  client: PoolClient,
  invoiceId: number
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO webhook_outbox
       (event_type, dedupe_key, invoice_id, payload_json)
     SELECT 'GESTORIA_INVOICE', $1, i.id,
            jsonb_build_object(
              'full_invoice_number', i.full_invoice_number,
              'invoice_date', i.invoice_date::text,
              'invoice_type', i.invoice_type,
              'vehicle_plate', i.vehicle_plate,
              'vehicle_make', i.vehicle_make,
              'vehicle_model', i.vehicle_model,
              'pdf_url', i.pdf_url
            )
       FROM invoices i
     WHERE i.id = $2 AND i.status = 'ISSUED' AND i.pdf_url IS NOT NULL
     ON CONFLICT (dedupe_key)
       DO UPDATE SET
         payload_json = CASE
           WHEN webhook_outbox.status <> 'DELIVERED' THEN EXCLUDED.payload_json
           ELSE webhook_outbox.payload_json
         END,
         status = CASE
           WHEN webhook_outbox.status = 'DEAD' THEN 'PENDING'
           ELSE webhook_outbox.status
         END,
         attempts = CASE
           WHEN webhook_outbox.status = 'DEAD' THEN 0
           ELSE webhook_outbox.attempts
         END,
         next_attempt_at = CASE
           WHEN webhook_outbox.status = 'DEAD' THEN NOW()
           ELSE webhook_outbox.next_attempt_at
         END,
         last_error = CASE
           WHEN webhook_outbox.status = 'DEAD' THEN NULL
           ELSE webhook_outbox.last_error
         END,
         updated_at = NOW()
     RETURNING id::text AS id`,
    [`gestoria:invoice:${invoiceId}`, invoiceId]
  )
  if (!result.rows[0]) {
    throw new Error(`factura ${invoiceId} no disponible para encolar`)
  }
  return result.rows[0].id
}

export async function persistIssuedInvoiceAndEnqueue(
  invoiceId: number,
  pdfUrl: string,
  pdfStorageKey: string,
  regenerated = false
): Promise<{ invoice: Invoice; outboxId: string }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const updated = await client.query<Invoice>(
      `UPDATE invoices
          SET pdf_url = $1, pdf_storage_key = $2,
              pdf_generated_at = NOW(),
              pdf_regenerated_at = CASE WHEN $4 THEN NOW() ELSE pdf_regenerated_at END,
              status = 'ISSUED', updated_at = NOW()
        WHERE id = $3
        RETURNING *`,
      [pdfUrl, pdfStorageKey, invoiceId, regenerated]
    )
    if (updated.rows.length !== 1) {
      throw new Error(`factura ${invoiceId} no disponible para emisión`)
    }
    const outboxId = await enqueueGestoriaInvoice(client, invoiceId)
    await client.query('COMMIT')
    return { invoice: updated.rows[0], outboxId }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function claimEvents(limit: number, eventId?: string) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<ClaimedEvent>(
      `SELECT id::text AS id, dedupe_key, invoice_id, attempts, payload_json
         FROM webhook_outbox
        WHERE event_type = 'GESTORIA_INVOICE'
          AND ($2::bigint IS NULL OR id = $2::bigint)
          AND (
            (status = 'PENDING' AND next_attempt_at <= NOW())
            OR (status = 'PROCESSING' AND updated_at < NOW() - INTERVAL '10 minutes')
          )
        ORDER BY next_attempt_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [limit, eventId ?? null]
    )
    for (const event of result.rows) {
      await client.query(
        `UPDATE webhook_outbox
            SET status = 'PROCESSING', attempts = attempts + 1,
                updated_at = NOW(), last_error = NULL
          WHERE id = $1`,
        [event.id]
      )
      event.attempts += 1
    }
    await client.query('COMMIT')
    return result.rows
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function fetchPdfBase64(invoice: InvoiceDeliveryData): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(invoice.pdf_url, { signal: controller.signal })
    if (!response.ok)
      throw new Error(`descarga PDF respondió ${response.status}`)
    return Buffer.from(await response.arrayBuffer()).toString('base64')
  } finally {
    clearTimeout(timeout)
  }
}

async function markDelivered(event: ClaimedEvent) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const eventUpdate = await client.query(
      `UPDATE webhook_outbox
          SET status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'PROCESSING' AND attempts = $2`,
      [event.id, event.attempts]
    )
    if (eventUpdate.rowCount !== 1) {
      throw new Error(`lease perdido para evento ${event.id}`)
    }
    await client.query(
      `UPDATE invoices SET gestoria_notified_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [event.invoice_id]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function markFailed(event: ClaimedEvent, error: unknown) {
  const dead = event.attempts >= MAX_ATTEMPTS
  await pool.query(
    `UPDATE webhook_outbox
        SET status = $1, next_attempt_at = $2, last_error = $3, updated_at = NOW()
      WHERE id = $4 AND status = 'PROCESSING' AND attempts = $5`,
    [
      dead ? 'DEAD' : 'PENDING',
      nextOutboxAttempt(event.attempts),
      (error as Error)?.message ?? String(error),
      event.id,
      event.attempts,
    ]
  )
}

export async function processGestoriaOutbox(
  options: {
    limit?: number
    eventId?: string
  } = {}
) {
  const events = await claimEvents(
    Math.min(Math.max(options.limit ?? 10, 1), 25),
    options.eventId
  )
  let delivered = 0
  let failed = 0

  for (const event of events) {
    try {
      const invoice = event.payload_json
      const pdfBase64 = await fetchPdfBase64(invoice)
      await sendGestoriaInvoice({
        eventId: event.dedupe_key,
        numeroFactura: invoice.full_invoice_number,
        fechaISO: invoice.invoice_date,
        matricula: invoice.vehicle_plate,
        marca: invoice.vehicle_make,
        modelo: invoice.vehicle_model,
        tipo: invoice.invoice_type,
        pdfBase64,
      })
      await markDelivered(event)
      delivered += 1
    } catch (error) {
      await markFailed(event, error)
      failed += 1
    }
  }

  return { claimed: events.length, delivered, failed }
}
