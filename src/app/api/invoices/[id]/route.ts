import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { pool } from '@/lib/direct-database'
import { getInvoiceById, getAuditLogsForInvoice } from '@/lib/invoiceRepository'
import { readSessionFromRequest } from '@/lib/auth-server'

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

/**
 * DELETE /api/invoices/{id}
 *
 * Admin-only hard delete for invoices that were NEVER actually filed
 * (PDF_PENDING/ERROR — the fiscal number was reserved but the document never
 * went out). ISSUED invoices are NOT deletable — they must be voided via
 * POST /api/invoices/{id}/anular, which keeps the row and the fiscal number
 * (deleting + reusing a number that was already filed is what caused the
 * F-2026-4236 / R-2026-027 duplicate-number incident).
 *
 * It:
 *   - records a snapshot in invoice_deletion_logs (survives the row delete;
 *     invoice_audit_logs cascade away with the invoice) — this is also what
 *     permanently "burns" the number so pickInvoiceNumber never reissues it,
 *   - reverts the linked retail Deal back to 'vendido' (clears factura /
 *     fechaFacturada) so it can be re-invoiced,
 *   - deletes the invoices row (frees the unique-per-sale / per-b2b index),
 *   - best-effort deletes the PDF from Vercel Blob.
 *
 * Body opcional: { reason?: string }.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = readSessionFromRequest(request)
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'Solo un administrador puede eliminar facturas.', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const { id: idRaw } = await params
  const id = parseInt(idRaw, 10)
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const reason =
    typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null

  const client = await pool.connect()
  let pdfStorageKey: string | null = null
  let freedNumber = ''
  try {
    await client.query('BEGIN')

    const invRes = await client.query(
      `SELECT * FROM invoices WHERE id = $1 FOR UPDATE`,
      [id]
    )
    if (invRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }
    const inv = invRes.rows[0]

    if (inv.status === 'ISSUED') {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error:
            'Esta factura ya fue emitida (ISSUED); no se puede borrar. Usá /anular para anularla conservando el número fiscal.',
          code: 'ISSUED_NOT_DELETABLE',
        },
        { status: 409 }
      )
    }

    pdfStorageKey = inv.pdf_storage_key
    freedNumber = inv.full_invoice_number

    // Paper trail that outlives the row.
    await client.query(
      `INSERT INTO invoice_deletion_logs
         (invoice_id, full_invoice_number, series, number, invoice_type,
          deal_id, b2b_venta_id, total_amount, snapshot_json, reason,
          deleted_by_user_id, deleted_by_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        inv.id,
        inv.full_invoice_number,
        inv.series,
        inv.number,
        inv.invoice_type,
        inv.deal_id,
        inv.b2b_venta_id ?? null,
        inv.total_amount,
        JSON.stringify(inv),
        reason,
        String(session.uid),
        session.role,
      ]
    )

    // Revert the linked retail Deal so it can be re-invoiced. Guard on the
    // factura field so we don't clobber a deal already re-invoiced with a
    // different number (e.g. when deleting the non-current of two types).
    if (inv.deal_id) {
      await client.query(
        `UPDATE "Deal"
            SET estado = CASE WHEN estado = 'facturado' THEN 'vendido' ELSE estado END,
                "fechaFacturada" = CASE WHEN factura = $1 THEN NULL ELSE "fechaFacturada" END,
                factura = CASE WHEN factura = $1 THEN NULL ELSE factura END
          WHERE id = $2`,
        [inv.full_invoice_number, inv.deal_id]
      )
    }
    // B2B: venta_b2b carries no factura column; deleting the row frees the
    // partial unique index (idx_invoices_unique_per_b2b_venta) for re-issue.

    await client.query(`DELETE FROM invoices WHERE id = $1`, [id])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[DELETE /api/invoices/[id]]', err)
    return NextResponse.json(
      { error: 'Error al eliminar la factura' },
      { status: 500 }
    )
  } finally {
    client.release()
  }

  // Best-effort blob cleanup, outside the transaction.
  if (pdfStorageKey) {
    try {
      await del(pdfStorageKey)
    } catch (e) {
      console.error('[invoice delete blob]', e)
    }
  }

  return NextResponse.json({ deleted: true, full_invoice_number: freedNumber })
}
