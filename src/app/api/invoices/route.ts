import { NextRequest, NextResponse } from 'next/server'
import { listInvoices } from '@/lib/invoiceRepository'
import type { InvoiceStatus, InvoiceType } from '@/lib/invoiceRepository'

/**
 * GET /api/invoices
 *
 * Paginated list of issued invoices with filters. Default sort: invoice_date
 * descending — what the gestor wants when they open "Historial".
 *
 * Query params:
 *   search       — substring match in full_invoice_number / buyer / plate / NIF
 *   invoiceType  — VAT | REBU | RECTIFYING
 *   year         — integer (matches invoice_date year)
 *   status       — ISSUED | PDF_PENDING | ERROR | VOIDED | RECTIFIED | IMPORTED
 *   dealId       — restrict to a single sale
 *   page         — 1-indexed
 *   pageSize     — default 50, max 200
 *   sortBy       — invoice_date | number | total_amount | created_at
 *   sortDir      — asc | desc
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const sp = url.searchParams

    const result = await listInvoices({
      search: sp.get('search') ?? undefined,
      invoiceType: (sp.get('invoiceType') as InvoiceType) ?? undefined,
      year: sp.get('year') ? parseInt(sp.get('year')!, 10) : undefined,
      status: (sp.get('status') as InvoiceStatus) ?? undefined,
      dealId: sp.get('dealId') ? parseInt(sp.get('dealId')!, 10) : undefined,
      vehiculoId: sp.get('vehiculoId')
        ? parseInt(sp.get('vehiculoId')!, 10)
        : undefined,
      page: sp.get('page') ? parseInt(sp.get('page')!, 10) : undefined,
      pageSize: sp.get('pageSize')
        ? parseInt(sp.get('pageSize')!, 10)
        : undefined,
      sortBy:
        (sp.get('sortBy') as 'invoice_date' | 'number' | 'total_amount' | 'created_at') ??
        undefined,
      sortDir: sp.get('sortDir') === 'asc' ? 'asc' : 'desc',
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[invoices list]', err)
    return NextResponse.json(
      { error: 'Error al cargar facturas' },
      { status: 500 }
    )
  }
}
