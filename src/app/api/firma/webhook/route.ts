/**
 * POST /api/firma/webhook — eventos del proveedor de firma (Signaturit).
 * En la whitelist del middleware (el proveedor no tiene sesión).
 *
 * Validación: Signaturit v3 no firma sus webhooks, así que se exige
 * SIGNATURIT_WEBHOOK_SECRET como shared secret en el header X-Firma-Secret o
 * en el query param ?secret= (configurable en la URL del webhook del panel de
 * Signaturit). Si NO está seteado, se responde 503 y no se procesa nada.
 *
 * Body (Signaturit manda variantes según evento): {
 *   type | event_type: 'document_completed' | 'audit_trail_completed' |
 *                      'document_canceled' | 'document_declined' | 'document_expired' | ...,
 *   signature?: { id }, id?, document?: { id, file?, status? }
 * }
 *
 * Actualiza firma_solicitudes por solicitud_id. Si el evento es de completado,
 * guarda la referencia del documento firmado en pdf_firmado_ruta.
 * TODO(n8n): la descarga real del PDF firmado y su archivado a OneDrive los
 * hace n8n después (el CRM en Vercel no accede a OneDrive); n8n puede leer
 * firma_solicitudes con estado 'completada' y pdf_firmado_ruta pendiente.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'

const EVENTOS_COMPLETADO = [
  'document_completed',
  'audit_trail_completed',
  'signature_completed',
]
const EVENTOS_CANCELADO = [
  'document_canceled',
  'document_declined',
  'document_expired',
  'signature_canceled',
]

export async function POST(request: NextRequest) {
  const secret = process.env.SIGNATURIT_WEBHOOK_SECRET ?? ''
  if (!secret) {
    return NextResponse.json(
      { error: 'Webhook de firma no configurado' },
      { status: 503 }
    )
  }
  const got =
    request.headers.get('x-firma-secret') ??
    new URL(request.url).searchParams.get('secret') ??
    ''
  if (!safeEqual(got, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const signature = (b.signature ?? {}) as Record<string, unknown>
  const documento = (b.document ?? {}) as Record<string, unknown>
  const solicitudId = String(signature.id ?? b.id ?? '').trim()
  const evento = String(b.type ?? b.event_type ?? '').trim()

  if (!solicitudId) {
    return NextResponse.json(
      { error: 'evento sin id de solicitud' },
      { status: 400 }
    )
  }

  let estado: string | null = null
  if (EVENTOS_COMPLETADO.includes(evento)) estado = 'completada'
  else if (EVENTOS_CANCELADO.includes(evento)) estado = 'cancelada'

  // Referencia del documento firmado (id/file del documento en Signaturit);
  // n8n la usa para descargar y archivar el PDF.
  const pdfRuta =
    estado === 'completada'
      ? String(documento.file ?? documento.id ?? '').trim() || null
      : null

  try {
    const upd = await pool.query(
      `UPDATE firma_solicitudes
          SET estado = COALESCE($2, estado),
              pdf_firmado_ruta = COALESCE($3, pdf_firmado_ruta),
              ultimo_evento = $4,
              updated_at = NOW()
        WHERE solicitud_id = $1
        RETURNING id, deal_id, estado`,
      [solicitudId, estado, pdfRuta, JSON.stringify(b)]
    )
    if (upd.rows.length === 0) {
      // Evento de una solicitud que no registramos: 200 igual para que el
      // proveedor no reintente infinito, pero avisamos.
      console.warn(
        `[firma/webhook] solicitud desconocida: ${solicitudId} (${evento})`
      )
      return NextResponse.json({ ok: true, conocida: false })
    }
    return NextResponse.json({ ok: true, conocida: true, ...upd.rows[0] })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? String(err) },
      { status: 500 }
    )
  }
}
