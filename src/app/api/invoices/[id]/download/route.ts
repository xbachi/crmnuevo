import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { getInvoiceById } from '@/lib/invoiceRepository'

/**
 * GET /api/invoices/{id}/download
 *
 * Redirects to the PDF stored on Vercel Blob, and audit-logs the download.
 * Returns 409 if the invoice has no PDF yet (status=PDF_PENDING/ERROR/IMPORTED).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idRaw } = await params
    const id = parseInt(idRaw, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }
    const invoice = await getInvoiceById(id)
    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }
    if (!invoice.pdf_url) {
      return NextResponse.json(
        {
          error:
            'Esta factura todavía no tiene PDF disponible. Probá regenerarlo desde el detalle.',
          code: 'NO_PDF',
        },
        { status: 409 }
      )
    }

    // Fire-and-forget audit log (do not block the redirect)
    pool
      .query(
        `INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json)
         VALUES ($1, 'DOWNLOADED', $2)`,
        [invoice.id, JSON.stringify({ at: new Date().toISOString() })]
      )
      .catch((e) => console.error('[download audit]', e))

    return NextResponse.redirect(invoice.pdf_url, 302)
  } catch (err) {
    console.error('[invoice download]', err)
    return NextResponse.json(
      { error: 'Error al descargar factura' },
      { status: 500 }
    )
  }
}
