/**
 * Static invoice configuration.
 *
 * Eventually this will be backed by a `invoice_config` table editable
 * from /facturacion/configuracion (Phase 4). For now it lives as a
 * constants file so the gestor can edit one place to change vendor
 * details or legal wording.
 *
 * IMPORTANT: the REBU legal note is what currently appears in the PDF
 * (existing wording at src/lib/contractGenerator.ts:1821). Do not
 * change it without confirming with the gestor/contador.
 */

export const INVOICE_CONFIG = {
  vendor: {
    legalName: 'Seven Cars Motors S.L.',
    cif: 'B-75939868',
    address: 'Camí els Mollons, 36',
    city: 'Alaquàs',
    postalCode: '46970',
    province: 'Valencia',
    country: 'España',
    phone: '+34 673 421 905',
    email: 'hola@sevencars.es',
    iban: 'ES96 0049 5457 2621 1617 3055',
    registroMercantil:
      'Registro Mercantil de Valencia 25/02/2025, FOLIO ELECTRÓNICO, inscripción 1, hoja V-223873.',
  },

  rebu: {
    /**
     * Mención legal obligatoria que debe aparecer en TODAS las facturas
     * emitidas bajo el Régimen Especial de Bienes Usados (REBU). Texto
     * formal validado por el gestor.
     */
    legalNote:
      'Operación sujeta al Régimen Especial de Bienes Usados, Objetos de Arte, Antigüedades y Objetos de Colección (Art. 135-139 de la Ley 37/1992 del IVA). Factura sin desglose de IVA conforme al régimen aplicado.',
  },

  vat: {
    standardRate: 21.0,
  },

  formatting: {
    /**
     * Default sprintf-style padding when a sequence row doesn't define
     * its own. Each invoice_sequences row carries its own number_format
     * (REBU uses %03d, VAT uses %04d) — this is just the fallback.
     */
    defaultNumberFormat: '%03d',
  },

  storage: {
    /** Vercel Blob path prefix for invoice PDFs. */
    blobPrefix: 'invoices/',
  },
} as const

export type InvoiceConfig = typeof INVOICE_CONFIG

/**
 * Format an invoice's number portion using a sprintf-style %0Nd template.
 * Examples:
 *   formatNumber(23, '%03d')    // "023"
 *   formatNumber(4222, '%04d')  // "4222"
 *   formatNumber(10000, '%04d') // "10000" (no truncation)
 */
export function formatNumber(value: number, format: string): string {
  const m = format.match(/^%0?(\d+)d$/)
  if (!m) return String(value)
  const width = parseInt(m[1], 10)
  const s = String(value)
  return s.length >= width ? s : s.padStart(width, '0')
}

/** Build the displayed invoice number from a sequence row + current number. */
export function buildFullInvoiceNumber(
  series: string,
  number: number,
  format: string
): string {
  return `${series}-${formatNumber(number, format)}`
}
