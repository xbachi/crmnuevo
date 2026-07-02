import { parseImporte } from '@/lib/gastoImporte'

describe('parseImporte (importe de facturas de proveedor)', () => {
  it('acepta números', () => {
    expect(parseImporte(90.75)).toBe(90.75)
    expect(parseImporte(0)).toBe(0)
  })
  it('coma decimal española con €', () => {
    expect(parseImporte('223,85€')).toBe(223.85)
    expect(parseImporte('90,75 €')).toBe(90.75)
  })
  it('miles con punto + coma decimal', () => {
    expect(parseImporte('1.234,56')).toBe(1234.56)
    expect(parseImporte('16.664,00 €')).toBe(16664)
  })
  it('punto decimal simple', () => {
    expect(parseImporte('141.57')).toBe(141.57)
  })
  it('rechaza basura', () => {
    expect(parseImporte('')).toBeNull()
    expect(parseImporte(null)).toBeNull()
    expect(parseImporte('abc')).toBeNull()
  })
})
