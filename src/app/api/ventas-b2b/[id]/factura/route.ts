import { NextRequest, NextResponse } from 'next/server'
import { issueInvoiceForB2B } from '@/lib/b2b-invoice-service'
import { InvoiceServiceError } from '@/lib/invoiceService'
import type { InvoiceType } from '@/lib/invoiceRepository'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'

/**
 * POST /api/ventas-b2b/{id}/factura
 * Emite factura fiscal (default REBU) para una venta B2B y la sube a Blob.
 *
 * GET /api/ventas-b2b/{id}/factura
 * Devuelve el PDF proxeado de la factura ya emitida para esta venta B2B.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  try {
    const { id: raw } = await params
    const ventaB2BId = parseInt(raw, 10)
    if (Number.isNaN(ventaB2BId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))
    const invoiceType = (body?.invoiceType ?? 'REBU') as InvoiceType
    if (!['VAT', 'REBU'].includes(invoiceType)) {
      return NextResponse.json(
        { error: 'invoiceType debe ser VAT o REBU' },
        { status: 400 }
      )
    }
    const idempotencyKey =
      request.headers.get('Idempotency-Key') ||
      request.headers.get('idempotency-key') ||
      null

    const result = await issueInvoiceForB2B({
      ventaB2BId,
      invoiceType,
      idempotencyKey,
    })
    return NextResponse.json(result, {
      status: result.alreadyExisted ? 200 : 201,
    })
  } catch (err) {
    if (err instanceof InvoiceServiceError) {
      const status =
        err.code === 'SALE_NOT_FOUND'
          ? 404
          : err.code === 'NO_SEQUENCE'
            ? 409
            : 400
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status }
      )
    }
    console.error('[POST /api/ventas-b2b/[id]/factura]', err)
    return NextResponse.json(
      { error: 'Error interno emitiendo factura B2B' },
      { status: 500 }
    )
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raw } = await params
    const ventaB2BId = parseInt(raw, 10)
    if (Number.isNaN(ventaB2BId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }
    const { rows } = await pool.query<{
      id: number
      full_invoice_number: string
      pdf_url: string | null
    }>(
      `SELECT id, full_invoice_number, pdf_url
         FROM invoices
        WHERE b2b_venta_id = $1 AND status <> 'VOIDED'
        ORDER BY id DESC LIMIT 1`,
      [ventaB2BId]
    )
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: 'No hay factura emitida para esta venta B2B',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      )
    }
    const inv = rows[0]
    if (!inv.pdf_url) {
      return NextResponse.json(
        {
          error: 'El PDF aún no está disponible (pendiente de generación).',
          code: 'NO_PDF',
        },
        { status: 409 }
      )
    }
    const blobRes = await fetch(inv.pdf_url)
    if (!blobRes.ok || !blobRes.body) {
      return NextResponse.json(
        { error: 'No se pudo recuperar el PDF de la factura' },
        { status: 502 }
      )
    }
    return new NextResponse(blobRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="factura-${inv.full_invoice_number}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/ventas-b2b/[id]/factura]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
