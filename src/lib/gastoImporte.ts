/**
 * Parsea el importe (total con IVA) de una factura de proveedor.
 * Acepta número o string en formato español ("1.234,56€", "90,75 €") o
 * con punto decimal ("141.57"). Devuelve null si no es parseable.
 */
export function parseImporte(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v !== 'string') return null
  const s = v.replace(/[^\d.,-]/g, '')
  if (!s) return null
  let n: number
  if (s.includes(',')) n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  else n = parseFloat(s)
  return isFinite(n) ? n : null
}
