import { NextRequest, NextResponse } from 'next/server'
import { regeneratePdf, InvoiceServiceError } from '@/lib/invoiceService'

/**
 * POST /api/invoices/{id}/regenerate-pdf
 *
 * Regenerates the PDF for an existing invoice using the stored snapshot.
 * Does NOT consume a sequence number, NOT change the invoice number, and
 * NOT modify any accounting amounts.
 *
 * Body: { reason: string }   (required, min 3 chars)
 */
// TODO: replace placeholder auth with real server-side auth (Task 2)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idRaw } = await params
    const id = parseInt(idRaw, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    const updated = await regeneratePdf(id, reason)
    return NextResponse.json({ invoice: updated })
  } catch (err) {
    if (err instanceof InvoiceServiceError) {
      const status =
        err.code === 'NOT_FOUND'
          ? 404
          : err.code === 'REASON_REQUIRED' || err.code === 'INVALID_STATUS'
            ? 400
            : 500
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status }
      )
    }
    console.error('[regenerate-pdf]', err)
    return NextResponse.json(
      { error: 'Error al regenerar PDF' },
      { status: 500 }
    )
  }
}
