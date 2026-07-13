/**
 * Puente con el receptor de renombrado del server (Hetzner): el CRM (Vercel) no
 * ve el mount rclone de OneDrive, así que decide QUÉ renombrar y el server lo
 * ejecuta. Mismo patrón que gestoriaWebhook: POST + X-Webhook-Secret.
 *
 * El receptor (scripts/rename_expediente_files.js) verifica el hash antes de
 * tocar nada y devuelve el resultado de CADA operación: el CRM lo guarda en
 * expedientes_renombres (traza reversible: nombre viejo → nombre nuevo).
 */

export interface OperacionRenombre {
  mes: string
  carpeta: string
  de: string
  a: string
  /** md5 esperado del archivo origen (del snapshot). Si no coincide, el server no toca nada. */
  hash: string | null
}

export interface OperacionBorrado {
  mes: string
  carpeta: string
  nombre: string
  hash: string | null
  /** archivo con el mismo contenido que sí se conserva */
  duplicadoDe: string
}

export interface RenombrePayload {
  anio: number
  trimestre: number
  renombrar: OperacionRenombre[]
  borrar: OperacionBorrado[]
}

export interface ResultadoOperacion {
  carpeta: string
  nombre: string
  destino?: string | null
  accion: 'renombrado' | 'borrado' | 'omitido'
  ok: boolean
  motivo?: string | null
}

export interface RenombreResult {
  ok: boolean
  status?: number
  error?: string
  resultados?: ResultadoOperacion[]
}

/**
 * URL del webhook de renombrado. Si no está seteada explícitamente se deriva de
 * la del webhook de facturas (mismo n8n, otro path) para no depender de una
 * variable nueva en Vercel: .../webhook/factura-venta → .../webhook/rename-expedientes
 */
export function renombreWebhookUrl(): string | null {
  const explicita = process.env.N8N_RENAME_WEBHOOK_URL
  if (explicita) return explicita
  const facturas = process.env.N8N_INVOICE_WEBHOOK_URL
  if (!facturas) return null
  try {
    const u = new URL(facturas)
    u.pathname = u.pathname.replace(/[^/]+$/, 'rename-expedientes')
    return u.toString()
  } catch {
    return null
  }
}

export async function postRenombreWebhook(payload: RenombrePayload): Promise<RenombreResult> {
  const url = renombreWebhookUrl()
  if (!url) {
    return { ok: false, error: 'sin webhook de renombrado (N8N_RENAME_WEBHOOK_URL / N8N_INVOICE_WEBHOOK_URL)' }
  }

  const secret =
    process.env.N8N_RENAME_WEBHOOK_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const controller = new AbortController()
  // El mount rclone es lento: un trimestre entero puede tardar bastante más que
  // los 6s del webhook de facturas.
  const timeout = setTimeout(() => controller.abort(), 40_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': secret },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const body = (await res.json().catch(() => ({}))) as { resultados?: ResultadoOperacion[]; error?: string }
    if (!res.ok) {
      return { ok: false, status: res.status, error: body?.error ?? `webhook returned ${res.status}` }
    }
    return { ok: true, status: res.status, resultados: body?.resultados ?? [] }
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? String(err) }
  } finally {
    clearTimeout(timeout)
  }
}
