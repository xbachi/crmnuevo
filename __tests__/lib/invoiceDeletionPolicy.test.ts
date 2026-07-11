import { canHardDeleteInvoice } from '@/lib/invoiceDeletionPolicy'
import type { InvoiceStatus } from '@/lib/invoiceRepository'

describe('política de borrado fiscal', () => {
  it.each<InvoiceStatus>([
    'ISSUED',
    'IMPORTED',
    'RECTIFIED',
    'VOIDED',
    'PDF_PENDING',
    'ERROR',
  ])('protege una factura %s porque su número ya fue reservado', (status) => {
    expect(canHardDeleteInvoice(status)).toBe(false)
  })
})
