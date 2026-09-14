/**
 * Motor puro del presupuesto: números de la hoja Presupuesto_2025 (SPEC).
 */
import {
  calcularPresupuesto,
  gpPorBandas,
  mesAnioEs,
  mesesEntre,
  mround5,
  plazosDisponibles,
  sumarDias,
  sumarMeses,
} from '@/lib/presupuesto/calculo'
import {
  OPCIONES_DEFECTO,
  PARAMETROS_DEFECTO,
  type EntradaCalculo,
  type OpcionesPresupuesto,
  type TarifaCalculo,
  type VehiculoCalculo,
} from '@/lib/presupuesto/tipos'

const HOY = '2026-09-14'

const T899: TarifaCalculo = {
  id: 1,
  nombre: '8,99 ATENEA sept-2026',
  coeficientes: {
    '120': 0.01476,
    '108': 0.0155,
    '96': 0.016501,
    '84': 0.017863,
    '72': 0.019758,
    '60': 0.022494,
    '48': 0.026691,
    '36': 0.033799,
  },
}
const T999: TarifaCalculo = {
  id: 2,
  nombre: '9,99 DIC-2022',
  coeficientes: {
    '120': 0.0151,
    '108': 0.016,
    '96': 0.0171,
    '84': 0.0186,
    '72': 0.021,
    '60': 0.024,
    '48': 0.028,
    '36': 0.035,
    '24': 0.05,
  },
}

const TESLA: VehiculoCalculo = {
  precio_contado: 32985,
  tarifa_financiacion: 'NORMAL',
  gp: 990,
  fecha_matriculacion: '2023-05-05',
  meses_garantia_fabrica: null,
}

function calc(
  vehiculo: Partial<VehiculoCalculo> = {},
  opciones: Partial<OpcionesPresupuesto> = {},
  extra: Partial<EntradaCalculo> = {}
) {
  return calcularPresupuesto({
    vehiculo: { ...TESLA, ...vehiculo },
    opciones: { ...OPCIONES_DEFECTO, ...opciones },
    params: PARAMETROS_DEFECTO,
    tarifaPremium: T899,
    tarifaSinPremium: T999,
    hoy: HOY,
    ...extra,
  })
}

const linea = (
  r: ReturnType<typeof calc>,
  col: 'sin_premium' | 'premium',
  clave: string
) => r.columnas[col].lineas.find((l) => l.clave === clave)
const cuota = (
  r: ReturnType<typeof calc>,
  col: 'sin_premium' | 'premium',
  plazo: number
) => r.columnas[col].cuotas.find((c) => c.plazo === plazo)

describe('Tesla #1088 (SPEC)', () => {
  it('financia NORMAL: derivados, dto, importes, totales, cuotas, plazos', () => {
    const r = calc()
    expect(r.derivados.tarifa).toBe('NORMAL')
    expect(r.derivados.pct).toBe(0.07)
    expect(r.derivados.edadMeses).toBe(40)
    expect(r.derivados.plazoMax).toBe(140)
    expect(r.derivados.sustitucion).toBe(true)
    expect(r.derivados.garantia.modo).toBe('LEGAL')
    expect(r.derivados.gp).toBe(990)
    expect(r.derivados.gpOrigen).toBe('ficha')
    expect(r.derivados.dto.base).toBe(32985)
    expect(r.derivados.dto.baseSinPct).toBeCloseTo(30827.1, 1)
    expect(r.derivados.dto.tope).toBeCloseTo(1400, 6)
    expect(r.derivados.dto.aplicado).toBe(1400)
    expect(r.financiable).toBe(true)

    expect(r.columnas.sin_premium.importe).toBe(33375)
    expect(r.columnas.premium.importe).toBe(34365)
    expect(r.columnas.sin_premium.total).toBe(31975)
    expect(r.columnas.premium.total).toBe(32965)
    expect(linea(r, 'sin_premium', 'total')?.etiqueta).toBe(
      'Importe a Financiar'
    )
    expect(linea(r, 'sin_premium', 'dto_financiacion')).toMatchObject({
      visible: true,
      importe: -1400,
      etiqueta: 'Descuento Financiación',
    })
    expect(linea(r, 'sin_premium', 'garantia')).toMatchObject({
      etiqueta: '12 meses Garantía Estándar',
      importe: 0,
      sinImporte: true,
    })
    expect(linea(r, 'premium', 'garantia')).toMatchObject({
      etiqueta: 'GARANTIA PREMIUM',
      subtitulo: 'en Servicio Oficial de 1 año',
      importe: 990,
    })

    expect(r.plazosMostrados).toEqual([120, 108, 96, 84, 72])
    expect(cuota(r, 'sin_premium', 120)?.cuota).toBe(483)
    expect(cuota(r, 'premium', 120)?.cuota).toBe(487)
    expect(r.columnas.sin_premium.tarifaNombre).toBe('9,99 DIC-2022')
    expect(r.columnas.premium.tarifaNombre).toBe('8,99 ATENEA sept-2026')
    expect(r.columnas.sin_premium.desde).toBe(483)
    expect(r.columnas.premium.desde).toBe(487)
    expect(r.ratioFinanciado).toBeCloseTo(1, 6)
    expect(r.avisos).toContain('FINANCIA MÁS 70%')
    expect(r.validoHasta).toBe('2026-09-21')
    expect(r.textos.validez).toBe('Presupuesto válido hasta el 21/09/2026')
    expect(r.textos.legal).toMatch(/^Validez del precio del vehículo 7 días/)
  })

  it('checks reflejan la hoja (financia, sin extensión, con sustitución)', () => {
    const r = calc()
    expect(r.checks.sin_premium).toEqual([
      { texto: 'Sin Garantía Premium', ok: false },
      { texto: '24 meses de permanencia', ok: false },
      { texto: 'Seguro protección del préstamo', ok: true },
    ])
    expect(r.checks.premium).toEqual([
      { texto: 'Garantía Premium en Servicio Oficial 1 año', ok: true },
      { texto: 'Posibilidad de adelantar dinero', ok: true },
      { texto: 'Seguro protección del préstamo', ok: true },
      { texto: 'Con vehículo de sustitución', ok: true },
    ])
  })

  it('sin financiar: sin dto, sin cuotas, totales = importes', () => {
    const r = calc({}, { financia: false })
    expect(r.financiable).toBe(false)
    expect(r.columnas.sin_premium.total).toBe(33375)
    expect(r.columnas.premium.total).toBe(34365)
    expect(r.plazosMostrados).toEqual([])
    expect(r.columnas.sin_premium.cuotas).toEqual([])
    expect(r.columnas.sin_premium.desde).toBeNull()
    expect(linea(r, 'sin_premium', 'dto_financiacion')?.visible).toBe(false)
    expect(linea(r, 'sin_premium', 'total')?.etiqueta).toBe('Total')
    expect(r.ratioFinanciado).toBeNull()
    expect(r.checks.sin_premium).toEqual([
      { texto: 'Sin Garantía Premium', ok: false },
    ])
    expect(r.checks.premium.map((c) => c.texto)).toEqual([
      'Garantía Premium en Servicio Oficial 1 año',
      'Con vehículo de sustitución',
    ])
  })
})

describe('descuento por financiar', () => {
  it('12485 NORMAL → 815 (sin tope, MROUND 5)', () => {
    const r = calc({ precio_contado: 12485 })
    expect(r.derivados.dto.baseSinPct).toBeCloseTo(11668.22, 2)
    expect(r.derivados.dto.bruto).toBeCloseTo(816.78, 2)
    expect(r.derivados.dto.redondeado).toBe(815)
    expect(r.derivados.dto.aplicado).toBe(815)
  })

  it('ESPECIAL usa 3 % y tope 600', () => {
    const r = calc({ tarifa_financiacion: 'ESPECIAL' })
    expect(r.derivados.pct).toBe(0.03)
    expect(r.derivados.dto.tope).toBeCloseTo(600, 6)
    expect(r.derivados.dto.aplicado).toBe(600)
  })

  it('tarifaOverride manda sobre la ficha', () => {
    const r = calc(
      { tarifa_financiacion: 'NORMAL' },
      { tarifaOverride: 'SIN_DTO' }
    )
    expect(r.derivados.tarifa).toBe('SIN_DTO')
    expect(r.derivados.dto.aplicado).toBe(0)
  })
})

describe('modos de plazo y tarifa', () => {
  it('PLAZO CORTO: dto 0, plazos [60,48,36,24], 24 sin cuota en la 8,99', () => {
    const r = calc({}, { modoPlazo: 'CORTO' })
    expect(r.derivados.dto.aplicado).toBe(0)
    expect(linea(r, 'sin_premium', 'dto_financiacion')?.visible).toBe(false)
    expect(r.columnas.sin_premium.total).toBe(33375)
    expect(r.plazosMostrados).toEqual([60, 48, 36, 24])
    expect(cuota(r, 'premium', 24)).toEqual({
      plazo: 24,
      cuota: null,
      coeficiente: null,
    })
    expect(cuota(r, 'sin_premium', 24)?.cuota).toBe(Math.round(33375 * 0.05))
    expect(cuota(r, 'premium', 60)?.cuota).toBe(Math.round(34365 * 0.022494))
  })

  it('SIN_DTO: sin dto y todos los plazos disponibles por edad', () => {
    const r = calc({ tarifa_financiacion: 'SIN_DTO' })
    expect(r.derivados.dto.aplicado).toBe(0)
    expect(r.plazosMostrados).toEqual([120, 108, 96, 84, 72, 60, 48, 36, 24])
    expect(
      r.columnas.premium.cuotas.filter((c) => c.cuota !== null)
    ).toHaveLength(8)
    expect(
      r.columnas.sin_premium.cuotas.filter((c) => c.cuota !== null)
    ).toHaveLength(9)
  })

  it('CONSULTAR: no financiable, aviso, sin cuotas', () => {
    const r = calc({ tarifa_financiacion: 'CONSULTAR' })
    expect(r.financiable).toBe(false)
    expect(r.avisos).toContain('Tarifa CONSULTAR: financiación no calculada')
    expect(r.plazosMostrados).toEqual([])
    expect(r.derivados.dto.aplicado).toBe(0)
    expect(r.columnas.sin_premium.total).toBe(33375)
  })

  it('CONSULTAR + coche JUNTO: el coche se resta como entrega separada', () => {
    const r = calc(
      { tarifa_financiacion: 'CONSULTAR' },
      { cocheEntrega: { valor: 5000, modo: 'JUNTO' } }
    )
    expect(r.derivados.entregaEfectiva).toBe('SEPARADO')
    const entrega = r.columnas.sin_premium.lineas.find(
      (l) => l.clave === 'entrega_vehiculo'
    )
    expect(entrega?.visible).toBe(true)
    expect(entrega?.importe).toBe(-5000)
    expect(r.columnas.sin_premium.total).toBe(33375 - 5000)
    expect(r.columnas.premium.total).toBe(34365 - 5000)
  })

  it('ficha sin tarifa → CONSULTAR', () => {
    expect(calc({ tarifa_financiacion: null }).derivados.tarifa).toBe(
      'CONSULTAR'
    )
  })

  it('plazoMax excluye 120 cuando la edad supera 60 meses', () => {
    const r = calc({ fecha_matriculacion: '2021-03-01' })
    expect(r.derivados.edadMeses).toBe(66)
    expect(r.derivados.plazoMax).toBe(114)
    expect(r.plazosMostrados).toEqual([108, 96, 84, 72])
  })

  it('NORMAL muestra 60 sólo si 72 no está disponible', () => {
    expect(
      plazosDisponibles({
        financia: true,
        tarifa: 'NORMAL',
        modo: 'NORMAL',
        plazoMax: 65,
      })
    ).toEqual([60])
    expect(
      plazosDisponibles({
        financia: true,
        tarifa: 'NORMAL',
        modo: 'CORTO',
        plazoMax: 65,
      })
    ).toEqual([48, 36, 24])
    expect(
      plazosDisponibles({
        financia: true,
        tarifa: 'NORMAL',
        modo: 'NORMAL',
        plazoMax: 30,
      })
    ).toEqual([])
  })

  it('sin ningún plazo con coeficiente → aviso', () => {
    const r = calc({ fecha_matriculacion: '2013-01-01' })
    expect(r.plazosMostrados).toEqual([])
    expect(r.avisos).toContain(
      'Sin plazos disponibles para la edad del vehículo'
    )
  })
})

describe('coche a cambio, entrada, préstamo, extra', () => {
  it('SEPARADO 5000: línea entrega visible y la base del dto baja', () => {
    const r = calc({}, { cocheEntrega: { valor: 5000, modo: 'SEPARADO' } })
    expect(r.derivados.entregaEfectiva).toBe('SEPARADO')
    expect(linea(r, 'sin_premium', 'entrega_vehiculo')).toMatchObject({
      visible: true,
      importe: -5000,
    })
    expect(r.derivados.dto.base).toBe(27985)
    expect(r.derivados.dto.aplicado).toBe(1400)
    expect(r.columnas.sin_premium.importe).toBe(28375)
    expect(r.columnas.sin_premium.total).toBe(26975)
  })

  it('JUNTO: línea entrega oculta, etiqueta combinada, importe −(dto+coche)', () => {
    const r = calc({}, { cocheEntrega: { valor: 5000, modo: 'JUNTO' } })
    expect(r.derivados.entregaEfectiva).toBe('JUNTO')
    expect(linea(r, 'sin_premium', 'entrega_vehiculo')?.visible).toBe(false)
    expect(linea(r, 'sin_premium', 'dto_financiacion')).toMatchObject({
      visible: true,
      etiqueta: 'Entrega Vehículo y Descuento Financiación',
      importe: -6400,
    })
    expect(r.derivados.dto.linea).toBe(6400)
    expect(r.columnas.sin_premium.importe).toBe(33375)
    expect(r.columnas.sin_premium.total).toBe(26975)
  })

  it('JUNTO cae a SEPARADO si no financia, PLAZO CORTO o SIN_DTO', () => {
    const coche = { cocheEntrega: { valor: 5000, modo: 'JUNTO' as const } }
    expect(
      calc({}, { ...coche, financia: false }).derivados.entregaEfectiva
    ).toBe('SEPARADO')
    expect(
      calc({}, { ...coche, modoPlazo: 'CORTO' }).derivados.entregaEfectiva
    ).toBe('SEPARADO')
    expect(
      calc({ tarifa_financiacion: 'SIN_DTO' }, coche).derivados.entregaEfectiva
    ).toBe('SEPARADO')
    const r = calc({}, { ...coche, financia: false })
    expect(linea(r, 'sin_premium', 'entrega_vehiculo')?.visible).toBe(true)
    expect(r.columnas.sin_premium.total).toBe(28375)
  })

  it('entrada 3000 y préstamo 2000', () => {
    const r = calc({}, { entrada: 3000, prestamoPendiente: 2000 })
    expect(r.derivados.dto.base).toBe(31985)
    expect(r.derivados.dto.aplicado).toBe(1400)
    expect(linea(r, 'sin_premium', 'entrada')).toMatchObject({
      visible: true,
      importe: -3000,
    })
    expect(linea(r, 'sin_premium', 'prestamo')).toMatchObject({
      visible: true,
      importe: 2000,
    })
    expect(r.columnas.sin_premium.importe).toBe(33375)
    expect(r.columnas.sin_premium.total).toBe(30975)
    expect(r.columnas.premium.total).toBe(31965)
    expect(r.ratioFinanciado).toBeCloseTo(30975 / 31975, 6)
  })

  it('extra en ambas columnas', () => {
    const r = calc({}, { extra: { concepto: 'Ruedas', importe: 200 } })
    for (const col of ['sin_premium', 'premium'] as const) {
      expect(linea(r, col, 'extra')).toMatchObject({
        visible: true,
        etiqueta: 'Ruedas',
        importe: 200,
      })
    }
    expect(r.columnas.sin_premium.total).toBe(32175)
    expect(r.columnas.premium.total).toBe(33165)
  })

  it('líneas monetarias con 2 decimales, cuota entera', () => {
    const r = calc({
      precio_contado: 12345.678,
      tarifa_financiacion: 'SIN_DTO',
    })
    expect(linea(r, 'sin_premium', 'contado')?.importe).toBe(12345.68)
    expect(r.columnas.sin_premium.total).toBe(12735.68)
    expect(Number.isInteger(cuota(r, 'sin_premium', 120)?.cuota)).toBe(true)
  })
})

describe('garantía', () => {
  it('EXTENSION: 60 meses de fábrica desde 2023-05-05', () => {
    const r = calc({ meses_garantia_fabrica: 60 })
    expect(r.derivados.garantia).toEqual({
      modo: 'EXTENSION',
      quedaOficial: true,
      finFabrica: '2028-05-05',
      mesesQuedan: 19,
      precioExtension: 890,
      textoOficial: 'Garantía Oficial hasta mayo-2028',
    })
    expect(linea(r, 'sin_premium', 'garantia')).toBeUndefined()
    expect(linea(r, 'premium', 'garantia')).toMatchObject({
      etiqueta: 'Extensión GARANTIA PREMIUM',
      importe: 890,
    })
    expect(r.columnas.sin_premium.importe).toBe(33375)
    expect(r.columnas.premium.importe).toBe(32985 + 890 + 390)
    expect(r.checks.premium[0]).toEqual({
      texto: 'Exten. Garantía Premium en S.Oficial 1 año',
      ok: true,
    })
  })

  it('extensión a 690 si contado < 20000', () => {
    const r = calc({ precio_contado: 19999, meses_garantia_fabrica: 60 })
    expect(r.derivados.garantia.precioExtension).toBe(690)
    expect(linea(r, 'premium', 'garantia')?.importe).toBe(690)
  })

  it('quedan ≤ 6 meses → LEGAL aunque siga en garantía oficial', () => {
    const r = calc({ meses_garantia_fabrica: 42 })
    expect(r.derivados.garantia.modo).toBe('LEGAL')
    expect(r.derivados.garantia.quedaOficial).toBe(true)
    expect(r.derivados.garantia.mesesQuedan).toBe(1)
    expect(r.derivados.garantia.textoOficial).toBe(
      'Garantía Oficial hasta noviembre-2026'
    )
  })

  it('garantía de fábrica vencida → LEGAL sin texto', () => {
    const r = calc({ meses_garantia_fabrica: 24 })
    expect(r.derivados.garantia.modo).toBe('LEGAL')
    expect(r.derivados.garantia.quedaOficial).toBe(false)
    expect(r.derivados.garantia.textoOficial).toBeNull()
  })
})

describe('sustitución y GP', () => {
  it('sustitución auto por edad, forzable', () => {
    expect(
      calc({ fecha_matriculacion: '2019-01-01' }).derivados.sustitucion
    ).toBe(false)
    expect(calc({}, { sustitucion: 'no' }).derivados.sustitucion).toBe(false)
    expect(
      calc({ fecha_matriculacion: '2019-01-01' }, { sustitucion: 'si' })
        .derivados.sustitucion
    ).toBe(true)
  })

  it('GP por bandas si la ficha no lo tiene', () => {
    const r = calc({ gp: null, precio_contado: 12485 })
    expect(r.derivados.gp).toBe(590)
    expect(r.derivados.gpOrigen).toBe('bandas')
    const b = PARAMETROS_DEFECTO.gp_bandas
    expect(gpPorBandas(9999, b)).toBe(490)
    expect(gpPorBandas(10000, b)).toBe(590)
    expect(gpPorBandas(20000, b)).toBe(790)
    expect(gpPorBandas(50000, b)).toBe(990)
  })

  it('sin fecha de matriculación → edad 0 + aviso', () => {
    const r = calc({ fecha_matriculacion: null })
    expect(r.derivados.edadMeses).toBe(0)
    expect(r.avisos).toContain('Sin fecha de matriculación: se asume 0 meses')
  })

  it('sin precio contado → error', () => {
    expect(() => calc({ precio_contado: 0 })).toThrow()
  })
})

describe('helpers de fecha y redondeo', () => {
  it('mesesEntre con semántica DATEDIF "m"', () => {
    expect(mesesEntre('2023-05-05', '2026-09-14')).toBe(40)
    expect(mesesEntre('2023-05-05', '2026-09-04')).toBe(39)
    expect(mesesEntre('2023-05-05', '2026-09-05')).toBe(40)
    expect(mesesEntre('2026-09-14', '2026-09-01')).toBe(0)
  })

  it('mround5', () => {
    expect(mround5(816.78)).toBe(815)
    expect(mround5(817.5)).toBe(820)
    expect(mround5(0)).toBe(0)
  })

  it('sumarMeses / sumarDias / mesAnioEs', () => {
    expect(sumarMeses('2023-05-05', 60)).toBe('2028-05-05')
    expect(sumarMeses('2024-01-31', 1)).toBe('2024-02-29')
    expect(sumarDias('2026-09-14', 7)).toBe('2026-09-21')
    expect(sumarDias('2026-12-28', 7)).toBe('2027-01-04')
    expect(mesAnioEs('2025-05-10')).toBe('mayo-2025')
  })
})
