import { normalizeTextForFingerprint } from './text-normalize'

export type ExtractedInvoiceFields = {
  matricula?: string
  vendorNif?: string
  vendorIban?: string
  invoiceNumber?: string
  invoiceDate?: Date
  base?: number
  iva?: number
  total?: number
  normalizedText: string
  confidence: number
  reasons: string[]
}

function parseSpanishNumber(raw: string): number | undefined {
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

function parseSpanishDate(raw: string): Date | undefined {
  const m = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (!m) return
  const dd = Number(m[1])
  const mm = Number(m[2])
  let yyyy = Number(m[3])
  if (yyyy < 100) yyyy += 2000
  const d = new Date(Date.UTC(yyyy, mm - 1, dd))
  return isNaN(d.getTime()) ? undefined : d
}

export function extractInvoiceFields(text: string): ExtractedInvoiceFields {
  const normalizedText = normalizeTextForFingerprint(text)

  const reasons: string[] = []
  let confidence = 0

  // Matricula (Spain): 1234ABC (allow spaces/hyphens)
  const matMatch =
    text.match(/\b(\d{4})\s?-?\s?([A-Z]{3})\b/i) ||
    text.match(/\b([A-Z]{1,2})\s?-?\s?(\d{4})\s?-?\s?([A-Z]{1,2})\b/i)
  let matricula: string | undefined
  if (matMatch) {
    const raw = matMatch[0]
    matricula = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    confidence += 40
  } else {
    reasons.push('matricula_not_found')
  }

  // NIF/CIF
  const nifMatch = normalizedText.match(/\b([a-z]\d{7}[0-9a-j]|\d{8}[a-z])\b/i)
  const vendorNif = nifMatch?.[1]?.toUpperCase()
  if (vendorNif) confidence += 20

  // IBAN (ES)
  const ibanMatch = normalizedText.match(/\b(es\d{2}[0-9]{20})\b/i)
  const vendorIban = ibanMatch?.[1]?.toUpperCase()
  if (vendorIban) confidence += 10

  // Invoice number
  const invoiceNoMatch =
    text.match(
      /factura\s*(?:nº|no\.?|número|num\.?)\s*[:\-]?\s*([a-z0-9\/\-_]+)/i
    ) || text.match(/\bn[ºo]\s*[:\-]?\s*([a-z0-9\/\-_]{4,})/i)
  const invoiceNumber = invoiceNoMatch?.[1]?.trim()
  if (invoiceNumber) confidence += 15

  // Date
  const dateMatch =
    text.match(
      /\bfecha\s*(?:factura|emisión|emision)?\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/i
    ) || text.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/)
  const invoiceDate = dateMatch?.[1]
    ? parseSpanishDate(dateMatch[1])
    : undefined
  if (invoiceDate) confidence += 10

  // Amounts (best-effort)
  const baseMatch =
    text.match(/\bbase\s*(?:imponible)?\s*[:\-]?\s*([0-9\.\,]+\s?€?)\b/i) ||
    text.match(/\bsubtotal\s*[:\-]?\s*([0-9\.\,]+\s?€?)\b/i)
  const ivaMatch =
    text.match(/\biva\s*[:\-]?\s*([0-9\.\,]+\s?€?)\b/i) ||
    text.match(/\bimpuesto\s*[:\-]?\s*([0-9\.\,]+\s?€?)\b/i)
  const totalMatch =
    text.match(/\btotal\s*(?:factura)?\s*[:\-]?\s*([0-9\.\,]+\s?€?)\b/i) ||
    text.match(/\bimporte\s*total\s*[:\-]?\s*([0-9\.\,]+\s?€?)\b/i)

  const base = baseMatch?.[1] ? parseSpanishNumber(baseMatch[1]) : undefined
  const iva = ivaMatch?.[1] ? parseSpanishNumber(ivaMatch[1]) : undefined
  const total = totalMatch?.[1] ? parseSpanishNumber(totalMatch[1]) : undefined

  if (total != null) confidence += 5

  if (!invoiceNumber) reasons.push('invoice_number_not_found')
  if (!vendorNif && !vendorIban) reasons.push('vendor_id_not_found')

  return {
    matricula,
    vendorNif,
    vendorIban,
    invoiceNumber,
    invoiceDate,
    base,
    iva,
    total,
    normalizedText,
    confidence,
    reasons,
  }
}
