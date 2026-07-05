import {
  toEsDate,
  normPlate,
  normRef,
  monthIndexFromIso,
  regimenFromType,
  computeCompra,
  isBand,
  isSubtotal,
  findDuplicate,
  planInsertion,
  IVA_FORMULA,
  COSTE_FORMULA,
  MARGEN_FORMULA,
  PCT_FORMULA,
  MES_FORMULA,
  SUBTOTAL,
} from '@/lib/costoBeneficioSheet'

describe('toEsDate', () => {
  it('ISO YYYY-MM-DD → dd/mm/yyyy', () => {
    expect(toEsDate('2026-06-15')).toBe('15/06/2026')
    expect(toEsDate('2026-01-02')).toBe('02/01/2026')
  })
  it('ignora la parte de hora', () => {
    expect(toEsDate('2026-06-15T10:30:00Z')).toBe('15/06/2026')
  })
  it('devuelve la entrada intacta si no matchea', () => {
    expect(toEsDate('sin-fecha')).toBe('sin-fecha')
  })
})

describe('normalización para dedup (nunca duplicar)', () => {
  it('normPlate ignora espacios, puntos y guiones, y pasa a mayúsculas', () => {
    expect(normPlate('1234-ABC')).toBe('1234ABC')
    expect(normPlate('1234 abc')).toBe('1234ABC')
    expect(normPlate('1.234.abc')).toBe('1234ABC')
  })
  it('normRef además ignora el # inicial', () => {
    expect(normRef('#1010')).toBe('1010')
    expect(normRef('SM-1018')).toBe('SM1018')
    expect(normRef('#sm 1018')).toBe('SM1018')
  })
})

describe('monthIndexFromIso', () => {
  it('devuelve índice 0..11', () => {
    expect(monthIndexFromIso('2026-01-15')).toBe(0)
    expect(monthIndexFromIso('2026-06-01')).toBe(5)
    expect(monthIndexFromIso('2026-12-31')).toBe(11)
  })
  it('devuelve -1 para meses inválidos o basura', () => {
    expect(monthIndexFromIso('2026-13-01')).toBe(-1)
    expect(monthIndexFromIso('2026-00-01')).toBe(-1)
    expect(monthIndexFromIso('basura')).toBe(-1)
  })
})

describe('regimenFromType', () => {
  it('REBU → "rebu"; cualquier otro → "iva 21"', () => {
    expect(regimenFromType('REBU')).toBe('rebu')
    expect(regimenFromType('VAT')).toBe('iva 21')
    expect(regimenFromType('RECTIFYING')).toBe('iva 21')
  })
})

describe('computeCompra (precioCompra + porte)', () => {
  it('suma ambos', () => {
    expect(computeCompra(10000, 200)).toBe(10200)
  })
  it('usa 0 para el que falte, pero no null si el otro existe', () => {
    expect(computeCompra(10000, null)).toBe(10000)
    expect(computeCompra(null, 200)).toBe(200)
    expect(computeCompra(0, 0)).toBe(0)
  })
  it('null sólo si faltan los dos', () => {
    expect(computeCompra(null, null)).toBeNull()
  })
})

describe('isBand / isSubtotal', () => {
  it('isBand reconoce un mes en la col A (case-insensitive)', () => {
    expect(isBand(['ENERO'])).toBe(true)
    expect(isBand(['enero'])).toBe(true)
    expect(isBand(['Ford Puma'])).toBe(false)
    expect(isBand(['TOTAL ENERO'])).toBe(false)
    expect(isBand(undefined)).toBe(false)
  })
  it('isSubtotal reconoce "TOTAL ..." en la col D (idx 3)', () => {
    expect(isSubtotal(['', '', '', 'TOTAL ENERO'])).toBe(true)
    expect(isSubtotal(['', '', '', 'Ford'])).toBe(false)
    expect(isSubtotal(undefined)).toBe(false)
  })
})

describe('findDuplicate — el corazón del "nunca duplicar"', () => {
  it('detecta duplicado por matrícula (col E) con formatos distintos', () => {
    const rows = [['15/01', 'ENERO', '1010', 'Ford', '1234ABC']]
    expect(findDuplicate(rows, '1234-abc', null)).toEqual({ kind: 'plate', row: 1 })
  })
  it('detecta duplicado por referencia (col C) normalizada', () => {
    const rows = [['15/01', 'ENERO', 'SM1018', 'Ford', '9999ZZZ']]
    expect(findDuplicate(rows, null, '#sm-1018')).toEqual({ kind: 'ref', row: 1 })
  })
  it('ignora la col C de las filas de subtotal', () => {
    const rows = [['', '', '1018', 'TOTAL ENERO']]
    expect(findDuplicate(rows, null, '1018')).toBeNull()
  })
  it('la matrícula tiene prioridad sobre la referencia en la misma fila', () => {
    const rows = [['', '', 'MATCHREF', '', 'MATCHPLATE']]
    expect(findDuplicate(rows, 'matchplate', 'matchref')).toEqual({ kind: 'plate', row: 1 })
  })
  it('devuelve la primera fila que matchea', () => {
    const rows = [
      ['', '', 'OTRA', '', '0000AAA'],
      ['', '', 'REF2', '', '1234ABC'],
    ]
    expect(findDuplicate(rows, '1234ABC', null)).toEqual({ kind: 'plate', row: 2 })
  })
  it('null si no hay coincidencia', () => {
    const rows = [['', '', 'REF', '', '0000AAA']]
    expect(findDuplicate(rows, '1234ABC', 'OTRA')).toBeNull()
  })
})

describe('planInsertion — dónde va la fila del coche', () => {
  it('banda existente con coches: inserta antes del subtotal', () => {
    const rows = [
      ['ENERO'], // fila 1
      ['15/01', 'ENERO', '1010', 'Ford'], // fila 2 (coche)
      ['', '', '', 'TOTAL ENERO'], // fila 3 (subtotal)
    ]
    expect(planInsertion(rows, 'ENERO')).toEqual({ bandRow: 1, targetRow: 3, createBand: false })
  })

  it('banda existente sin coches todavía: inserta justo tras la banda', () => {
    const rows = [['ENERO'], ['', '', '', 'TOTAL ENERO']]
    expect(planInsertion(rows, 'ENERO')).toEqual({ bandRow: 1, targetRow: 2, createBand: false })
  })

  it('corta al llegar a la banda del mes siguiente (sin subtotal intermedio)', () => {
    const rows = [
      ['ENERO'],
      ['15/01', 'ENERO', '1010'],
      ['FEBRERO'],
      ['02/02', 'FEBRERO', '2020'],
    ]
    expect(planInsertion(rows, 'ENERO')).toEqual({ bandRow: 1, targetRow: 3, createBand: false })
  })

  it('mes inexistente: crea banda nueva tras el contenido, dejando una fila en blanco', () => {
    const rows = [
      ['ENERO'],
      ['15/01', 'ENERO', '1010'],
      ['', '', '', 'TOTAL ENERO'],
    ]
    // último contenido en fila 3 → banda en 3+2=5, coche en 6
    expect(planInsertion(rows, 'FEBRERO')).toEqual({ bandRow: 5, targetRow: 6, createBand: true })
  })

  it('ignora filas en blanco al final al calcular dónde empieza la banda nueva', () => {
    const rows = [['ENERO'], ['x'], ['']]
    // contenido real hasta fila 2 → banda en 4, coche en 5
    expect(planInsertion(rows, 'FEBRERO')).toEqual({ bandRow: 4, targetRow: 5, createBand: true })
  })
})

describe('fórmulas con locale es_ES (separador ";" y decimal ",")', () => {
  it('IVA sobre el margen con decimal coma (regresión del bug de IVA)', () => {
    expect(IVA_FORMULA(5)).toBe('=IF(O5="";"";(O5-N5)*0,21)')
  })
  it('COSTE suma G:M', () => {
    expect(COSTE_FORMULA(5)).toBe('=SUM(G5:M5)')
  })
  it('MARGEN = precio - coste - IVA', () => {
    expect(MARGEN_FORMULA(5)).toBe('=IF(O5="";"";O5-N5-P5)')
  })
  it('PCT = margen / coste, con guarda de división por cero', () => {
    expect(PCT_FORMULA(5)).toBe('=IF(N5=0;"";Q5/N5)')
  })
  it('SUBTOTAL usa SUMIFS filtrado por mes con ";"', () => {
    expect(SUBTOTAL('N', 'ENERO')).toBe('=SUMIFS(N$2:N$400;$B$2:$B$400;"ENERO")')
  })
  it('MES_FORMULA usa CHOOSE con ";" (no ",")', () => {
    const f = MES_FORMULA(5)
    expect(f).toContain('CHOOSE(MONTH(A5);"ENERO";"FEBRERO"')
    expect(f).not.toContain(',')
  })
})
