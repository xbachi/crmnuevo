/**
 * POST /api/invoices/{id}/rectificar   body: { motivo }
 *
 * Anulación FORMAL de una factura mal emitida: emite una rectificativa
 * (serie FR, importe negativo) que referencia a la original. La original NO se
 * borra ni cambia de importe — conserva su número (cero huecos de numeración)
 * y pasa a status 'RECTIFIED'.
 *
 * Camino recomendado frente al DELETE (hard delete, sólo PDF_PENDING/ERROR que
 * nunca salieron) y frente a /anular (VOID, sin documento rectificativo).
 *
 * Admin. Idempotente: rectificar dos veces → 409 con el número de la
 * rectificativa que ya existe. Período contable cerrado → 409 PERIODO_CERRADO.
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { requireAdminSession } from '@/lib/apiAuth'
import { rectificarFactura, RectificarError } from '@/lib/invoiceRectificativa'

// El PDF de la FR y el re-sellado de la original van inline (el usuario los
// descarga enseguida); el archivado en OneDrive/gestoría, con after().
export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response

  const { id: idRaw } = await params
  const id = parseInt(idRaw, 10)
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))

  try {
    const { rectificativa, original, runNotifications } = await rectificarFactura({
      invoiceId: id,
      motivo: body?.motivo,
      userId: String(auth.session.uid),
      userRole: auth.session.role,
      deferNotifications: true,
    })

    if (runNotifications) after(runNotifications)

    return NextResponse.json({
      ok: true,
      rectificativa: {
        id: rectificativa.id,
        full_invoice_number: rectificativa.full_invoice_number,
        total_amount: rectificativa.total_amount,
        invoice_date: rectificativa.invoice_date,
        status: rectificativa.status,
        pdf_url: rectificativa.pdf_url,
      },
      original: {
        id: original.id,
        full_invoice_number: original.full_invoice_number,
        status: original.status,
      },
      // El PDF es best-effort: si falló, la FR queda en PDF_PENDING (número ya
      // reservado) y se repara con POST /api/admin/rectificativas-pdf.
      pdf_pendiente: rectificativa.status === 'PDF_PENDING',
    })
  } catch (err) {
    if (err instanceof RectificarError) {
      return NextResponse.json(
        { error: err.message, code: err.code, ...(err.details ?? {}) },
        { status: err.httpStatus }
      )
    }
    console.error('[POST /api/invoices/[id]/rectificar]', err)
    return NextResponse.json(
      { error: 'Error interno emitiendo la factura rectificativa.' },
      { status: 500 }
    )
  }
}
