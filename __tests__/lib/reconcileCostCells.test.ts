import { reconcileCostCells, parseEsCell, type CbCosts } from '@/lib/costoBeneficioSheet'

// Fila A..S; sólo importan G6 H7 I8 J9 K10 L11 M12.
const mkRow = (over: Record<number, string> = {}): string[] => {
  const r = Array(19).fill('')
  return r.map((v, i) => over[i] ?? v)
}
const COSTS: CbCosts = {
  precioCompra: 11032, gastosTransporte: 403, // compra G = 11435
  gastosMecanica: 250, gastosPintura: null, gastosLimpieza: 90.75, gastosOtros: 180,
}

describe('parseEsCell', () => {
  it('parsea formato es_ES', () => {
    expect(parseEsCell('11.435')).toBe(11435)
    expect(parseEsCell('90,75')).toBe(90.75)
    expect(parseEsCell('1.234,56')).toBeCloseTo(1234.56)
    expect(parseEsCell('')).toBeNull()
    expect(parseEsCell(undefined)).toBeNull()
  })
})

describe('reconcileCostCells — fill (sólo celdas vacías)', () => {
  it('rellena vacías, no toca las que ya tienen valor, no toca H', () => {
    const row = mkRow({ 9: '250' }) // J ya cargada
    const u = reconcileCostCells(row, COSTS, 'fill')
    const cols = u.map((x) => x.col)
    expect(cols).toContain('G') // compra vacía → llena
    expect(cols).toContain('L') // limpieza vacía
    expect(cols).toContain('M') // itv vacía
    expect(cols).not.toContain('J') // ya tenía valor
    expect(cols).not.toContain('H') // fill nunca toca H
    expect(u.find((x) => x.col === 'G')!.value).toBe(11435)
    expect(u.find((x) => x.col === 'M')!.value).toBe(180)
    // prev de una celda vacía rellenada es '' (contenido crudo previo)
    expect(u.find((x) => x.col === 'G')!.prev).toBe('')
  })
})

describe('reconcileCostCells — overwrite (corrige y limpia H)', () => {
  it('limpia H si tiene valor (corrige doble conteo de porte)', () => {
    const row = mkRow({ 6: '11.435', 7: '403', 9: '250', 11: '90,75', 12: '180' })
    const u = reconcileCostCells(row, COSTS, 'overwrite')
    const h = u.find((x) => x.col === 'H')
    expect(h).toBeDefined()
    expect(h!.value).toBe('') // H → blanco
    // G/J/L/M ya coinciden → no se re-escriben
    expect(u.map((x) => x.col)).not.toContain('G')
    expect(u.map((x) => x.col)).not.toContain('J')
  })

  it('corrige un valor distinto al CRM', () => {
    const row = mkRow({ 6: '11.435', 9: '999' }) // J mal
    const u = reconcileCostCells(row, COSTS, 'overwrite')
    expect(u.find((x) => x.col === 'J')!.value).toBe(250)
  })

  it('no re-escribe si el valor coincide (tolerancia decimal)', () => {
    const row = mkRow({ 6: '11.435,00', 11: '90,75', 12: '180,00' })
    const u = reconcileCostCells(row, COSTS, 'overwrite')
    expect(u.map((x) => x.col)).not.toContain('G')
    expect(u.map((x) => x.col)).not.toContain('L')
    expect(u.map((x) => x.col)).not.toContain('M')
  })

  it('no toca columnas cuyo CRM es null (preserva)', () => {
    const row = mkRow({ 10: '500' }) // K (pintura) manual; CRM pintura=null
    const u = reconcileCostCells(row, COSTS, 'overwrite')
    expect(u.map((x) => x.col)).not.toContain('K')
  })

  it('cada update trae prev con el valor crudo previo de la celda (audit previo→nuevo)', () => {
    const row = mkRow({ 6: '11.435', 7: '403', 9: '999' }) // H con valor, J mal
    const u = reconcileCostCells(row, COSTS, 'overwrite')
    const j = u.find((x) => x.col === 'J')!
    expect(j.prev).toBe('999') // valor viejo de J antes de corregir
    expect(j.value).toBe(250)
    const h = u.find((x) => x.col === 'H')!
    expect(h.prev).toBe('403') // valor viejo de H antes de limpiar
    expect(h.value).toBe('')
  })
})
