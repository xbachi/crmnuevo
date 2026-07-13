/**
 * Pure invoice-number assignment rule (no DB, no side effects) so it can be
 * unit-tested exhaustively.
 *
 * Goal: when an invoice is deleted, its number must become free and be
 * re-occupied by the next issuance — no gaps — for internal use BEFORE
 * invoices are filed with Hacienda.
 *
 * Strategy: gap-filling within the system-managed range.
 *   - `startNumber` is the first number this series ever used from the CRM
 *     (the seeded next_number). Legacy IMPORTED rows live BELOW it and are
 *     never disturbed.
 *   - Reuse the lowest free number in [startNumber, systemMax] (a hole there
 *     is a number that was issued by the CRM and then deleted).
 *   - If there are no holes, take the next number after the system max,
 *     jumping over any IMPORTED row sitting above it so we never collide with
 *     the UNIQUE(series, number) constraint.
 *   - `burned` numbers (ever recorded in invoice_deletion_logs) are permanently
 *     excluded from reuse — they never come back, whether as a hole or as the
 *     next correlative. This closes the reuse-collision incident (F-2026-4236,
 *     R-2026-027 each assigned to two different documents).
 */

import type { Pool, PoolClient } from 'pg'

export interface PickInvoiceNumberInput {
  /** First number the CRM ever assigns in this series (seeded next_number). */
  startNumber: number
  /** MAX(number) among CRM-issued rows (status <> 'IMPORTED'); null if none. */
  sysMax: number | null
  /** MAX(number) among ALL rows incl. IMPORTED; 0 if the series is empty. */
  absMax: number
  /** Every `number` present in [startNumber, sysMax] (any status). */
  occupied: readonly number[]
  /** Numbers ever deleted (invoice_deletion_logs) for this series — never reissued. */
  burned?: readonly number[]
}

export function pickInvoiceNumber(input: PickInvoiceNumberInput): number {
  const { startNumber, sysMax, absMax, occupied, burned } = input
  const burnedSet = new Set(burned ?? [])

  // 1) Reuse the lowest free slot in the system-managed range (covers a
  //    deleted invoice's number, whether it was the last one or an interior
  //    one) — skipping any number that was burned by a deletion.
  if (sysMax != null && sysMax >= startNumber) {
    const taken = new Set(occupied)
    for (let n = startNumber; n <= sysMax; n++) {
      if (!taken.has(n) && !burnedSet.has(n)) return n
    }
  }

  // 2) No holes → next correlative after the system max, never below the
  //    series floor, never colliding with an IMPORTED row above it, and
  //    jumping over any burned number too.
  let next = Math.max(startNumber, (sysMax ?? startNumber - 1) + 1, absMax + 1)
  while (burnedSet.has(next)) next++
  return next
}

/**
 * Resolve the next invoice number for a series using the rule above. Pulls the
 * state pickInvoiceNumber needs (system max, absolute max, occupied numbers in
 * the managed range, burned numbers) and delegates. Works with either the pool
 * or a locked client — callers that need atomicity must already hold the
 * sequence row lock (SELECT ... FOR UPDATE on invoice_sequences).
 *
 * Lives here (and not in invoiceService) because BOTH the issuance flow and
 * the rectificativa flow consume numbers and must follow the exact same rule.
 */
export async function resolveNextNumber(
  db: Pool | PoolClient,
  series: string,
  startNumber: number
): Promise<number> {
  const agg = await db.query<{ sys_max: string | null; abs_max: string | null }>(
    `SELECT MAX(number) FILTER (WHERE status <> 'IMPORTED') AS sys_max,
            MAX(number)                                     AS abs_max
       FROM invoices WHERE series = $1`,
    [series]
  )
  const sysMax = agg.rows[0]?.sys_max != null ? Number(agg.rows[0].sys_max) : null
  const absMax = agg.rows[0]?.abs_max != null ? Number(agg.rows[0].abs_max) : 0

  let occupied: number[] = []
  if (sysMax != null && sysMax >= startNumber) {
    const occ = await db.query<{ number: number }>(
      `SELECT number FROM invoices WHERE series = $1 AND number BETWEEN $2 AND $3`,
      [series, startNumber, sysMax]
    )
    occupied = occ.rows.map((r) => Number(r.number))
  }

  // Numbers that were ever deleted for this series (invoice_deletion_logs)
  // must never be reissued — see pickInvoiceNumber's `burned` param.
  const burnedRes = await db.query<{ number: number }>(
    `SELECT DISTINCT number FROM invoice_deletion_logs WHERE series = $1`,
    [series]
  )
  const burned = burnedRes.rows.map((r) => Number(r.number))

  return pickInvoiceNumber({ startNumber, sysMax, absMax, occupied, burned })
}
