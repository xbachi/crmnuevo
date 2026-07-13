import { NextRequest, NextResponse, after } from 'next/server'
import { issueInvoice, InvoiceServiceError } from '@/lib/invoiceService'
import type { InvoiceType } from '@/lib/invoiceRepository'
import { requireApiSession } from '@/lib/apiAuth'

// PDF + subida al blob van inline (el usuario descarga la factura enseguida);
// el archivado en OneDrive y la hoja de costo/beneficio se ejecutan con after(),
// ya fuera del camino crítico pero dentro de la misma invocación.
export const maxDuration = 60

/**
 * POST /api/sales/{saleId}/invoice/issue
 *
 * Atomically reserves the next invoice number and creates an invoice row.
 * Idempotent: callers should pass an `Idempotency-Key` header (a UUID
 * generated on the first click). A repeated request with the same key
 * returns the same invoice instead of creating a second one.
 *
 * If an active invoice already exists for (saleId, invoiceType), this
 * endpoint also returns the existing invoice instead of creating a new
 * one — this protects against a missing/changed Idempotency-Key.
 *
 * Body: { invoiceType: 'VAT' | 'REBU', notes?: string }
 *
 * Response 200/201:
 *   { invoice, alreadyExisted: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  try {
    const { saleId: saleIdRaw } = await params
    const saleId = parseInt(saleIdRaw, 10)
    if (Number.isNaN(saleId)) {
      return NextResponse.json(
        { error: 'ID de venta inválido' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const invoiceType = (body?.invoiceType ?? 'VAT') as InvoiceType
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

    const { runNotifications, ...result } = await issueInvoice({
      dealId: saleId,
      invoiceType,
      idempotencyKey,
      notes: typeof body?.notes === 'string' ? body.notes : null,
      allowDuplicate: body?.allowDuplicate === true,
      deferNotifications: true,
      userId: String(auth.session.uid),
      userRole: auth.session.role,
    })

    // Fuera del camino crítico: la factura ya existe, ya tiene número fiscal y
    // ya tiene PDF. after() las corre cuando la respuesta ya salió.
    if (runNotifications) after(runNotifications)

    return NextResponse.json(result, {
      status: result.alreadyExisted ? 200 : 201,
    })
  } catch (err) {
    if (err instanceof InvoiceServiceError) {
      if (err.code === 'VEHICLE_ALREADY_INVOICED') {
        return NextResponse.json(
          { error: err.message, code: err.code, existing: err.details },
          { status: 409 }
        )
      }
      const status =
        err.code === 'SALE_NOT_FOUND'
          ? 404
          : err.code === 'NO_SEQUENCE' || err.code === 'PERIODO_CERRADO'
            ? 409
            : 400
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status }
      )
    }
    const e = err as { code?: string; constraint?: string; detail?: string }
    if (e?.code === '23505') {
      return NextResponse.json(
        {
          error:
            'Ya existe una factura con ese número. Otro usuario probablemente la emitió simultáneamente. Reintentá.',
          code: 'DUPLICATE',
          detail: e.detail,
        },
        { status: 409 }
      )
    }
    console.error('[issue]', err)
    return NextResponse.json(
      { error: 'Error interno emitiendo factura' },
      { status: 500 }
    )
  }
}
