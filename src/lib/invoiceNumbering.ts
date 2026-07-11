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
