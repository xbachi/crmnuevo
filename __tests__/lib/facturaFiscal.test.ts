/**
 * Capa fiscal pura: normalización de líneas, cuadre y decisión de estado.
 *
 * El foco es `chequearMatematica`: es el guard que existe por el incidente de
 * julio (importes de 47.104 € / 156.372 € extraídos por "el número más grande").
 */
import {
  parseLineas,
  chequearMatematica,
  decidirEstado,
  type LineaFiscal,
} from '@/lib/facturaFiscal'

/** Línea de IVA lista para el cuadre (evita repetir los campos opcionales). */
const iva = (orden: number, base: number, tipoIva: number, cuota: number): LineaFiscal => ({
  orden, tipoLinea: 'iva', tipoIva, base, cuota,
})

describe('parseLineas', () => {
  it('entrada no-array o vacía → sin líneas y SIN errores (es el body viejo de n8n)', () => {
    for (const raw of [undefined, null, [], 'nope', 42, {}]) {
      expect(parseLineas(raw)).toEqual({ lineas: [], errores: [] })
    }
  })

  it('normaliza importes es_ES y asigna orden autoincremental si falta', () => {
    const { lineas, errores } = parseLineas([
      { base: '1.234,56', tipoIva: 21, cuota: '259,26' },
      { base: '100', tipoIva: '10', cuota: 10 },
    ])
    expect(errores).toEqual([])
    expect(lineas).toHaveLength(2)
    expect(lineas[0]).toMatchObject({ orden: 1, tipoLinea: 'iva', base: 1234.56, cuota: 259.26, tipoIva: 21 })
    expect(lineas[1]).toMatchObject({ orden: 2, base: 100, cuota: 10, tipoIva: 10 })
  })

  it('tipoLinea por defecto "iva"; concepto y deducible se conservan', () => {
    const { lineas } = parseLineas([{ base: 50, tipoIva: 21, cuota: 10.5, concepto: ' Alquiler ', deducible: 'SI' }])
    expect(lineas[0]).toMatchObject({ tipoLinea: 'iva', concepto: 'Alquiler', deducible: 'si' })
  })

  it('tipoLinea fuera del CHECK → línea descartada con error (jamás llega al INSERT)', () => {
    const { lineas, errores } = parseLineas([{ base: 100, tipoLinea: 'inventado' }, { base: 50, tipoIva: 21, cuota: 10.5 }])
    expect(lineas).toHaveLength(1)
    expect(lineas[0].base).toBe(50)
    expect(errores[0]).toContain('tipoLinea inválido')
    expect(errores[0]).toContain('descartada')
  })

  it('base no parseable → línea descartada con error (base es NOT NULL)', () => {
    const { lineas, errores } = parseLineas([{ base: 'ochenta euros', tipoIva: 21 }])
    expect(lineas).toEqual([])
    expect(errores[0]).toContain('base no parseable')
  })

  it('cuota ausente → 0; cuota impresentable → 0 + error, pero la línea se conserva', () => {
    const a = parseLineas([{ base: 100, tipoLinea: 'exenta' }])
    expect(a.lineas[0].cuota).toBe(0)
    expect(a.errores).toEqual([])

    const b = parseLineas([{ base: 100, tipoIva: 21, cuota: 'n/d' }])
    expect(b.lineas).toHaveLength(1)
    expect(b.lineas[0].cuota).toBe(0)
    expect(b.errores[0]).toContain('cuota no parseable')
  })

  it('deducible fuera del CHECK → se ignora (null hereda la cabecera), con error', () => {
    const { lineas, errores } = parseLineas([{ base: 100, tipoIva: 21, cuota: 21, deducible: 'quizas' }])
    expect(lineas[0].deducible).toBeNull()
    expect(errores[0]).toContain('deducible inválido')
  })

  it('orden duplicado → se reasigna al próximo libre (UNIQUE(registro_id, orden))', () => {
    const { lineas, errores } = parseLineas([
      { orden: 1, base: 10, tipoIva: 21, cuota: 2.1 },
      { orden: 1, base: 20, tipoIva: 21, cuota: 4.2 },
    ])
    expect(lineas.map((l) => l.orden)).toEqual([1, 2])
    expect(errores[0]).toContain('orden 1 duplicado')
  })
})

describe('chequearMatematica — cuadre', () => {
  it('cuadre exacto → ok, sin errores', () => {
    const r = chequearMatematica([iva(1, 100, 21, 21)], 121)
    expect(r.ok).toBe(true)
    expect(r.errores).toEqual([])
    expect(r).toMatchObject({ baseTotal: 100, cuotaTotal: 21, calculado: 121, declarado: 121, diferencia: 0 })
  })

  it('redondeo de ±0,01 dentro de tolerancia → ok (cada proveedor redondea distinto)', () => {
    // 82,64 × 21% = 17,3544 → el proveedor imprime 17,36
    const r = chequearMatematica([iva(1, 82.64, 21, 17.36)], 100)
    expect(r.ok).toBe(true)
    expect(r.calculado).toBe(100)
  })

  it('IVA mixto 21 + 10 → suma ambas bases y cuotas', () => {
    const r = chequearMatematica([iva(1, 100, 21, 21), iva(2, 50, 10, 5)], 176)
    expect(r.ok).toBe(true)
    expect(r).toMatchObject({ baseTotal: 150, cuotaTotal: 26, calculado: 176 })
  })

  it('cuota que no se deriva de base × tipo → error accionable, en formato es_ES', () => {
    const r = chequearMatematica([iva(1, 100, 21, 12.34)], 112.34)
    expect(r.ok).toBe(false)
    expect(r.errores).toContain('línea 1: cuota 12,34 no cuadra con base 100,00 × 21% (esperado 21,00)')
  })

  it('línea de IVA sin tipoIva → error', () => {
    const r = chequearMatematica([{ orden: 1, tipoLinea: 'iva', tipoIva: null, base: 100, cuota: 21 }], 121)
    expect(r.ok).toBe(false)
    expect(r.errores[0]).toContain('falta tipoIva')
  })

  it('el total declarado que no cuadra con las líneas se delata (el bug de julio)', () => {
    // Líneas coherentes por 121 €, pero el extractor declaró 47.104 €
    const r = chequearMatematica([iva(1, 100, 21, 21)], 47104)
    expect(r.ok).toBe(false)
    expect(r.diferencia).toBe(-46983)
    expect(r.errores[0]).toContain('el total calculado 121,00 no cuadra con el importe declarado 47104,00')
  })

  it('ISP: la cuota es autorepercutida → no se paga ni entra en cuotaTotal, pero sí se valida', () => {
    const r = chequearMatematica([{ orden: 1, tipoLinea: 'isp', tipoIva: 21, base: 1000, cuota: 210 }], 1000)
    expect(r.ok).toBe(true)
    expect(r).toMatchObject({ baseTotal: 1000, cuotaTotal: 0, calculado: 1000 })
  })

  it('ISP con cuota mal calculada → error aunque no afecte al total', () => {
    const r = chequearMatematica([{ orden: 1, tipoLinea: 'isp', tipoIva: 21, base: 1000, cuota: 100 }], 1000)
    expect(r.ok).toBe(false)
    expect(r.errores[0]).toContain('esperado 210,00')
  })

  it('suplido: suma sólo la base (se paga, pero queda fuera de la base imponible)', () => {
    const r = chequearMatematica([iva(1, 100, 21, 21), { orden: 2, tipoLinea: 'suplido', tipoIva: null, base: 30, cuota: 0 }], 151)
    expect(r.ok).toBe(true)
    expect(r).toMatchObject({ baseTotal: 130, cuotaTotal: 21, calculado: 151 })
  })

  it('retención: resta la cuota retenida y NO vuelve a contar su base', () => {
    // Profesional: 1.000 + 21% IVA − 15% IRPF = 1.060
    const r = chequearMatematica(
      [iva(1, 1000, 21, 210), { orden: 2, tipoLinea: 'retencion', tipoIva: null, base: 1000, cuota: 150, retencionPct: 15 }],
      1060
    )
    expect(r.ok).toBe(true)
    expect(r).toMatchObject({ baseTotal: 1000, cuotaTotal: 210, calculado: 1060 })
  })

  it('retención cuyo importe no se deriva de base × pct → error', () => {
    const r = chequearMatematica(
      [iva(1, 1000, 21, 210), { orden: 2, tipoLinea: 'retencion', tipoIva: null, base: 1000, cuota: 999, retencionPct: 15 }],
      211
    )
    expect(r.ok).toBe(false)
    expect(r.errores[0]).toContain('retención 999,00 no cuadra con base 1000,00 × 15% (esperado 150,00)')
  })

  it('exenta y rebu: base + cuota (cuota 0 en la práctica)', () => {
    const r = chequearMatematica(
      [{ orden: 1, tipoLinea: 'rebu', tipoIva: null, base: 8000, cuota: 0 }, { orden: 2, tipoLinea: 'exenta', tipoIva: null, base: 200, cuota: 0 }],
      8200
    )
    expect(r.ok).toBe(true)
    expect(r).toMatchObject({ baseTotal: 8200, cuotaTotal: 0, calculado: 8200 })
  })

  it('sin importe declarado pero con líneas coherentes → ok y diferencia null', () => {
    const r = chequearMatematica([iva(1, 100, 21, 21)], null)
    expect(r.ok).toBe(true)
    expect(r.calculado).toBe(121)
    expect(r.diferencia).toBeNull()
  })

  it('sin líneas y con importe → "sin líneas"; sin líneas ni importe → SIN ruido', () => {
    expect(chequearMatematica([], 121)).toMatchObject({ ok: false, errores: ['sin líneas'] })
    expect(chequearMatematica([], null)).toMatchObject({ ok: false, errores: [] })
  })

  it('la tolerancia es configurable', () => {
    expect(chequearMatematica([iva(1, 100, 21, 21)], 121.5).ok).toBe(false)
    expect(chequearMatematica([iva(1, 100, 21, 21)], 121.5, 1).ok).toBe(true)
  })
})

describe('decidirEstado', () => {
  const BASE = {
    tieneLineas: true,
    mathOk: true,
    confianza: 0.99,
    nifValido: true as boolean | null,
    proveedorConocido: true,
    validacionAuto: true,
    deducible: 'si',
  }

  it('sin líneas → registrada (comportamiento viejo, y la verdad de las 183 filas de 2026)', () => {
    expect(decidirEstado({ ...BASE, tieneLineas: false })).toEqual({ estado: 'registrada', datosIncompletos: false })
  })

  it('sin líneas gana sobre todo lo demás: mathOk:false no la ensucia', () => {
    expect(decidirEstado({ ...BASE, tieneLineas: false, mathOk: false })).toEqual({
      estado: 'registrada', datosIncompletos: false,
    })
  })

  it('math KO → pendiente-validar + datosIncompletos, NUNCA validada', () => {
    expect(decidirEstado({ ...BASE, mathOk: false })).toEqual({ estado: 'pendiente-validar', datosIncompletos: true })
  })

  it('todo verde con validacion_auto y confianza ≥ 0,95 → validada', () => {
    expect(decidirEstado(BASE)).toEqual({ estado: 'validada', datosIncompletos: false })
    expect(decidirEstado({ ...BASE, confianza: 0.95 }).estado).toBe('validada')
  })

  it('sin validacion_auto no hay auto-validación por más confianza que haya', () => {
    expect(decidirEstado({ ...BASE, validacionAuto: false }).estado).toBe('extraida')
  })

  it('confianza < 0,95 → extraida, no validada', () => {
    expect(decidirEstado({ ...BASE, confianza: 0.94 }).estado).toBe('extraida')
  })

  it('NIF sin verificar (null) o inválido (false) → no se auto-valida', () => {
    expect(decidirEstado({ ...BASE, nifValido: null }).estado).toBe('extraida')
    expect(decidirEstado({ ...BASE, nifValido: false }).estado).toBe('extraida')
  })

  it('deducible "duda" → no se auto-valida (hay una decisión humana pendiente)', () => {
    expect(decidirEstado({ ...BASE, deducible: 'duda' }).estado).toBe('extraida')
  })

  it('mathOk + confianza ≥ 0,8 + proveedor conocido → extraida', () => {
    expect(decidirEstado({ ...BASE, validacionAuto: false, confianza: 0.8 })).toEqual({
      estado: 'extraida', datosIncompletos: false,
    })
  })

  it('confianza < 0,8 → pendiente-validar', () => {
    expect(decidirEstado({ ...BASE, validacionAuto: false, confianza: 0.79 }).estado).toBe('pendiente-validar')
  })

  it('proveedor desconocido → pendiente-validar por más confianza que haya', () => {
    expect(decidirEstado({ ...BASE, proveedorConocido: false, confianza: 1 }).estado).toBe('pendiente-validar')
  })

  it('confianza null (extractor sin score) cuenta como 0 → pendiente-validar', () => {
    expect(decidirEstado({ ...BASE, confianza: null }).estado).toBe('pendiente-validar')
  })
})
