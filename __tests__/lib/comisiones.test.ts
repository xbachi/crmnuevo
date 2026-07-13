/**
 * Motor de comisiones: tramos por ratio financiado (no por la etiqueta
 * formaPago), porcentajes como número humano, y bono mensual no acumulativo.
 */

import {
  CONFIG_POR_DEFECTO,
  calcularBonoMensual,
  calcularComision,
  configPorDefecto,
  normalizarConfig,
  type CondicionesComision,
} from '@/lib/comisiones'

const CONFIG = CONFIG_POR_DEFECTO

/** Venta de 20.000 € con el monto financiado que se le pase. */
const venta = (
  over: Partial<CondicionesComision> = {}
): CondicionesComision => ({
  formaPago: 'financiado',
  garantiaPremium: false,
  precioVenta: 20000,
  montoFinanciado: null,
  ...over,
})

describe('tramo contado (ratio 0)', () => {
  it('standard → 25 €, premium → 40 €', () => {
    const std = calcularComision(
      venta({ formaPago: 'contado', montoFinanciado: null }),
      CONFIG
    )
    expect(std.tramo).toBe('contado')
    expect(std.ratioFinanciado).toBe(0)
    expect(std.total).toBe(25)

    const prem = calcularComision(
      venta({ formaPago: 'contado', garantiaPremium: true }),
      CONFIG
    )
    expect(prem.total).toBe(40)
    expect(prem.pctAplicado).toBeNull()
  })
})

describe('tramo financiado por debajo del umbral', () => {
  it('ratio 0,50 → 20 € standard / 50 € premium', () => {
    const std = calcularComision(venta({ montoFinanciado: 10000 }), CONFIG)
    expect(std.tramo).toBe('financiadoBajo')
    expect(std.ratioFinanciado).toBeCloseTo(0.5)
    expect(std.total).toBe(20)

    const prem = calcularComision(
      venta({ montoFinanciado: 10000, garantiaPremium: true }),
      CONFIG
    )
    expect(prem.tramo).toBe('financiadoBajo')
    expect(prem.total).toBe(50)
  })

  it('ratio 0,6999 sigue en el tramo bajo (umbral no alcanzado)', () => {
    const r = calcularComision(venta({ montoFinanciado: 13998 }), CONFIG) // 0,6999
    expect(r.ratioFinanciado).toBeCloseTo(0.6999, 4)
    expect(r.tramo).toBe('financiadoBajo')
    expect(r.total).toBe(20)
  })
})

describe('tramo financiado desde el umbral (inclusive)', () => {
  it('ratio exactamente 0,70 ya es tramo alto', () => {
    const r = calcularComision(venta({ montoFinanciado: 14000 }), CONFIG)
    expect(r.ratioFinanciado).toBeCloseTo(0.7)
    expect(r.tramo).toBe('financiadoAlto')
    expect(r.pctAplicado).toBe(0.4)
    expect(r.total).toBe(56) // 0,4% de 14.000
  })

  it('aplica el % correcto sobre el importe financiado (20.000 €)', () => {
    const std = calcularComision(
      venta({ precioVenta: 20000, montoFinanciado: 20000 }),
      CONFIG
    )
    expect(std.total).toBe(80) // 0,4% de 20.000

    const prem = calcularComision(
      venta({
        precioVenta: 20000,
        montoFinanciado: 20000,
        garantiaPremium: true,
      }),
      CONFIG
    )
    expect(prem.pctAplicado).toBe(1)
    expect(prem.total).toBe(200) // 1% de 20.000 — NUNCA 100% (20.000)
  })

  it('pctPremium: 1 no se interpreta como 100%', () => {
    const r = calcularComision(
      venta({ montoFinanciado: 20000, garantiaPremium: true }),
      CONFIG
    )
    expect(r.total).toBe(200)
    expect(r.total).not.toBe(20000)
  })
})

describe('el ratio manda, no la etiqueta formaPago', () => {
  it('MIXTO con ratio ≥ 70% cobra el % y NO la tarifa fija', () => {
    // 20.000 €: 5.000 al contado + 15.000 financiados → ratio 0,75.
    const r = calcularComision(
      venta({ formaPago: 'mixto', montoFinanciado: 15000 }),
      CONFIG
    )
    expect(r.tramo).toBe('financiadoAlto')
    expect(r.total).toBe(60) // 0,4% de 15.000, no los 20 € de tarifa fija
    expect(r.total).not.toBe(20)
  })

  it('MIXTO con ratio < 70% cobra la tarifa fija del tramo bajo', () => {
    const r = calcularComision(
      venta({ formaPago: 'mixto', montoFinanciado: 6000, garantiaPremium: true }),
      CONFIG
    )
    expect(r.tramo).toBe('financiadoBajo')
    expect(r.total).toBe(50)
  })

  it('etiqueta financiado pero sin monto financiado → tramo contado', () => {
    const r = calcularComision(venta({ montoFinanciado: 0 }), CONFIG)
    expect(r.tramo).toBe('contado')
    expect(r.total).toBe(25)
  })
})

describe('calcularBonoMensual — solo el escalón alcanzado (no acumulativo)', () => {
  const casos: Array<[number, number, number | null]> = [
    [0, 0, null],
    [3, 0, null],
    [4, 50, 4],
    [5, 50, 4],
    [6, 100, 6],
    [9, 200, 8], // escalón de 8, no 8+6+4
    [16, 500, 16],
    [20, 500, 16], // por encima del último se queda en el último
  ]

  it.each(casos)(
    '%d ventas → bono %d € (escalón %s)',
    (ventas, importe, escalon) => {
      const b = calcularBonoMensual(ventas, CONFIG)
      expect(b.importe).toBe(importe)
      expect(b.escalon).toBe(escalon)
    }
  )

  it('informa cuántas ventas faltan para el siguiente escalón', () => {
    const b = calcularBonoMensual(9, CONFIG)
    expect(b.siguienteEscalon).toEqual({ minVentas: 10, importe: 250 })
    expect(b.faltanParaSiguiente).toBe(1)

    const ultimo = calcularBonoMensual(20, CONFIG)
    expect(ultimo.siguienteEscalon).toBeNull()
    expect(ultimo.faltanParaSiguiente).toBeNull()
  })
})

describe('normalizarConfig', () => {
  it('acepta la config real (incluidos números como string, caso JSONB)', () => {
    const raw = JSON.parse(JSON.stringify(CONFIG))
    raw.umbralFinanciado = '0.7'
    raw.financiadoAlto.pctPremium = '1'
    expect(normalizarConfig(raw)).toEqual(configPorDefecto())
  })

  it('ordena los escalones de bono por minVentas', () => {
    const raw = JSON.parse(JSON.stringify(CONFIG))
    raw.bonos = [
      { minVentas: 8, importe: 200 },
      { minVentas: 4, importe: 50 },
    ]
    expect(normalizarConfig(raw)?.bonos).toEqual([
      { minVentas: 4, importe: 50 },
      { minVentas: 8, importe: 200 },
    ])
  })

  it('rechaza configs inválidas', () => {
    expect(normalizarConfig(null)).toBeNull()
    expect(normalizarConfig({})).toBeNull()

    // umbral > 1: es una fracción, no un porcentaje (70 sería un x100 clásico)
    const umbralComoPct = JSON.parse(JSON.stringify(CONFIG))
    umbralComoPct.umbralFinanciado = 70
    expect(normalizarConfig(umbralComoPct)).toBeNull()

    const negativo = JSON.parse(JSON.stringify(CONFIG))
    negativo.contado.standard = -1
    expect(normalizarConfig(negativo)).toBeNull()

    const sinBonos = JSON.parse(JSON.stringify(CONFIG))
    delete sinBonos.bonos
    expect(normalizarConfig(sinBonos)).toBeNull()

    const bonoRoto = JSON.parse(JSON.stringify(CONFIG))
    bonoRoto.bonos = [{ minVentas: 0, importe: 10 }]
    expect(normalizarConfig(bonoRoto)).toBeNull()
  })
})
