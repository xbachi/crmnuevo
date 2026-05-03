import {
  formatNumber,
  buildFullInvoiceNumber,
  INVOICE_CONFIG,
} from '@/config/invoiceConfig'

describe('formatNumber', () => {
  it('zero-pads to the requested width', () => {
    expect(formatNumber(23, '%03d')).toBe('023')
    expect(formatNumber(1, '%03d')).toBe('001')
    expect(formatNumber(999, '%03d')).toBe('999')
  })

  it('does not truncate when value already exceeds width', () => {
    expect(formatNumber(4222, '%03d')).toBe('4222')
    expect(formatNumber(10000, '%04d')).toBe('10000')
  })

  it('respects %04d format used by VAT', () => {
    expect(formatNumber(4222, '%04d')).toBe('4222')
    expect(formatNumber(1, '%04d')).toBe('0001')
  })

  it('returns the raw number string when format is unrecognized', () => {
    expect(formatNumber(42, 'not-a-format')).toBe('42')
  })
})

describe('buildFullInvoiceNumber', () => {
  it('produces the canonical REBU shape', () => {
    expect(buildFullInvoiceNumber('R-2026', 23, '%03d')).toBe('R-2026-023')
    expect(buildFullInvoiceNumber('R-2026', 24, '%03d')).toBe('R-2026-024')
  })

  it('produces the canonical VAT shape', () => {
    expect(buildFullInvoiceNumber('F-2026', 4222, '%04d')).toBe('F-2026-4222')
    expect(buildFullInvoiceNumber('F-2026', 4223, '%04d')).toBe('F-2026-4223')
  })
})

describe('INVOICE_CONFIG', () => {
  it('exposes a non-empty REBU legal note', () => {
    expect(INVOICE_CONFIG.rebu.legalNote.length).toBeGreaterThan(0)
  })

  it('uses 21 as the standard VAT rate', () => {
    expect(INVOICE_CONFIG.vat.standardRate).toBe(21)
  })

  it('declares a Vercel Blob path prefix', () => {
    expect(INVOICE_CONFIG.storage.blobPrefix).toBe('invoices/')
  })
})
