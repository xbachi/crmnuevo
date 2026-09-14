import {
  planFila,
  acumular,
  filaAObjeto,
  parseNumero,
  claveHeader,
} from '../../scripts/importar-checklist-sheets'

const VENTAS_EXPO = { hoja: 'VENTAS', pestana: 'Expo', tipo: 'C' }
const COMPRAS = { hoja: 'COMPRAS', pestana: 'Compras', tipo: 'C' }
const COMPRAS_R = { hoja: 'COMPRAS', pestana: 'R', tipo: 'R' }
const COMPRAS_DEP = { hoja: 'COMPRAS', pestana: 'Deposito', tipo: 'D' }

const vehiculoVacio = () => ({
  id: 1,
  referencia: '#1001',
  tipo: 'C',
  fechaCompra: null,
  createdAt: new Date('2026-03-01T00:00:00Z'),
  pasos: {},
  setEnRun: new Set<string>(),
})

describe('claveHeader / parseNumero', () => {
  it('normaliza cabeceras', () => {
    expect(claveHeader('PORTE SOLICITADO?')).toBe('PORTESOLICITADO')
    expect(claveHeader('F/MATR')).toBe('FMATR')
    expect(claveHeader('2DA LLAVE')).toBe('2DALLAVE')
    expect(claveHeader('Referencia')).toBe('REFERENCIA')
  })
  it('parsea números con separador de miles', () => {
    expect(parseNumero('8.100')).toBe(8100)
    expect(parseNumero('78.364')).toBe(78364)
    expect(parseNumero('99800')).toBe(99800)
    expect(parseNumero('1.234,5')).toBe(1234.5)
    expect(parseNumero('NAVE')).toBeNull()
    expect(parseNumero('')).toBeNull()
  })
})

describe('planFila', () => {
  const cab = [
    'R',
    'MARCA',
    'PROVEEDOR',
    'MONTO',
    'FECHA COMPRA',
    'RECIBIDO',
    'CARPETA',
    'REVI INIC',
    'PUBLICADO',
  ]

  it('rellena huecos de compra, checklist y pasos', () => {
    const fila = filaAObjeto(cab, [
      '#1001',
      'Citroen',
      'ayvens',
      '8.100',
      '10/3',
      '24/3',
      'SI',
      '25/3',
      '9/4',
    ])
    const plan = planFila(vehiculoVacio(), fila, COMPRAS)
    expect(plan.updates).toEqual({
      proveedor: 'ayvens',
      precioCompra: 8100,
      fechaCompra: '2026-03-10',
      recibido: '24/3',
      recibidoFecha: '2026-03-24',
      carpeta: 'SI',
    })
    expect(plan.pasos).toEqual([
      { paso: 'REVI_INIC', texto: '25/3', fecha: '2026-03-25' },
      { paso: 'PUBLICADO', texto: '9/4', fecha: '2026-04-09' },
    ])
  })

  it('no pisa valores no vacíos de la base salvo --sobrescribir-checklist (sólo checklist/pasos)', () => {
    const v = {
      ...vehiculoVacio(),
      proveedor: 'otro',
      carpeta: 'NO',
      pasos: { REVI_INIC: { texto: '1/1' } },
    }
    const fila = filaAObjeto(cab, [
      '#1001',
      '',
      'ayvens',
      '',
      '',
      '',
      'SI',
      '25/3',
      '',
    ])
    const sin = planFila(v, fila, COMPRAS)
    expect(sin.updates).toEqual({})
    expect(sin.pasos).toEqual([])
    expect(sin.skipped.noVacio).toEqual(
      expect.arrayContaining(['proveedor', 'carpeta', 'paso:REVI_INIC'])
    )
    const con = planFila(v, fila, COMPRAS, { sobrescribir: true })
    expect(con.updates).toEqual({ carpeta: 'SI' })
    expect(con.pasos).toEqual([
      { paso: 'REVI_INIC', texto: '25/3', fecha: '2026-03-25' },
    ])
  })

  it('Ventas gana sobre COMPRAS dentro de la misma ejecución, incluso con sobrescribir', () => {
    const v = vehiculoVacio()
    const cabExpo = ['SI', 'CARPETA', 'REVI INIC']
    const p1 = planFila(
      v,
      filaAObjeto(cabExpo, ['#1001', 'SI', '9/4']),
      VENTAS_EXPO,
      { sobrescribir: true }
    )
    acumular(v, p1)
    const p2 = planFila(
      v,
      filaAObjeto(cab, ['#1001', '', '', '', '', '', 'NO', '25/3', '']),
      COMPRAS,
      { sobrescribir: true }
    )
    expect(p2.updates).toEqual({})
    expect(p2.pasos).toEqual([])
  })

  it('salta MONTO no numérico y VENDIDO en checklist', () => {
    const v = { ...vehiculoVacio(), tipo: 'R', referencia: '#R-02' }
    const fila = filaAObjeto(
      ['REFERENCIA', 'FECHA', 'MONTO', 'GANANCI'],
      ['#R-02', '25/10/2002', 'NAVE', '70']
    )
    const plan = planFila(v, fila, COMPRAS_R)
    expect(plan.updates).toEqual({ fechaMatriculacion: '2002-10-25' })
    expect(plan.skipped.montoNoNumerico).toEqual([
      { campo: 'precioCompra', texto: 'NAVE' },
    ])

    const exp = planFila(
      vehiculoVacio(),
      filaAObjeto(
        ['SI', 'PUBLICADO', 'FOTOS'],
        ['#1001', 'VENDIDO', 'VENDIDO']
      ),
      VENTAS_EXPO
    )
    expect(exp.pasos).toEqual([])
    expect(exp.skipped.vendidoEnChecklist).toBe(2)
  })

  it('texto no fecha en paso: se guarda con fecha null y se reporta', () => {
    const plan = planFila(
      vehiculoVacio(),
      filaAObjeto(['SI', 'PINTURA'], ['#1001', 'sin pintar']),
      VENTAS_EXPO
    )
    expect(plan.pasos).toEqual([
      { paso: 'PINTURA', texto: 'sin pintar', fecha: null },
    ])
    // "sin pintar" no parece fecha: no se reporta. "5-9 fergo" sí.
    expect(plan.skipped.fechasNoInterpretadas).toEqual([])
    const p2 = planFila(
      vehiculoVacio(),
      filaAObjeto(['SI', 'PINTURA'], ['#1001', '5-9 fergo']),
      VENTAS_EXPO
    )
    expect(p2.skipped.fechasNoInterpretadas).toEqual([
      { campo: 'PINTURA', texto: '5-9 fergo' },
    ])
  })

  it('COMPRAS/Deposito: MONTO CLIENTE va al depósito, no al vehículo', () => {
    const plan = planFila(
      vehiculoVacio(),
      filaAObjeto(
        ['REFERENCIA', 'KMS', 'MONTO CLIENTE'],
        ['#D-02', '78.364', '10.500']
      ),
      COMPRAS_DEP
    )
    expect(plan.updates).toEqual({})
    expect(plan.depositoPrecioVenta).toBe(10500)
  })
})
