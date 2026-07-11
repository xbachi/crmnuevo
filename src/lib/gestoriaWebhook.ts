/**
 * Delivery to n8n so an issued sale invoice is filed into OneDrive and the
 * GESTORIA expediente. The throwing sender is used by the durable outbox; the
 * compatibility wrapper logs and swallows errors for legacy callers.
 */

export interface GestoriaInvoicePayload {
  eventId?: string
  numeroFactura: string
  fechaISO: string // YYYY-MM-DD (used to derive trimestre + mes)
  matricula: string | null
  marca: string | null
  modelo: string | null
  tipo: string // 'VAT' | 'REBU' | ...
  pdfBase64: string
}

export async function sendGestoriaInvoice(
  payload: GestoriaInvoicePayload
): Promise<void> {
  const url = process.env.N8N_INVOICE_WEBHOOK_URL
  if (!url) throw new Error('N8N_INVOICE_WEBHOOK_URL no configurado')

  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret) throw new Error('N8N_INVOICE_WEBHOOK_SECRET no configurado')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': secret,
        ...(payload.eventId ? { 'Idempotency-Key': payload.eventId } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(
        `webhook de gestoría respondió ${res.status} para ${payload.numeroFactura}`
      )
    }
  } catch (err) {
    console.error(
      `[gestoriaWebhook] notification failed for invoice ${payload.numeroFactura}:`,
      (err as Error)?.message ?? err
    )
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

export async function notifyGestoriaInvoice(
  payload: GestoriaInvoicePayload
): Promise<void> {
  try {
    await sendGestoriaInvoice(payload)
  } catch (err) {
    console.error(
      `[gestoriaWebhook] notification failed for invoice ${payload.numeroFactura}:`,
      (err as Error)?.message ?? err
    )
  }
}
