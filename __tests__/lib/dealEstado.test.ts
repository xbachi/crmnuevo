import {
  DEAL_ESTADOS,
  getDealEstadoClass,
  getDealEstadoLabel,
  normalizarDealEstado,
} from '@/lib/dealEstado'

describe('dealEstado', () => {
  it('la misma clase para facturado en cualquier casing', () => {
    expect(getDealEstadoClass('FACTURADO')).toBe(
      getDealEstadoClass('facturado')
    )
    expect(getDealEstadoClass('Facturado')).toContain('purple')
  })

  it('label canónico con espacios y casing mezclado', () => {
    expect(getDealEstadoLabel(' Reservado ')).toBe('Reservado')
    expect(normalizarDealEstado(' VENDIDO ')).toBe('vendido')
  })

  it('fallback a nuevo con null, undefined o basura', () => {
    expect(normalizarDealEstado(null)).toBe('nuevo')
    expect(normalizarDealEstado(undefined)).toBe('nuevo')
    expect(normalizarDealEstado('lo-que-sea')).toBe('nuevo')
    expect(getDealEstadoLabel(null)).toBe('Nuevo')
    expect(getDealEstadoClass(null)).toBe(getDealEstadoClass('nuevo'))
  })

  it('todos los estados tienen label y clase distintos', () => {
    const labels = new Set(DEAL_ESTADOS.map(getDealEstadoLabel))
    const clases = new Set(DEAL_ESTADOS.map(getDealEstadoClass))
    expect(labels.size).toBe(DEAL_ESTADOS.length)
    expect(clases.size).toBe(DEAL_ESTADOS.length)
  })
})
