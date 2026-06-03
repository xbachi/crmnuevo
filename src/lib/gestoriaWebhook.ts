/**
 * Best-effort notification to n8n so an issued sale invoice is filed into
 * OneDrive (1_Ventas) and the GESTORIA expediente (with the matching purchase
 * invoice). Fire-and-forget: never throws and is a no-op unless
 * N8N_INVOICE_WEBHOOK_URL is configured, so it can never block or break invoice
 * issuance.
 */

export interface GestoriaInvoicePayload {
  numeroFactura: string
  fechaISO: string // YYYY-MM-DD (used to derive trimestre + mes)
  matricula: string | null
  marca: string | null
  modelo: string | null
  tipo: string // 'VAT' | 'REBU' | ...
  pdfBase64: string
}

export async function notifyGestoriaInvoice(payload: GestoriaInvoicePayload): Promise<void> {
  const url = process.env.N8N_INVOICE_WEBHOOK_URL
  if (!url) return // feature disabled until configured

  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
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
      console.error(
        `[gestoriaWebhook] webhook returned ${res.status} for invoice ${payload.numeroFactura}`
      )
    }
  } catch (err) {
    console.error(
      `[gestoriaWebhook] notification failed for invoice ${payload.numeroFactura}:`,
      (err as Error)?.message ?? err
    )
  } finally {
    clearTimeout(timeout)
  }
}
