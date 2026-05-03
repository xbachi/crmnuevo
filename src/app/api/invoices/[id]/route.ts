import { NextRequest, NextResponse } from 'next/server'
import { getInvoiceById, getAuditLogsForInvoice } from '@/lib/invoiceRepository'

/**
 * GET /api/invoices/{id}
 *
 * Returns the invoice + its audit log entries.
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
    const auditLogs = await getAuditLogsForInvoice(id)
    return NextResponse.json({ invoice, auditLogs })
  } catch (err) {
    console.error('[invoice detail]', err)
    return NextResponse.json(
      { error: 'Error al cargar factura' },
      { status: 500 }
    )
  }
}
