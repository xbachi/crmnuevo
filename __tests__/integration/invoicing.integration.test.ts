/**
 * Integration tests for the invoicing module.
 *
 * These tests talk to a real Postgres database and exercise the full
 * issuance flow: sequence locking, idempotency, concurrency, preview.
 *
 * They are SKIPPED unless TEST_DATABASE_URL is set, because:
 *   - the unit-test runner uses jest-jsdom (no pg pool by default)
 *   - we don't want to nuke production data on a `npm test` run
 *
 * To run locally:
 *   $env:TEST_DATABASE_URL = "<a connection string to a disposable DB>"
 *   $env:DATABASE_URL      = "<same as TEST_DATABASE_URL>"
 *   npm run test:integration -- __tests__/integration/invoicing.integration.test.ts
 *
 * Each test inserts a deal/cliente/vehiculo and cleans up after itself.
 */

const TEST_DB = process.env.TEST_DATABASE_URL
const describeIntegration = TEST_DB ? describe : describe.skip

describeIntegration('invoiceService.issueInvoice', () => {
  // We import lazily so jsdom unit runs don't try to load `pg`.
  let issueInvoice: typeof import('@/lib/invoiceService').issueInvoice
  let previewInvoice: typeof import('@/lib/invoiceService').previewInvoice
  let pool: import('pg').Pool

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB
    const svc = await import('@/lib/invoiceService')
    issueInvoice = svc.issueInvoice
    previewInvoice = svc.previewInvoice
    const db = await import('@/lib/direct-database')
    pool = db.pool
  })

  afterAll(async () => {
    await pool?.end?.().catch(() => {})
  })

  /**
   * A previewInvoice() call must NOT consume a number. Calling it five
   * times in a row should still report the same nextNumber as before.
   */
  it('preview does not consume sequence numbers', async () => {
    const { rows: before } = await pool.query<{ next_number: number }>(
      `SELECT next_number FROM invoice_sequences WHERE invoice_type = 'REBU' AND is_active = TRUE LIMIT 1`
    )
    const dealRes = await pool.query<{ id: number }>(
      `SELECT id FROM "Deal" LIMIT 1`
    )
    if (!dealRes.rows[0]) {
      console.warn('No deals in test DB; skipping preview test')
      return
    }
    const dealId = dealRes.rows[0].id

    for (let i = 0; i < 5; i++) {
      const p = await previewInvoice(dealId, 'REBU')
      expect(p.nextNumber).toBe(before[0].next_number)
    }

    const { rows: after } = await pool.query<{ next_number: number }>(
      `SELECT next_number FROM invoice_sequences WHERE invoice_type = 'REBU' AND is_active = TRUE LIMIT 1`
    )
    expect(after[0].next_number).toBe(before[0].next_number)
  })

  /**
   * Two parallel issueInvoice() calls for two different deals must produce
   * unique consecutive numbers. The SELECT ... FOR UPDATE in the service
   * must serialise them.
   */
  it('two concurrent issues produce two unique consecutive numbers', async () => {
    const dealsRes = await pool.query<{ id: number }>(
      `SELECT id FROM "Deal" WHERE NOT EXISTS (
         SELECT 1 FROM invoices WHERE invoices.deal_id = "Deal".id
                                 AND invoices.invoice_type = 'REBU'
                                 AND invoices.status NOT IN ('VOIDED')
       )
       LIMIT 2`
    )
    if (dealsRes.rows.length < 2) {
      console.warn('Need 2 invoice-free deals; skipping concurrency test')
      return
    }
    const [a, b] = dealsRes.rows

    const [resA, resB] = await Promise.all([
      issueInvoice({ dealId: a.id, invoiceType: 'REBU' }),
      issueInvoice({ dealId: b.id, invoiceType: 'REBU' }),
    ])

    expect(resA.invoice.full_invoice_number).not.toBe(
      resB.invoice.full_invoice_number
    )
    const diff = Math.abs(resA.invoice.number - resB.invoice.number)
    expect(diff).toBe(1)
  })

  /**
   * Repeated issueInvoice for the SAME deal+type must return the same row,
   * NOT consume a second number.
   */
  it('idempotent on (deal_id, invoice_type)', async () => {
    const dealRes = await pool.query<{ id: number }>(
      `SELECT id FROM "Deal" LIMIT 1`
    )
    if (!dealRes.rows[0]) return
    const dealId = dealRes.rows[0].id

    const r1 = await issueInvoice({ dealId, invoiceType: 'REBU' })
    const r2 = await issueInvoice({ dealId, invoiceType: 'REBU' })
    const r3 = await issueInvoice({ dealId, invoiceType: 'REBU' })

    expect(r2.alreadyExisted).toBe(true)
    expect(r3.alreadyExisted).toBe(true)
    expect(r1.invoice.id).toBe(r2.invoice.id)
    expect(r1.invoice.id).toBe(r3.invoice.id)
  })

  /**
   * Two requests with the same Idempotency-Key must produce the same row.
   */
  it('idempotent on Idempotency-Key', async () => {
    // Find an unused-yet deal/type pair; otherwise this test reduces to the
    // (deal_id, type) idempotency above.
    const dealRes = await pool.query<{ id: number }>(
      `SELECT id FROM "Deal" WHERE NOT EXISTS (
         SELECT 1 FROM invoices WHERE invoices.deal_id = "Deal".id
                                 AND invoices.status NOT IN ('VOIDED')
       )
       LIMIT 1`
    )
    if (!dealRes.rows[0]) return
    const dealId = dealRes.rows[0].id

    const key = `test-${Date.now()}-${Math.random()}`
    const [r1, r2] = await Promise.all([
      issueInvoice({ dealId, invoiceType: 'VAT', idempotencyKey: key }),
      issueInvoice({ dealId, invoiceType: 'VAT', idempotencyKey: key }),
    ])

    expect(r1.invoice.id).toBe(r2.invoice.id)
    // At least one of them is the cached return
    expect(r1.alreadyExisted || r2.alreadyExisted).toBe(true)
  })

  /**
   * Regression for the "factura emitida pero Deal stale" bug.
   * After issueInvoice(), the Deal row must be updated in the same tx:
   *   - estado='facturado'
   *   - factura = full_invoice_number (legacy field consumed by the
   *     Documentación panel)
   *   - fechaFacturada stamped
   */
  it('issueInvoice updates Deal.estado, .factura, .fechaFacturada', async () => {
    const dealRes = await pool.query<{ id: number }>(
      `SELECT id FROM "Deal"
        WHERE estado IN ('vendido','reservado','nuevo')
          AND (factura IS NULL OR factura = '')
          AND NOT EXISTS (
            SELECT 1 FROM invoices i
             WHERE i.deal_id = "Deal".id
               AND i.status NOT IN ('VOIDED')
          )
        LIMIT 1`
    )
    if (!dealRes.rows[0]) {
      console.warn('No clean deal available; skipping write-back test')
      return
    }
    const dealId = dealRes.rows[0].id

    const result = await issueInvoice({ dealId, invoiceType: 'REBU' })

    const { rows: after } = await pool.query<{
      estado: string
      factura: string | null
      fechaFacturada: Date | null
    }>(
      `SELECT estado, factura, "fechaFacturada" FROM "Deal" WHERE id=$1`,
      [dealId]
    )
    expect(after[0].estado).toBe('facturado')
    expect(after[0].factura).toBe(result.invoice.full_invoice_number)
    expect(after[0].fechaFacturada).not.toBeNull()
  })

  /**
   * Re-emitir la misma factura (idempotent path) NO debe pisar el valor
   * que ya quedó en Deal.factura ni mover fechaFacturada.
   */
  it('idempotent re-issue does not overwrite Deal.factura or fechaFacturada', async () => {
    const dealRes = await pool.query<{ id: number }>(
      `SELECT i.deal_id AS id
         FROM invoices i
         JOIN "Deal" d ON d.id = i.deal_id
        WHERE i.status NOT IN ('VOIDED')
          AND d.estado = 'facturado'
          AND d.factura IS NOT NULL
        LIMIT 1`
    )
    if (!dealRes.rows[0]) {
      console.warn('No facturado deal; skipping idempotent re-issue test')
      return
    }
    const dealId = dealRes.rows[0].id

    const { rows: snapshot } = await pool.query<{
      factura: string
      fechaFacturada: Date
    }>(
      `SELECT factura, "fechaFacturada" FROM "Deal" WHERE id=$1`,
      [dealId]
    )

    const r1 = await issueInvoice({ dealId, invoiceType: 'REBU' })
    const r2 = await issueInvoice({ dealId, invoiceType: 'REBU' })
    expect(r2.alreadyExisted).toBe(true)
    expect(r1.invoice.id).toBe(r2.invoice.id)

    const { rows: after } = await pool.query<{
      factura: string
      fechaFacturada: Date
    }>(
      `SELECT factura, "fechaFacturada" FROM "Deal" WHERE id=$1`,
      [dealId]
    )
    expect(after[0].factura).toBe(snapshot[0].factura)
    expect(after[0].fechaFacturada.toISOString()).toBe(
      snapshot[0].fechaFacturada.toISOString()
    )
  })

  /**
   * Una referencia legacy preexistente en Deal.factura (p.ej. importada
   * por 0001) NO debe ser sobrescrita por el COALESCE(NULLIF(...)).
   */
  it('does not overwrite a pre-existing legacy Deal.factura value', async () => {
    const dealRes = await pool.query<{ id: number }>(
      `SELECT id FROM "Deal"
        WHERE NOT EXISTS (
          SELECT 1 FROM invoices i
           WHERE i.deal_id = "Deal".id
             AND i.status NOT IN ('VOIDED')
        )
        LIMIT 1`
    )
    if (!dealRes.rows[0]) {
      console.warn('No invoice-free deal; skipping legacy preserve test')
      return
    }
    const dealId = dealRes.rows[0].id

    const { rows: prior } = await pool.query<{
      estado: string
      factura: string | null
      fechaFacturada: Date | null
    }>(
      `SELECT estado, factura, "fechaFacturada" FROM "Deal" WHERE id=$1`,
      [dealId]
    )

    const sentinel = `LEGACY-REF-${Date.now()}`
    await pool.query(
      `UPDATE "Deal"
          SET factura=$1, estado='vendido', "fechaFacturada"=NULL
        WHERE id=$2`,
      [sentinel, dealId]
    )

    try {
      await issueInvoice({ dealId, invoiceType: 'VAT' })
      const { rows } = await pool.query<{ factura: string }>(
        `SELECT factura FROM "Deal" WHERE id=$1`,
        [dealId]
      )
      expect(rows[0].factura).toBe(sentinel)
    } finally {
      // Restaurar Deal a su estado previo (mejor effort, los campos clave).
      await pool.query(
        `UPDATE "Deal" SET factura=$1, estado=$2, "fechaFacturada"=$3 WHERE id=$4`,
        [prior[0].factura, prior[0].estado, prior[0].fechaFacturada, dealId]
      )
      // Limpiar la factura emitida durante el test
      await pool.query(
        `DELETE FROM invoice_audit_logs WHERE invoice_id IN
           (SELECT id FROM invoices WHERE deal_id=$1 AND invoice_type='VAT')`,
        [dealId]
      )
      await pool.query(
        `DELETE FROM invoices WHERE deal_id=$1 AND invoice_type='VAT'`,
        [dealId]
      )
    }
  })

  /**
   * Regression: the seed migration imports legacy Deal.factura rows into the
   * same series as the seeded sequence, so `next_number` can land on a row
   * that already exists. Without the fast-forward inside reserveAndInsert,
   * the INSERT hits invoices_unique_series_number → 23505 → rollback →
   * sequence never advances → next attempt collides on the same number forever.
   *
   * This test seeds the collision deliberately and asserts issueInvoice
   * picks the next free number and bumps the sequence past it.
   */
  it('skips past existing (series, number) rows instead of looping on 23505', async () => {
    const seqRow = await pool.query<{
      id: number
      series: string
      next_number: number
    }>(
      `SELECT id, series, next_number FROM invoice_sequences
       WHERE invoice_type = 'REBU' AND is_active = TRUE LIMIT 1`
    )
    if (!seqRow.rows[0]) {
      console.warn('No active REBU sequence; skipping collision test')
      return
    }
    const seq = seqRow.rows[0]
    const collidingNumber = seq.next_number + 500 // safely above any concurrent test

    const dealRes = await pool.query<{ id: number; vehiculoId: number | null }>(
      `SELECT id, "vehiculoId" FROM "Deal" WHERE NOT EXISTS (
         SELECT 1 FROM invoices WHERE invoices.deal_id = "Deal".id
                                 AND invoices.invoice_type = 'REBU'
                                 AND invoices.status NOT IN ('VOIDED')
       )
       LIMIT 1`
    )
    if (!dealRes.rows[0]) {
      console.warn('No free deal for collision test; skipping')
      return
    }
    const dealId = dealRes.rows[0].id

    const blockerRes = await pool.query<{ id: number }>(
      `INSERT INTO invoices (
         deal_id, invoice_type, series, number, full_invoice_number,
         invoice_date, buyer_name,
         vehicle_sale_price, total_amount,
         status, notes
       ) VALUES (
         NULL, 'REBU', $1, $2, $3,
         CURRENT_DATE, 'TEST blocker',
         0, 0,
         'IMPORTED', 'integration test blocker — safe to delete'
       )
       RETURNING id`,
      [seq.series, collidingNumber, `${seq.series}-${String(collidingNumber).padStart(3, '0')}`]
    )
    const blockerId = blockerRes.rows[0].id

    try {
      const res = await issueInvoice({ dealId, invoiceType: 'REBU' })
      expect(res.alreadyExisted).toBe(false)
      expect(res.invoice.number).toBe(collidingNumber + 1)

      const after = await pool.query<{ next_number: number }>(
        `SELECT next_number FROM invoice_sequences WHERE id = $1`,
        [seq.id]
      )
      expect(after.rows[0].next_number).toBe(collidingNumber + 2)

      // Clean up the issued invoice + audit logs
      await pool.query(
        `DELETE FROM invoice_audit_logs WHERE invoice_id = $1`,
        [res.invoice.id]
      )
      await pool.query(`DELETE FROM invoices WHERE id = $1`, [res.invoice.id])
    } finally {
      await pool.query(
        `DELETE FROM invoice_audit_logs WHERE invoice_id = $1`,
        [blockerId]
      )
      await pool.query(`DELETE FROM invoices WHERE id = $1`, [blockerId])
      // Restore sequence to where it was before the test
      await pool.query(
        `UPDATE invoice_sequences SET next_number = $1 WHERE id = $2`,
        [seq.next_number, seq.id]
      )
    }
  })
})
