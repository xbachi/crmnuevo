/**
 * POST /api/admin/rectificar-factura   body: { invoiceId, motivo, confirm: true }
 * Header: X-Admin-Secret
 *
 * Misma operación que POST /api/invoices/{id}/rectificar (que exige sesión de
 * admin desde la UI), pero accesible con el secreto de administración para
 * poder ejecutarla desde un script/operación puntual. Reusa exactamente la
 * misma transacción (rectificarFactura): no hay una segunda implementación de
 * la lógica fiscal.
 *
 * Exige `confirm: true` en el body: emitir una rectificativa consume número
 * fiscal y no es reversible, así que no puede dispararse por accidente.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rectificarFactura, RectificarError } from '@/lib/invoiceRectificativa'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-admin-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const invoiceId = parseInt(String(body?.invoiceId ?? ''), 10)
  if (Number.isNaN(invoiceId)) {
    return NextResponse.json({ error: 'invoiceId inválido' }, { status: 400 })
  }
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: 'Falta confirm: true (la rectificativa consume número fiscal)' },
      { status: 400 }
    )
  }

  try {
    const { rectificativa, original } = await rectificarFactura({
      invoiceId,
      motivo: body?.motivo,
      userId: 'admin-secret',
      userRole: 'admin',
    })
    return NextResponse.json({
      ok: true,
      rectificativa: {
        id: rectificativa.id,
        numero: rectificativa.full_invoice_number,
        importe: rectificativa.total_amount,
        status: rectificativa.status,
      },
      original: {
        id: original.id,
        numero: original.full_invoice_number,
        status: original.status,
      },
    })
  } catch (e) {
    if (e instanceof RectificarError) {
      return NextResponse.json(
        { error: e.message, code: e.code, details: e.details },
        { status: e.httpStatus }
      )
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
