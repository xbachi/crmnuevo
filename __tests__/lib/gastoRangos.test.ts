import { validarImporte } from '@/lib/gastoRangos'

describe('validarImporte — guardas anti-basura', () => {
  it('acepta compra normal', () => {
    expect(validarImporte('precioCompra', 18100)).toEqual({ ok: true })
  })
  it('RECHAZA la basura del incidente (156.372 de compra)', () => {
    const r = validarImporte('precioCompra', 156372)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/máximo/)
  })
  it('avisa (no rechaza) compra inusualmente alta', () => {
    const r = validarImporte('precioCompra', 47104)
    expect(r.ok).toBe(true)
    expect(r.warn).toMatch(/alto/)
  })
  it('rechaza mecauto absurdo', () => {
    expect(validarImporte('gastosMecanica', 50000).ok).toBe(false)
  })
  it('acepta limpieza típica (90,75) y avisa si alta', () => {
    expect(validarImporte('gastosLimpieza', 90.75)).toEqual({ ok: true })
    expect(validarImporte('gastosLimpieza', 500).warn).toMatch(/alto/)
  })
  it('rechaza negativos', () => {
    expect(validarImporte('precioCompra', -5).ok).toBe(false)
  })
  it('campo sin rango → no valida', () => {
    expect(validarImporte('campoRaro', 999999)).toEqual({ ok: true })
  })
})
