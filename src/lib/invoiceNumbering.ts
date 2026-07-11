/**
 * Pure invoice-number assignment rule (no DB, no side effects) so it can be
 * unit-tested exhaustively.
 *
 * Once a number is reserved it remains consumed. Assignment uses the largest
 * monotonic boundary: the series floor, its persisted high-water mark, or one
 * after the largest historical row. Interior holes are intentionally ignored.
 */

export interface PickInvoiceNumberInput {
  /** First number the CRM ever assigns in this series (seeded next_number). */
  startNumber: number
  /** Persisted high-water mark from invoice_sequences. */
  nextNumber: number
  /** MAX(number) among ALL rows incl. IMPORTED; 0 if the series is empty. */
  absMax: number
}

export function pickInvoiceNumber(input: PickInvoiceNumberInput): number {
  const { startNumber, nextNumber, absMax } = input
  return Math.max(startNumber, nextNumber, absMax + 1)
}
