/**
 * POST /api/admin/convertir-regimen   body: { invoiceId, target: 'REBU'|'VAT', confirm: true }
 * Header: X-Admin-Secret
 *
 * Convierte una factura de venta ya emitida de IVA a REBU (o viceversa) EN EL
 * LUGAR, conservando el mismo número, sin emitir rectificativa. Caso: una
 * factura emitida con IVA general cuyo coche se compró a un particular (debe ser
 * REBU) y que AÚN NO se entregó.
 *
 * Seguro para la cadena Verifactu-lite: no cambia el total_amount (sólo el
 * desglose), así que no toca `facturacion_registros`. Ver invoiceConvertRegimen.
 *
 * Exige `confirm: true`: reescribe una factura fiscal ya emitida.
 */

import { NextRequest, NextResponse, after } from 'next/server'
import {
  convertirRegimen,
  ConvertirError,
} from '@/lib/invoiceConvertRegimen'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-admin-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const invoiceId = parseInt(String(body?.invoiceId ?? ''), 10)
  if (Number.isNaN(invoiceId)) {
    return NextResponse.json({ error: 'invoiceId inválido' }, { status: 400 })
  }
  const target = body?.target
  if (target !== 'REBU' && target !== 'VAT') {
    return NextResponse.json(
      { error: "target inválido (esperado 'REBU' o 'VAT')" },
      { status: 400 }
    )
  }
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: 'Falta confirm: true (reescribe una factura ya emitida)' },
      { status: 400 }
    )
  }

  try {
    const result = await convertirRegimen({
      invoiceId,
      target,
      userId: 'admin-secret',
      userRole: 'admin',
      deferNotifications: true,
    })
    if (result.runNotifications) after(result.runNotifications)

    const inv = result.invoice
    return NextResponse.json({
      ok: true,
      sinCambios: result.sinCambios,
      invoice: {
        id: inv.id,
        numero: inv.full_invoice_number,
        invoice_type: inv.invoice_type,
        total: inv.total_amount,
        taxable_base: inv.taxable_base,
        vat_amount: inv.vat_amount,
        rebu_margin: inv.rebu_margin,
        rebu_taxable_base: inv.rebu_taxable_base,
        rebu_vat_amount: inv.rebu_vat_amount,
        status: inv.status,
        pdf_url: inv.pdf_url,
      },
      cadenaOk: result.cadenaOk,
      diferenciaIvaAntesDespues: result.diferenciaIvaAntesDespues,
      marginNoPositivo: result.marginNoPositivo,
      pdfPendiente: result.pdfPendiente,
    })
  } catch (e) {
    if (e instanceof ConvertirError) {
      return NextResponse.json(
        { error: e.message, code: e.code, details: e.details },
        { status: e.httpStatus }
      )
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
