/**
 * Best-effort notification to n8n so an issued sale invoice is filed into
 * OneDrive (1_Ventas) and the GESTORIA expediente (with the matching purchase
 * invoice). Fire-and-forget: never throws and is a no-op unless
 * N8N_INVOICE_WEBHOOK_URL is configured, so it can never block or break invoice
 * issuance.
 *
 * C-23: every send attempt is recorded in `webhook_outbox` (pendiente →
 * enviado/agotado) so a failed or never-delivered webhook leaves a trace,
 * instead of only a console.error nobody sees. See src/lib/webhookOutbox.ts
 * and POST /api/admin/webhook-outbox/retry.
 */

import { insertOutboxPending, markOutboxEnviado, markOutboxFallo } from '@/lib/webhookOutbox'

export interface GestoriaInvoicePayload {
  numeroFactura: string
  fechaISO: string // YYYY-MM-DD (used to derive trimestre + mes)
  matricula: string | null
  marca: string | null
  modelo: string | null
  tipo: string // 'VAT' | 'REBU' | ...
  pdfBase64: string
}

export interface WebhookSendResult {
  ok: boolean
  status?: number
  error?: string
}

/** Raw POST to the n8n webhook. No outbox bookkeeping — shared by
 *  notifyGestoriaInvoice() and the admin retry endpoint. */
export async function postGestoriaWebhook(
  payload: GestoriaInvoicePayload
): Promise<WebhookSendResult> {
  const url = process.env.N8N_INVOICE_WEBHOOK_URL
  if (!url) return { ok: false, error: 'N8N_INVOICE_WEBHOOK_URL no configurada' }

  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      return { ok: false, status: res.status, error: `webhook returned ${res.status}` }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? String(err) }
  } finally {
    clearTimeout(timeout)
  }
}

export async function notifyGestoriaInvoice(payload: GestoriaInvoicePayload): Promise<void> {
  const url = process.env.N8N_INVOICE_WEBHOOK_URL
  if (!url) return // feature disabled until configured

  const outboxId = await insertOutboxPending('factura_venta', payload, payload.numeroFactura)
  const result = await postGestoriaWebhook(payload)

  if (result.ok) {
    if (outboxId) await markOutboxEnviado(outboxId)
    return
  }

  console.error(
    `[gestoriaWebhook] notification failed for invoice ${payload.numeroFactura}:`,
    result.error
  )
  if (outboxId) await markOutboxFallo(outboxId, result.error ?? 'unknown error')
}
