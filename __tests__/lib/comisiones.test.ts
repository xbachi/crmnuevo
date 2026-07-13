/**
 * calcularComision — todos los cruces: 3 formas de pago × 2 garantía ×
 * con/sin monto financiado, más pendienteConfig y normalización de config.
 */

import {
  calcularComision,
  configVacia,
  esConfigPendiente,
  normalizarConfig,
  type ComisionConfig,
  type FormaPago,
} from '@/lib/comisiones'

const CONFIG: ComisionConfig = {
  base: {
    contado: { conGarantiaPremium: 150, sinGarantiaPremium: 100 },
    financiado: { conGarantiaPremium: 300, sinGarantiaPremium: 250 },
    mixto: { conGarantiaPremium: 220, sinGarantiaPremium: 180 },
  },
  pctMontoFinanciado: 2,
}

describe('calcularComision — cruces base (forma de pago × garantía premium)', () => {
  const casos: Array<[FormaPago, boolean, number]> = [
    ['contado', true, 150],
    ['contado', false, 100],
    ['financiado', true, 300],
    ['financiado', false, 250],
    ['mixto', true, 220],
    ['mixto', false, 180],
  ]

  it.each(casos)(
    '%s / garantiaPremium=%s → base %d',
    (formaPago, garantiaPremium, esperado) => {
      const r = calcularComision(
        { formaPago, garantiaPremium, montoFinanciado: null },
        CONFIG
      )
      expect(r.base).toBe(esperado)
      expect(r.extraFinanciacion).toBe(0)
      expect(r.total).toBe(esperado)
      expect(r.pendienteConfig).toBe(false)
    }
  )
})

describe('calcularComision — extra por monto financiado', () => {
  it('financiado suma el % del monto financiado', () => {
    const r = calcularComision(
      { formaPago: 'financiado', garantiaPremium: true, montoFinanciado: 10000 },
      CONFIG
    )
    expect(r.base).toBe(300)
    expect(r.extraFinanciacion).toBe(200) // 2% de 10.000
    expect(r.total).toBe(500)
  })

  it('mixto suma el % solo sobre la parte financiada', () => {
    const r = calcularComision(
      { formaPago: 'mixto', garantiaPremium: false, montoFinanciado: 5000 },
      CONFIG
    )
    expect(r.base).toBe(180)
    expect(r.extraFinanciacion).toBe(100)
    expect(r.total).toBe(280)
  })

  it('contado NUNCA suma extra aunque venga un monto financiado', () => {
    const r = calcularComision(
      { formaPago: 'contado', garantiaPremium: true, montoFinanciado: 10000 },
      CONFIG
    )
    expect(r.extraFinanciacion).toBe(0)
    expect(r.total).toBe(150)
  })

  it('redondea el extra a 2 decimales', () => {
    const r = calcularComision(
      { formaPago: 'financiado', garantiaPremium: false, montoFinanciado: 3333.33 },
      CONFIG
    )
    expect(r.extraFinanciacion).toBe(66.67)
  })
})

describe('pendienteConfig', () => {
  it('config toda en 0 → pendienteConfig=true y comisiones en 0', () => {
    const r = calcularComision(
      { formaPago: 'financiado', garantiaPremium: true, montoFinanciado: 10000 },
      configVacia()
    )
    expect(r.pendienteConfig).toBe(true)
    expect(r.total).toBe(0)
  })

  it('cualquier valor distinto de 0 → pendienteConfig=false', () => {
    const config = configVacia()
    config.base.contado.sinGarantiaPremium = 50
    expect(esConfigPendiente(config)).toBe(false)

    const soloPct = configVacia()
    soloPct.pctMontoFinanciado = 1
    expect(esConfigPendiente(soloPct)).toBe(false)
  })
})

describe('normalizarConfig', () => {
  it('acepta la config completa (incluidos números como string, caso JSONB)', () => {
    const raw = JSON.parse(JSON.stringify(CONFIG))
    raw.pctMontoFinanciado = '2'
    expect(normalizarConfig(raw)).toEqual(CONFIG)
  })

  it('rechaza configs incompletas, negativas o no numéricas', () => {
    expect(normalizarConfig(null)).toBeNull()
    expect(normalizarConfig({})).toBeNull()
    expect(
      normalizarConfig({ base: { contado: { conGarantiaPremium: 1 } } })
    ).toBeNull()
    const negativa = JSON.parse(JSON.stringify(CONFIG))
    negativa.pctMontoFinanciado = -1
    expect(normalizarConfig(negativa)).toBeNull()
    const nan = JSON.parse(JSON.stringify(CONFIG))
    nan.base.mixto.sinGarantiaPremium = 'mucho'
    expect(normalizarConfig(nan)).toBeNull()
  })
})
