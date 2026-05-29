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
}

export function pickInvoiceNumber(input: PickInvoiceNumberInput): number {
  const { startNumber, sysMax, absMax, occupied } = input

  // 1) Reuse the lowest free slot in the system-managed range (covers a
  //    deleted invoice's number, whether it was the last one or an interior
  //    one).
  if (sysMax != null && sysMax >= startNumber) {
    const taken = new Set(occupied)
    for (let n = startNumber; n <= sysMax; n++) {
      if (!taken.has(n)) return n
    }
  }

  // 2) No holes → next correlative after the system max, never below the
  //    series floor and never colliding with an IMPORTED row above it.
  return Math.max(startNumber, (sysMax ?? startNumber - 1) + 1, absMax + 1)
}
