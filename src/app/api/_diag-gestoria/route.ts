import { NextResponse } from 'next/server'

/**
 * Diagnóstico temporal: confirma si las env vars del webhook de gestoría están
 * presentes en el deployment activo (sin exponer el secreto). Borrar tras usar.
 */
export async function GET() {
  const url = process.env.N8N_INVOICE_WEBHOOK_URL
  return NextResponse.json({
    urlSet: Boolean(url),
    secretSet: Boolean(process.env.N8N_INVOICE_WEBHOOK_SECRET),
    urlHost: url ? (() => { try { return new URL(url).host } catch { return 'invalid-url' } })() : null,
  })
}
