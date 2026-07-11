import {
  normalizeNumeroFacturaKey,
  normalizeProveedorKey,
  sameMoneyAmount,
} from '@/lib/gastoInvoiceIdentity'

describe('identidad de facturas de gasto', () => {
  it('normaliza proveedor sin depender de mayúsculas ni espacios repetidos', () => {
    expect(normalizeProveedorKey('  World   Detailing ')).toBe(
      'world detailing'
    )
  })

  it('normaliza el número sin depender de mayúsculas ni espacios', () => {
    expect(normalizeNumeroFacturaKey(' ab  123 ')).toBe('AB123')
  })

  it('compara importes con precisión de céntimos', () => {
    expect(sameMoneyAmount(120.5, 120.504)).toBe(true)
    expect(sameMoneyAmount(120.5, 120.51)).toBe(false)
  })
})
