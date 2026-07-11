import type { InvoiceStatus } from '@/lib/invoiceRepository'

const HARD_DELETE_POLICY: Record<InvoiceStatus, boolean> = {
  ISSUED: false,
  PDF_PENDING: false,
  ERROR: false,
  VOIDED: false,
  RECTIFIED: false,
  IMPORTED: false,
}

export const canHardDeleteInvoice = (status: InvoiceStatus): boolean =>
  HARD_DELETE_POLICY[status] ?? false
