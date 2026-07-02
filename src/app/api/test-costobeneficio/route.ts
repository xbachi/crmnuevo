import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { syncCostoBeneficio } from '@/lib/costoBeneficio'

/**
 * GET /api/test-costobeneficio?dealId=NNN[&write=1]
 *
 * Dry-run (default) del bloque costo/beneficio para un deal ya facturado.
 * Con write=1 inserta de verdad. Ruta /api/test-*: libre en dev, 404 en prod
 * (ver middleware.ts).
 */
export async function GET(request: NextRequest) {
  const dealId = parseInt(request.nextUrl.searchParams.get('dealId') ?? '', 10)
  if (Number.isNaN(dealId)) {
    return NextResponse.json({ error: 'dealId requerido' }, { status: 400 })
  }
  const dryRun = request.nextUrl.searchParams.get('write') !== '1'

  // datos de la factura emitida más reciente del deal
  const inv = await pool.query(
    `SELECT full_invoice_number, invoice_type, invoice_date, total_amount
       FROM invoices
      WHERE deal_id = $1 AND status <> 'VOIDED'
      ORDER BY created_at DESC LIMIT 1`,
    [dealId]
  )
  const row = inv.rows[0]
  if (!row) {
    return NextResponse.json(
      { error: `deal ${dealId} sin factura emitida` },
      { status: 404 }
    )
  }

  const result = await syncCostoBeneficio({
    dealId,
    numeroFactura: row.full_invoice_number,
    invoiceType: row.invoice_type,
    invoiceDate: new Date(row.invoice_date).toISOString().slice(0, 10),
    salePrice: Number(row.total_amount),
    dryRun,
  })
  return NextResponse.json({ dryRun, ...result })
}
