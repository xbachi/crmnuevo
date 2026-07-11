import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireAdminSession } from '@/lib/apiAuth'
import { appendRegistro } from '@/lib/facturacionRegistro'

/**
 * POST /api/ventas-b2b/{id}/factura/anular
 * Marca la factura activa de una venta B2B como VOIDED. Se mantiene la fila
 * en `invoices` (número fiscal NO se libera — los números no se reciclan
 * por compliance). Después de anular, la venta vuelve a permitir emisión
 * de una nueva factura (el índice único parcial excluye VOIDED).
 *
 * Body opcional: { motivo: string } (queda en invoice_audit_logs).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response

  try {
    const { id: raw } = await params
    const ventaB2BId = parseInt(raw, 10)
    if (Number.isNaN(ventaB2BId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const motivo =
      (body?.motivo ?? '').toString().trim() || 'Anulada desde UI B2B'

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const { rows } = await client.query<{
        id: number
        full_invoice_number: string
        status: string
        invoice_date: string | Date
        total_amount: string
      }>(
        `SELECT id, full_invoice_number, status, invoice_date, total_amount
           FROM invoices
          WHERE b2b_venta_id = $1 AND status <> 'VOIDED'
          ORDER BY id DESC
          LIMIT 1
          FOR UPDATE`,
        [ventaB2BId]
      )
      if (rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: 'No hay factura activa para anular en esta venta B2B' },
          { status: 404 }
        )
      }

      const inv = rows[0]
      await client.query(
        `UPDATE invoices SET status = 'VOIDED', updated_at = NOW() WHERE id = $1`,
        [inv.id]
      )
      await client.query(
        `INSERT INTO invoice_audit_logs
           (invoice_id, action, new_values_json, reason, user_id, user_role)
         VALUES ($1, 'STATUS_CHANGED', $2, $3, $4, $5)`,
        [
          inv.id,
          JSON.stringify({ status: 'VOIDED', prev_status: inv.status }),
          motivo,
          String(auth.session.uid),
          auth.session.role,
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
        metadata: { origen: 'b2b', b2b_venta_id: ventaB2BId, reason: motivo },
      })

      await client.query('COMMIT')

      return NextResponse.json({
        voided: true,
        invoice_id: inv.id,
        full_invoice_number: inv.full_invoice_number,
      })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[POST /api/ventas-b2b/[id]/factura/anular]', err)
    return NextResponse.json(
      { error: 'Error interno anulando factura' },
      { status: 500 }
    )
  }
}
