import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { readSessionFromRequest } from '@/lib/auth-server'
import { appendRegistro } from '@/lib/facturacionRegistro'

/**
 * POST /api/invoices/{id}/anular
 *
 * Admin-only VOID for a retail invoice. Unlike DELETE (only for
 * PDF_PENDING/ERROR rows that never went out), this is the correct path for
 * an already-ISSUED invoice: it keeps the row and the fiscal number —
 * numbers that were filed with Hacienda are never recycled — and just marks
 * it VOIDED, writes an audit log, and reverts the linked Deal to 'vendido' so
 * it can be re-invoiced (mirrors the guard in DELETE: only clears
 * factura/fechaFacturada if they still point at THIS invoice's number).
 *
 * Same pattern as POST /api/ventas-b2b/[id]/factura/anular for B2B.
 *
 * Body opcional: { reason?: string }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = readSessionFromRequest(request)
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'Solo un administrador puede anular facturas.', code: 'FORBIDDEN' },
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
    typeof body?.reason === 'string' && body.reason.trim()
      ? body.reason.trim()
      : 'Anulada desde el CRM'

  const client = await pool.connect()
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

    if (inv.status === 'VOIDED') {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'Esta factura ya está anulada.', code: 'ALREADY_VOIDED' },
        { status: 409 }
      )
    }
    if (inv.status === 'IMPORTED') {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error: 'Las facturas importadas como históricas no se pueden anular.',
          code: 'IMPORTED_NOT_VOIDABLE',
        },
        { status: 409 }
      )
    }

    await client.query(
      `UPDATE invoices SET status = 'VOIDED', updated_at = NOW() WHERE id = $1`,
      [id]
    )
    await client.query(
      `INSERT INTO invoice_audit_logs (invoice_id, action, new_values_json, reason, user_id, user_role)
       VALUES ($1, 'STATUS_CHANGED', $2, $3, $4, $5)`,
      [
        inv.id,
        JSON.stringify({ status: 'VOIDED', prev_status: inv.status }),
        reason,
        String(session.uid),
        session.role,
      ]
    )

    // Cadena de integridad "Verifactu-lite" (pendiente de homologación):
    // eslabón 'anulacion' en el mismo tx que marca VOIDED. Si falla, la
    // anulación entera hace rollback.
    await appendRegistro(client, {
      tipoRegistro: 'anulacion',
      invoiceId: inv.id,
      numeroSerie: inv.full_invoice_number,
      fechaExpedicion: inv.invoice_date,
      importeTotal: inv.total_amount,
      metadata: { origen: 'retail', reason },
    })

    // Revert the linked retail Deal so it can be re-invoiced. Guard on the
    // factura field so we don't clobber a deal already re-invoiced with a
    // different number (same pattern as DELETE).
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

    await client.query('COMMIT')

    return NextResponse.json({
      voided: true,
      invoice_id: inv.id,
      full_invoice_number: inv.full_invoice_number,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[POST /api/invoices/[id]/anular]', err)
    return NextResponse.json({ error: 'Error interno anulando factura' }, { status: 500 })
  } finally {
    client.release()
  }
}
