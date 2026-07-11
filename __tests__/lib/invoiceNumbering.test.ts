import { pickInvoiceNumber } from '@/lib/invoiceNumbering'

// Helper: occupied = the numbers physically present in [startNumber, sysMax].
const pick = (
  startNumber: number,
  sysMax: number | null,
  absMax: number,
  occupied: number[],
  burned: number[] = []
) => pickInvoiceNumber({ startNumber, sysMax, absMax, occupied, burned })

describe('pickInvoiceNumber — first issuance', () => {
  it('uses the series floor on an empty series (REBU seeded at 23)', () => {
    expect(pick(23, null, 0, [])).toBe(23)
  })

  it('uses the series floor on an empty series (VAT seeded at 4222)', () => {
    expect(pick(4222, null, 0, [])).toBe(4222)
  })

  it('starts at the floor even when legacy IMPORTED rows sit below it', () => {
    // REBU legacy 1..22 imported; floor is 23.
    expect(pick(23, null, 22, [])).toBe(23)
  })
})

describe('pickInvoiceNumber — sequential issuance (no holes)', () => {
  it('takes the next correlative after the system max', () => {
    // Issued 23,24,25 → next is 26.
    expect(pick(23, 25, 25, [23, 24, 25])).toBe(26)
  })

  it('keeps going for VAT', () => {
    expect(pick(4222, 4224, 4224, [4222, 4223, 4224])).toBe(4225)
  })
})

describe('pickInvoiceNumber — reuse after deletion (the feature)', () => {
  it('reuses an interior hole left by a deleted invoice', () => {
    // 23,24,25 existed; 24 deleted → reuse 24, not 26.
    expect(pick(23, 25, 25, [23, 25])).toBe(24)
  })

  it('reuses the last number when the highest invoice was deleted', () => {
    // 23,24,25 existed; 25 deleted → sysMax drops to 24, next is 25 again.
    expect(pick(23, 24, 24, [23, 24])).toBe(25)
  })

  it('reuses the lowest hole first when several were deleted', () => {
    // 23..27 existed; 24 and 26 deleted → reuse 24 first.
    expect(pick(23, 27, 27, [23, 25, 27])).toBe(24)
  })

  it('reuses the floor itself when the very first invoice was deleted', () => {
    // 23,24,25 existed; 23 deleted → reuse 23.
    expect(pick(23, 25, 25, [24, 25])).toBe(23)
  })

  it('after filling a hole, the same input no longer offers it (idempotent fill)', () => {
    // Once 24 is re-issued it is occupied again → next call returns 26.
    expect(pick(23, 25, 25, [23, 24, 25])).toBe(26)
  })
})

describe('pickInvoiceNumber — legacy IMPORTED safety', () => {
  it('never fills holes below the floor (legacy zone is untouched)', () => {
    // Legacy IMPORTED 1..22 with a hole at 10; floor 23, nothing issued yet.
    // Must NOT return 10 — must return the floor.
    const legacy = [1, 2, 3, 11, 12, 22] // hole at 10 etc.
    expect(pick(23, null, 22, legacy.filter((n) => n >= 23))).toBe(23)
  })

  it('jumps over an IMPORTED row sitting above the system max (no collision)', () => {
    // System empty, an IMPORTED row landed at 4300 (rare fallback). Floor 4222.
    // Must jump past it to 4301 to avoid the UNIQUE(series, number) clash.
    expect(pick(4222, null, 4300, [])).toBe(4301)
  })

  it('does not reuse holes above the system max created by a high IMPORTED row', () => {
    // System issued 4222..4224; IMPORTED at 4300. Range scanned is [4222,4224]
    // (all taken) so we go next → 4301 (jump the IMPORTED), leaving the
    // 4225..4299 legacy gap alone.
    expect(pick(4222, 4224, 4300, [4222, 4223, 4224])).toBe(4301)
  })
})

describe('pickInvoiceNumber — burned numbers never return to the pool (prod incident)', () => {
  // Real incident (2026-07): F-2026-4236 and R-2026-027 were each assigned to
  // TWO different invoices because a deleted number was silently reused as a
  // hole. Fix: any number logged in invoice_deletion_logs is "burned" and the
  // picker must never offer it again, hole or correlative.

  it('VAT: skips the burned hole at 4236 (F-2026-4236) even though it looks free', () => {
    const occupied = [
      4222, 4223, 4224, 4225, 4226, 4227, 4228, 4229, 4230, 4231, 4232, 4233,
      4234, 4235, 4237, 4238,
    ]
    // Without burned=[4236] this would return 4236 (the hole). It must not.
    expect(pick(4222, 4238, 4238, occupied, [4236])).toBe(4239)
  })

  it('REBU: skips the burned hole at 27 (R-2026-027) even as the only hole', () => {
    const occupied = [23, 24, 25, 26, 28]
    // Without burned=[27] this would return 27. It must not.
    expect(pick(23, 28, 28, occupied, [27])).toBe(29)
  })

  it('jumps over a burned number sitting exactly at the next correlative', () => {
    expect(pick(23, 26, 26, [23, 24, 25, 26], [27])).toBe(28)
  })

  it('no burned numbers → behaviour is unchanged (regression guard)', () => {
    expect(pick(23, 25, 25, [23, 25], [])).toBe(24)
  })
})
