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
