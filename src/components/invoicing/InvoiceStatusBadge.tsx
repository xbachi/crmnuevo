'use client'

const STATUS_STYLES: Record<string, string> = {
  ISSUED: 'bg-green-100 text-green-700',
  PDF_PENDING: 'bg-yellow-100 text-yellow-700',
  ERROR: 'bg-red-100 text-red-700',
  VOIDED: 'bg-gray-200 text-gray-600 line-through',
  RECTIFIED: 'bg-purple-100 text-purple-700',
  IMPORTED: 'bg-blue-100 text-blue-700',
}

const STATUS_LABELS: Record<string, string> = {
  ISSUED: 'Emitida',
  PDF_PENDING: 'PDF pendiente',
  ERROR: 'Error',
  VOIDED: 'Anulada',
  RECTIFIED: 'Rectificada',
  IMPORTED: 'Importada',
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'
  const label = STATUS_LABELS[status] ?? status
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style}`}
    >
      {label}
    </span>
  )
}

const TYPE_STYLES: Record<string, string> = {
  VAT: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  REBU: 'bg-amber-50 text-amber-700 border border-amber-200',
  RECTIFYING: 'bg-purple-50 text-purple-700 border border-purple-200',
}

const TYPE_LABELS: Record<string, string> = {
  VAT: 'IVA',
  REBU: 'REBU',
  RECTIFYING: 'Rectificativa',
}

export function InvoiceTypeBadge({ type }: { type: string }) {
  const style = TYPE_STYLES[type] ?? 'bg-gray-50 text-gray-700 border border-gray-200'
  const label = TYPE_LABELS[type] ?? type
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style}`}
    >
      {label}
    </span>
  )
}
