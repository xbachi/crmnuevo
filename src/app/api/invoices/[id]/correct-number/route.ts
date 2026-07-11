import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { formatNumber } from '@/config/invoiceConfig'
import { requireAdminSession } from '@/lib/apiAuth'

/**
 * PATCH /api/invoices/{id}/correct-number
 *
 * Admin-only manual correction of an issued invoice's series + number.
 * This is for accounting fixes — never for casual edits.
 *
 * Validations:
 *   - Both new_series and new_number are required.
 *   - new_full_invoice_number must not duplicate any existing invoice.
 *   - reason is required (>= 3 chars).
 *
 * Side effects:
 *   - Records old + new values + reason in invoice_audit_logs.
 *   - Does NOT touch invoice_sequences automatically. If the corrected
 *     number is higher than the current sequence next_number for that
 *     series, the response includes a hint suggesting the admin advance
 *     the sequence manually from /facturacion/series.
 *
 * Body: {
 *   new_series: string,
 *   new_number: number,
 *   reason: string
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response

  const client = await pool.connect()
  try {
    const { id: idRaw } = await params
    const id = parseInt(idRaw, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const newSeries =
      typeof body?.new_series === 'string' ? body.new_series.trim() : ''
    const newNumber =
      typeof body?.new_number === 'number' && Number.isInteger(body.new_number)
        ? body.new_number
        : null
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    if (!newSeries) {
      return NextResponse.json(
        { error: 'new_series obligatorio' },
        { status: 400 }
      )
    }
    if (!newNumber || newNumber < 1) {
      return NextResponse.json(
        { error: 'new_number obligatorio y >= 1' },
        { status: 400 }
      )
    }
    if (reason.length < 3) {
      return NextResponse.json(
        {
          error: 'Motivo obligatorio (mínimo 3 caracteres).',
          code: 'REASON_REQUIRED',
        },
        { status: 400 }
      )
    }

    await client.query('BEGIN')

    const invRes = await client.query(
      `SELECT * FROM invoices WHERE id = $1 FOR UPDATE`,
      [id]
    )
    if (invRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'Factura no encontrada' },
        { status: 404 }
      )
    }
    const before = invRes.rows[0]

    // Determine number_format from the matching sequence; fallback to %03d
    const seqRes = await client.query(
      `SELECT number_format FROM invoice_sequences
       WHERE invoice_type = $1 AND series = $2`,
      [before.invoice_type, newSeries]
    )
    const numberFormat = seqRes.rows[0]?.number_format ?? '%03d'

    const newFull = `${newSeries}-${formatNumber(newNumber, numberFormat)}`

    // Check for collision against another invoice (excluding self)
    const dupRes = await client.query(
      `SELECT id, full_invoice_number FROM invoices
       WHERE id <> $1
         AND ((series = $2 AND number = $3) OR full_invoice_number = $4)`,
      [id, newSeries, newNumber, newFull]
    )
    if (dupRes.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error: `El número ${newFull} ya existe en otra factura (id #${dupRes.rows[0].id}).`,
          code: 'DUPLICATE',
        },
        { status: 409 }
      )
    }

    const updated = await client.query(
      `UPDATE invoices
       SET series = $1, number = $2, full_invoice_number = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newSeries, newNumber, newFull, id]
    )

    await client.query(
      `INSERT INTO invoice_audit_logs
         (invoice_id, action, old_values_json, new_values_json, reason, user_id, user_role)
       VALUES ($1, 'NUMBER_CORRECTED', $2, $3, $4, $5, $6)`,
      [
        id,
        JSON.stringify({
          series: before.series,
          number: before.number,
          full_invoice_number: before.full_invoice_number,
        }),
        JSON.stringify({
          series: newSeries,
          number: newNumber,
          full_invoice_number: newFull,
        }),
        reason,
        String(auth.session.uid),
        auth.session.role,
      ]
    )

    await client.query('COMMIT')

    // Suggest advancing the sequence if the corrected number is higher
    let advisory: string | null = null
    const advRes = await pool.query(
      `SELECT next_number FROM invoice_sequences
       WHERE invoice_type = $1 AND series = $2 AND is_active = TRUE`,
      [before.invoice_type, newSeries]
    )
    const nextNumber = advRes.rows[0]?.next_number
    if (typeof nextNumber === 'number' && newNumber >= nextNumber) {
      advisory = `El nuevo número (${newNumber}) es ≥ que el next_number actual de la serie (${nextNumber}). Considerá avanzar la secuencia desde /facturacion/series para que la próxima emisión use ${newNumber + 1}.`
    }

    return NextResponse.json({ invoice: updated.rows[0], advisory })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[correct-number]', err)
    return NextResponse.json(
      { error: 'Error al corregir el número' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
