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
 *   - Advances invoice_sequences automatically when correcting upwards.
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

    // Lock the target sequence so correction and issuance cannot claim the
    // same number concurrently.
    const seqRes = await client.query(
      `SELECT id, number_format, next_number FROM invoice_sequences
       WHERE invoice_type = $1 AND series = $2
       FOR UPDATE`,
      [before.invoice_type, newSeries]
    )
    if (seqRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error: `La serie ${newSeries} no existe para facturas ${before.invoice_type}.`,
          code: 'SEQUENCE_NOT_FOUND',
        },
        { status: 400 }
      )
    }
    const numberFormat = seqRes.rows[0].number_format

    const newFull = `${newSeries}-${formatNumber(newNumber, numberFormat)}`

    if (
      before.series === newSeries &&
      before.number === newNumber &&
      before.full_invoice_number === newFull
    ) {
      await client.query('ROLLBACK')
      return NextResponse.json({ invoice: before })
    }

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

    const historicalRes = await client.query(
      `SELECT full_invoice_number
         FROM invoice_deletion_logs
        WHERE (series = $1 AND number = $2) OR full_invoice_number = $3
       UNION ALL
       SELECT old_values_json->>'full_invoice_number' AS full_invoice_number
         FROM invoice_audit_logs
        WHERE action = 'NUMBER_CORRECTED'
          AND (
            (old_values_json->>'series' = $1
             AND old_values_json->>'number' ~ '^[0-9]+$'
             AND (old_values_json->>'number')::integer = $2)
            OR old_values_json->>'full_invoice_number' = $3
          )
       LIMIT 1`,
      [newSeries, newNumber, newFull]
    )
    if (historicalRes.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        {
          error: `El número ${newFull} ya fue utilizado históricamente y no se puede reutilizar.`,
          code: 'FISCAL_NUMBER_ALREADY_USED',
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

    await client.query(
      `UPDATE invoice_sequences
          SET next_number = GREATEST(next_number, $1), updated_at = NOW()
        WHERE id = $2`,
      [newNumber + 1, seqRes.rows[0].id]
    )

    await client.query('COMMIT')
    return NextResponse.json({ invoice: updated.rows[0] })
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
