import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

/**
 * PATCH /api/invoice-sequences/{id}
 *
 * Admin-only endpoint to edit an invoice sequence (next_number,
 * number_format, is_active). Refuses to set next_number BELOW the
 * highest number already used in the matching series — that would
 * create duplicate invoice numbers when emitting.
 *
 * Body: {
 *   next_number?: number,
 *   number_format?: string,
 *   is_active?: boolean,
 *   reason: string,
 *   userId?: string  // placeholder until Task 2
 * }
 */
// TODO: replace placeholder auth with real server-side auth (Task 2)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await pool.connect()
  try {
    const { id: idRaw } = await params
    const id = parseInt(idRaw, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < 3) {
      return NextResponse.json(
        { error: 'Motivo obligatorio (mínimo 3 caracteres).', code: 'REASON_REQUIRED' },
        { status: 400 }
      )
    }

    await client.query('BEGIN')

    const seqRes = await client.query(
      `SELECT * FROM invoice_sequences WHERE id = $1 FOR UPDATE`,
      [id]
    )
    if (seqRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Serie no encontrada' }, { status: 404 })
    }
    const before = seqRes.rows[0]

    const updates: string[] = []
    const values: unknown[] = []
    const newValues: Record<string, unknown> = {}

    if (typeof body.next_number === 'number' && Number.isInteger(body.next_number)) {
      if (body.next_number < 1) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: 'next_number debe ser >= 1' },
          { status: 400 }
        )
      }
      // Refuse to move sequence backwards past invoices already issued
      const usedRes = await client.query(
        `SELECT MAX(number)::INT AS max_num FROM invoices
         WHERE invoice_type = $1 AND series = $2 AND status NOT IN ('VOIDED')`,
        [before.invoice_type, before.series]
      )
      const maxUsed = usedRes.rows[0]?.max_num ?? 0
      if (body.next_number <= maxUsed) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          {
            error: `No se puede poner next_number ≤ ${maxUsed} porque ya hay facturas emitidas con ese número o superior.`,
            code: 'BACKWARDS_NOT_ALLOWED',
          },
          { status: 409 }
        )
      }
      values.push(body.next_number)
      updates.push(`next_number = $${values.length}`)
      newValues.next_number = body.next_number
    }

    if (typeof body.number_format === 'string') {
      if (!/^%0?\d+d$/.test(body.number_format)) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: 'number_format debe ser tipo %03d, %04d, etc.' },
          { status: 400 }
        )
      }
      values.push(body.number_format)
      updates.push(`number_format = $${values.length}`)
      newValues.number_format = body.number_format
    }

    if (typeof body.is_active === 'boolean') {
      values.push(body.is_active)
      updates.push(`is_active = $${values.length}`)
      newValues.is_active = body.is_active
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'No se enviaron campos para actualizar.' },
        { status: 400 }
      )
    }

    updates.push(`updated_at = NOW()`)
    values.push(id)
    const updated = await client.query(
      `UPDATE invoice_sequences SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    )

    // Audit log: we associate sequence changes with a synthetic invoice_id
    // of NULL is not allowed by the schema (NOT NULL), so we log into a
    // separate channel. For now we log to the most recent invoice in the
    // affected series, and if there isn't one, we just record via
    // console.error and skip the audit row.
    const recentInvoiceRes = await client.query(
      `SELECT id FROM invoices WHERE invoice_type = $1 AND series = $2
       ORDER BY id DESC LIMIT 1`,
      [before.invoice_type, before.series]
    )
    const recentInvoiceId = recentInvoiceRes.rows[0]?.id ?? null
    if (recentInvoiceId) {
      await client.query(
        `INSERT INTO invoice_audit_logs
           (invoice_id, action, old_values_json, new_values_json, reason, user_id, user_role)
         VALUES ($1, 'CONFIG_UPDATED', $2, $3, $4, $5, $6)`,
        [
          recentInvoiceId,
          JSON.stringify({
            sequence_id: before.id,
            invoice_type: before.invoice_type,
            series: before.series,
            next_number: before.next_number,
            number_format: before.number_format,
            is_active: before.is_active,
          }),
          JSON.stringify({ sequence_id: before.id, ...newValues }),
          `Cambio de serie ${before.invoice_type}/${before.series}: ${reason}`,
          typeof body?.userId === 'string' ? body.userId : null,
          typeof body?.userRole === 'string' ? body.userRole : null,
        ]
      )
    } else {
      console.warn(
        `[sequence ${id}] config updated but no invoice exists yet to anchor audit log; reason=${reason}`
      )
    }

    await client.query('COMMIT')
    return NextResponse.json({ row: updated.rows[0] })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[invoice-sequences PATCH]', err)
    return NextResponse.json(
      { error: 'Error al actualizar la serie' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
