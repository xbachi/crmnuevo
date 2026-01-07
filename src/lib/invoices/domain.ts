export const EXPENSE_CATEGORIES = [
  'limpieza',
  'pintura',
  'taller',
  'transporte',
  'gestoria',
  'otro',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const INVOICE_SOURCES = ['ONEDRIVE', 'OUTLOOK', 'MANUAL'] as const
export type InvoiceSource = (typeof INVOICE_SOURCES)[number]
