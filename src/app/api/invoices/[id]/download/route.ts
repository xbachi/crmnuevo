import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { getInvoiceById } from '@/lib/invoiceRepository'

/**
 * GET /api/invoices/{id}/download
 *
 * Proxies the PDF stored on Vercel Blob with a friendly Content-Disposition
 * filename and audit-logs the download. Proxying (instead of redirecting)
 * gives us full control over the saved filename and avoids any CORS edge
 * cases when the frontend does a `fetch()` for blob-based downloads.
 * Returns 409 if the invoice has no PDF yet (PDF_PENDING/ERROR/IMPORTED).
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

    const blobRes = await fetch(invoice.pdf_url)
    if (!blobRes.ok || !blobRes.body) {
      console.error(
        '[invoice download] blob fetch failed',
        invoice.pdf_url,
        blobRes.status
      )
      return NextResponse.json(
        { error: 'No se pudo recuperar el PDF de la factura.' },
        { status: 502 }
      )
    }

    // Fire-and-forget audit log (no bloquea la respuesta).
    pool
      .query(
        `INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json)
         VALUES ($1, 'DOWNLOADED', $2)`,
        [invoice.id, JSON.stringify({ at: new Date().toISOString() })]
      )
      .catch((e) => console.error('[download audit]', e))

    const filename = `factura-${invoice.full_invoice_number}.pdf`
    return new NextResponse(blobRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[invoice download]', err)
    return NextResponse.json(
      { error: 'Error al descargar factura' },
      { status: 500 }
    )
  }
}
