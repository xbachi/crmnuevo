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

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/apiAuth'
import { rectificarFactura, RectificarError } from '@/lib/invoiceRectificativa'

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
    const { rectificativa, original } = await rectificarFactura({
      invoiceId: id,
      motivo: body?.motivo,
      userId: String(auth.session.uid),
      userRole: auth.session.role,
    })

    return NextResponse.json({
      ok: true,
      rectificativa: {
        id: rectificativa.id,
        full_invoice_number: rectificativa.full_invoice_number,
        total_amount: rectificativa.total_amount,
        invoice_date: rectificativa.invoice_date,
        status: rectificativa.status,
      },
      original: {
        id: original.id,
        full_invoice_number: original.full_invoice_number,
        status: original.status,
      },
      // El PDF de la rectificativa todavía no se genera (el generador sólo
      // entiende IVA/REBU en positivo): la fila queda en PDF_PENDING.
      pdf_pendiente: true,
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
