import { isInSheet, parseControlFacturasRows } from '@/lib/facturasMonitor'

describe('isInSheet — dedup por matrícula (col E) / referencia (col C)', () => {
  const rows = [
    ['01/04/2026', 'ABRIL', '#1074', 'BMW X1', '8061KRN'],
    ['12/04/2026', 'ABRIL', 'D-31', 'Kia Ceed', '6351LRG'],
  ]

  it('encuentra por matrícula normalizada', () => {
    expect(isInSheet({ referencia: null, matricula: '8061-KRN' }, rows)).toBe(true)
    expect(isInSheet({ referencia: null, matricula: '8061 krn' }, rows)).toBe(true)
  })

  it('encuentra por referencia normalizada', () => {
    expect(isInSheet({ referencia: '#1074', matricula: null }, rows)).toBe(true)
    expect(isInSheet({ referencia: '1074', matricula: null }, rows)).toBe(true) // sin #
  })

  it('devuelve false si no está', () => {
    expect(isInSheet({ referencia: '#9999', matricula: '0000XXX' }, rows)).toBe(false)
  })

  it('no matchea con celdas vacías', () => {
    expect(isInSheet({ referencia: null, matricula: null }, rows)).toBe(false)
    expect(isInSheet({ referencia: '', matricula: '' }, rows)).toBe(false)
  })
})

describe('parseControlFacturasRows — estado de Control Facturas', () => {
  // Grilla realista: banda + header + proveedores + blanco + leyenda
  const grid = [
    ['1re trimestre 2026', '', '', ''],
    ['Proveedor', 'Enero', 'Febrero', 'Marzo'],
    ['Alquiler nave', 'OK', 'OK', 's/archivar'],
    ['Mecauto', 's/archivar', 'OK', 'OK'],
    ['Adevinta/Motor', 'descargar', 'descargar', 'FALTA'],
    ['', '', '', ''],
    ['2do trimestre 2026', '', '', ''],
    ['Proveedor', 'Abril', 'Mayo', 'Junio'],
    ['Alquiler nave', 's/archivar', 'OK', 'pendiente'],
    ['Wallapop', 'OK', 's/archivar', 'FALTA'],
    ['', '', '', ''],
    // leyenda (NO debe contarse)
    ['Referencia:', '', '', ''],
    ['OK', 'archivada en gestoría', '', ''],
    ['s/archivar', 'llegó el mail CON el PDF adjunto', '', ''],
    ['descargar', 'el mail trae link SIN PDF', '', ''],
  ]

  it('recolecta todas las celdas s/archivar con su mes y proveedor', () => {
    const { sArchivar } = parseControlFacturasRows(grid)
    expect(sArchivar).toEqual([
      { mes: 'Marzo', proveedor: 'Alquiler nave' },
      { mes: 'Enero', proveedor: 'Mecauto' },
      { mes: 'Abril', proveedor: 'Alquiler nave' },
      { mes: 'Mayo', proveedor: 'Wallapop' },
    ])
  })

  it('recolecta las celdas descargar', () => {
    const { descargar } = parseControlFacturasRows(grid)
    expect(descargar).toEqual([
      { mes: 'Enero', proveedor: 'Adevinta/Motor' },
      { mes: 'Febrero', proveedor: 'Adevinta/Motor' },
    ])
  })

  it('NO cuenta la leyenda (s/archivar y descargar como etiquetas en col A)', () => {
    const { sArchivar, descargar } = parseControlFacturasRows(grid)
    // si la leyenda se colara, habría un item con proveedor="s/archivar" o mes vacío
    expect(sArchivar.every((i) => i.proveedor !== 's/archivar' && i.mes)).toBe(true)
    expect(descargar.every((i) => i.proveedor !== 'descargar' && i.mes)).toBe(true)
  })

  it('grilla vacía → sin pendientes', () => {
    expect(parseControlFacturasRows([])).toEqual({ sArchivar: [], descargar: [] })
  })

  it('ignora estados no accionables (OK/FALTA/pendiente)', () => {
    const soloOk = [
      ['Proveedor', 'Enero', 'Febrero', 'Marzo'],
      ['Mecauto', 'OK', 'FALTA', 'pendiente'],
    ]
    expect(parseControlFacturasRows(soloOk)).toEqual({ sArchivar: [], descargar: [] })
  })
})
