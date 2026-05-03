import { NextRequest, NextResponse } from 'next/server'
import { previewInvoice, InvoiceServiceError } from '@/lib/invoiceService'
import type { InvoiceType } from '@/lib/invoiceRepository'

/**
 * POST /api/sales/{saleId}/invoice/preview
 *
 * Returns the data that the issuance flow would assemble, including the
 * tentative next invoice number, WITHOUT consuming it. Safe to call as
 * many times as the user wants.
 *
 * Body: { invoiceType: 'VAT' | 'REBU' }
 */
// TODO: replace placeholder auth with real server-side auth (Task 2)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  try {
    const { saleId: saleIdRaw } = await params
    const saleId = parseInt(saleIdRaw, 10)
    if (Number.isNaN(saleId)) {
      return NextResponse.json({ error: 'ID de venta inválido' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const invoiceType = (body?.invoiceType ?? 'VAT') as InvoiceType
    if (!['VAT', 'REBU'].includes(invoiceType)) {
      return NextResponse.json(
        { error: 'invoiceType debe ser VAT o REBU' },
        { status: 400 }
      )
    }

    const preview = await previewInvoice(saleId, invoiceType)
    return NextResponse.json(preview)
  } catch (err) {
    if (err instanceof InvoiceServiceError) {
      const status = err.code === 'SALE_NOT_FOUND' ? 404 : 400
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    console.error('[preview]', err)
    return NextResponse.json(
      { error: 'Error interno generando vista previa' },
      { status: 500 }
    )
  }
}
