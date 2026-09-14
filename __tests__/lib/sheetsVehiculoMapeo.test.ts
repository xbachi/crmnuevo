/**
 * Mapeo y diff del upsert de vehículos en las hojas (piezas puras).
 *
 * Lo que se protege:
 *  - la columna de referencia es la A aunque la cabecera diga "R"/"SI"/"751";
 *  - un valor vacío del CRM nunca produce escritura (no se borra nada);
 *  - "78.364" en la hoja == 78364 del CRM (sin churn), fechas cortas idem;
 *  - las columnas de fórmula/ubicación no se tocan;
 *  - la marca VENDIDO se pone y nunca se quita.
 */
import {
  claveHeader,
  encontrarFila,
  filaParaAppend,
  iguales,
  indiceReferencia,
  indiceVendido,
  letraColumna,
  normalizarCelda,
  planUpsert,
  referenciaCanonica,
  titleCase,
  valoresEsperados,
  type CtxVehiculoSheets,
} from '@/lib/sheetsVehiculoMapeo'

const HEADERS_EXPO = [
  'SI',
  'MARCA',
  'MODELO',
  '2DA LLAVE',
  'MATRICULA',
  'BASTIDOR',
  'KMS',
  'FECHA MATRI',
  'CARPETA',
  'MASTER',
  'HOJAS A',
  'DOCU',
  'ITV',
  'SEGURO',
  'REVI INIC',
  'MECAUTO',
  'REVI PINTURA',
  'PINTURA',
  'LIMPIEZA',
  'FOTOS',
  'PUBLICADO',
]
const HEADERS_COMPRAS = [
  'R',
  'MARCA',
  'MODELO',
  'MATRICULA',
  'F/MATR',
  'FECHA COMPRA',
  'PROVEEDOR',
  'BASTIDOR',
  'KMS',
  'MONTO',
  'PORTE/COMI',
  'TOTAL',
  'ABONADO?',
  'COMPROBANTE',
  'PORTE SOLICITADO?',
  'ESTADO',
  'RECIBIDO',
  'CARPETA',
  'MASTER',
  'HOJAS A',
  'DOCU',
  'ITV',
  'SEGURO',
  'REVI INIC',
  'MECAUTO',
  'REVI PINTURA',
  'PINTURA',
  'LIMPIEZA',
  'FOTOS',
  'PUBLICADO',
]
const HEADERS_VENTAS_R = [
  'Referencia',
  'MARCA',
  'MODELO',
  'MATRICULA',
  'FECHA MATRIC',
  'BASTIDOR',
  'ESTADO',
  '2DA LLAVE',
  'CARPETA',
  'VENDIDO',
]
const HEADERS_COMPRAS_R = [
  'REFERENCIA',
  'MARCA',
  'MODELO',
  'MATRICULA',
  'FECHA',
  'BASTIDOR',
  'MONTO',
  'VENDIDO A',
  'MONTO VENTA',
  'GANANCI',
]

const ctx = (
  over: Partial<CtxVehiculoSheets['vehiculo']> = {},
  extra: Partial<CtxVehiculoSheets> = {}
): CtxVehiculoSheets => ({
  vehiculo: {
    id: 7,
    referencia: '1002',
    tipo: 'C',
    marca: 'PEUGEOT',
    modelo: '2008',
    matricula: '0046llr',
    bastidor: 'VR3USHNKKLJ927403',
    kms: 78364,
    estado: 'PUBLICADO',
    fechaMatriculacion: '2020-12-01',
    fechaCompra: new Date(2026, 2, 12),
    precioCompra: 9800,
    gastosTransporte: 472,
    segundaLlave: 'SI',
    carpeta: 'SI',
    master: 'NO',
    hojasA: null,
    documentacion: '',
    itv: 'NO',
    seguro: 'SI',
    proveedor: 'ayvens',
    createdAt: new Date(2026, 2, 12),
    ...over,
  },
  pasos: { REVI_INIC: { texto: '9/4', fecha: '2026-04-09' } },
  ...extra,
})

describe('claveHeader / letraColumna / titleCase', () => {
  it('normaliza cabeceras reales', () => {
    expect(claveHeader('PORTE SOLICITADO?')).toBe('PORTESOLICITADO')
    expect(claveHeader('F/MATR')).toBe('FMATR')
    expect(claveHeader('Referencia')).toBe('REFERENCIA')
    expect(claveHeader('2DA LLAVE')).toBe('2DALLAVE')
    expect(claveHeader('Año')).toBe('ANO')
  })
  it('letras de columna', () => {
    expect(letraColumna(0)).toBe('A')
    expect(letraColumna(25)).toBe('Z')
    expect(letraColumna(26)).toBe('AA')
  })
  it('title case', () => {
    expect(titleCase('PEUGEOT')).toBe('Peugeot')
    expect(titleCase('cla 200 d')).toBe('Cla 200 D')
    expect(titleCase('  ')).toBeNull()
  })
})

describe('indiceReferencia / indiceVendido', () => {
  it('la referencia es la columna A salvo cabecera REFERENCIA explícita', () => {
    expect(indiceReferencia(HEADERS_COMPRAS)).toBe(0)
    expect(indiceReferencia(HEADERS_EXPO)).toBe(0)
    expect(indiceReferencia(['X', 'REFERENCIA'])).toBe(0)
  })
  it('marca VENDIDO: sin cabecera → columna tras la última; Ventas/R → SI', () => {
    expect(indiceVendido('VENTAS/Expo', HEADERS_EXPO)).toEqual({
      idx: 21,
      valor: 'VENDIDO',
    })
    expect(indiceVendido('COMPRAS/Compras', HEADERS_COMPRAS)).toEqual({
      idx: 30,
      valor: 'VENDIDO',
    })
    expect(indiceVendido('VENTAS/R', HEADERS_VENTAS_R)).toEqual({
      idx: 9,
      valor: 'SI',
    })
    expect(indiceVendido('COMPRAS/R', HEADERS_COMPRAS_R).idx).toBe(-1)
    expect(indiceVendido('COMPRAS/Deposito', ['REFERENCIA', 'MARCA']).idx).toBe(
      -1
    )
  })
})

describe('valoresEsperados', () => {
  it('Expo: referencia canónica, Title Case, matrícula normalizada, kms número, fecha dd/mm/yyyy', () => {
    const e = valoresEsperados('VENTAS/Expo', HEADERS_EXPO, ctx())
    const por = Object.fromEntries(e.map((x) => [x.header, x.valor]))
    expect(por.SI).toBe('#1002')
    expect(por.MARCA).toBe('Peugeot')
    expect(por.MATRICULA).toBe('0046LLR')
    expect(por.KMS).toBe(78364)
    expect(por['FECHA MATRI']).toBe('01/12/2020')
    expect(por['2DA LLAVE']).toBe('SI')
    expect(por['REVI INIC']).toBe('9/4')
  })
  it('no incluye campos vacíos del CRM ni la marca VENDIDO si no está vendido', () => {
    const e = valoresEsperados('VENTAS/Expo', HEADERS_EXPO, ctx())
    const headers = e.map((x) => x.header)
    expect(headers).not.toContain('HOJAS A')
    expect(headers).not.toContain('DOCU')
    expect(headers).not.toContain('MECAUTO')
    expect(e.find((x) => x.marcaVendido)).toBeUndefined()
  })
  it('marca VENDIDO en la columna sin cabecera cuando estado = VENDIDO', () => {
    const e = valoresEsperados(
      'VENTAS/Expo',
      HEADERS_EXPO,
      ctx({ estado: 'vendido' })
    )
    expect(e.find((x) => x.marcaVendido)).toEqual({
      col: 21,
      header: '',
      valor: 'VENDIDO',
      marcaVendido: true,
    })
  })
  it('Compras: MONTO/PORTE numéricos, PROVEEDOR, nunca TOTAL ni ESTADO', () => {
    const e = valoresEsperados('COMPRAS/Compras', HEADERS_COMPRAS, ctx())
    const por = Object.fromEntries(e.map((x) => [x.header, x.valor]))
    expect(por.R).toBe('#1002')
    expect(por.MONTO).toBe(9800)
    expect(por['PORTE/COMI']).toBe(472)
    expect(por.PROVEEDOR).toBe('ayvens')
    expect(por['FECHA COMPRA']).toBe('12/03/2026')
    expect(por['F/MATR']).toBe('01/12/2020')
    expect(por).not.toHaveProperty('TOTAL')
    expect(por).not.toHaveProperty('ESTADO')
  })
  it('Ventas/R: nunca ESTADO; VENDIDO = SI cuando vendido', () => {
    const e = valoresEsperados(
      'VENTAS/R',
      HEADERS_VENTAS_R,
      ctx({ referencia: 'R-11', tipo: 'R', estado: 'VENDIDO' })
    )
    const por = Object.fromEntries(e.map((x) => [x.header, x.valor]))
    expect(por.Referencia).toBe('#R-11')
    expect(por).not.toHaveProperty('ESTADO')
    expect(por.VENDIDO).toBe('SI')
  })
  it('Compras/R: deal → VENDIDO A / MONTO VENTA, nunca GANANCI', () => {
    const e = valoresEsperados(
      'COMPRAS/R',
      HEADERS_COMPRAS_R,
      ctx(
        { referencia: '#R-12', tipo: 'R' },
        { deal: { importeTotal: '870.00', clienteNombre: 'Bryan' } }
      )
    )
    const por = Object.fromEntries(e.map((x) => [x.header, x.valor]))
    expect(por['VENDIDO A']).toBe('Bryan')
    expect(por['MONTO VENTA']).toBe(870)
    expect(por.FECHA).toBe('01/12/2020')
    expect(por).not.toHaveProperty('GANANCI')
  })
  it('Compras/Deposito: MONTO CLIENTE desde el depósito', () => {
    const e = valoresEsperados(
      'COMPRAS/Deposito',
      [
        'REFERENCIA',
        'MARCA',
        'MODELO',
        'MATRICULA',
        'BASTIDOR',
        'KMS',
        'MONTO CLIENTE',
      ],
      ctx(
        { referencia: 'D-2', tipo: 'D' },
        { deposito: { precio_venta: '12500.00' } }
      )
    )
    const por = Object.fromEntries(e.map((x) => [x.header, x.valor]))
    expect(por.REFERENCIA).toBe('#D-02')
    expect(por['MONTO CLIENTE']).toBe(12500)
  })
})

describe('normalizarCelda / iguales', () => {
  it('números con punto de miles', () => {
    expect(normalizarCelda('78.364')).toBe('78364')
    expect(normalizarCelda('8.100')).toBe('8100')
    expect(normalizarCelda('1.234,5')).toBe('1234.5')
    expect(normalizarCelda(' SÍ ')).toBe('SI')
    expect(iguales('78.364', 78364, 2026)).toBe(true)
    expect(iguales('8.100', 8100, 2026)).toBe(true)
    expect(iguales('NAVE', 8100, 2026)).toBe(false)
  })
  it('fechas cortas equivalen a la fecha larga esperada', () => {
    expect(iguales('10/3', '10/03/2026', 2026)).toBe(true)
    expect(iguales('30/5', '30/05/2019', 2026)).toBe(true)
    expect(iguales('04/08/09', '04/08/2009', 2026)).toBe(true)
    expect(iguales('11/3', '10/03/2026', 2026)).toBe(false)
  })
  it('texto', () => {
    expect(iguales('SI', 'SI', 2026)).toBe(true)
    expect(iguales('', 'x', 2026)).toBe(false)
    expect(iguales('no fue', 'no fue', 2026)).toBe(true)
  })
})

describe('planUpsert', () => {
  const fila = [
    '#1002',
    'Peugeot',
    '2008',
    'SI',
    '0046LLR',
    'VR3USHNKKLJ927403',
    '78.364',
    '01/12/2020',
    'SI',
    'NO',
    'SI',
    'SI',
    'NO',
    'SI',
    '9/4',
    '11/4',
    '19/5',
    '28/5',
    '30/5',
    '1/6',
    '1/6',
  ]
  it('fila idéntica → sin celdas', () => {
    const e = valoresEsperados('VENTAS/Expo', HEADERS_EXPO, ctx())
    expect(planUpsert(HEADERS_EXPO, fila, e, 2026)).toEqual({
      append: false,
      celdas: [],
    })
  })
  it('una celda distinta → sólo esa, con letra A1', () => {
    const e = valoresEsperados('VENTAS/Expo', HEADERS_EXPO, ctx({ kms: 80000 }))
    const p = planUpsert(HEADERS_EXPO, fila, e, 2026)
    expect(p.celdas).toEqual([
      { col: 6, letra: 'G', header: 'KMS', anterior: '78.364', nuevo: 80000 },
    ])
  })
  it('valor vacío en el CRM no borra la celda de la hoja', () => {
    const e = valoresEsperados(
      'VENTAS/Expo',
      HEADERS_EXPO,
      ctx({ carpeta: null, master: '' })
    )
    expect(planUpsert(HEADERS_EXPO, fila, e, 2026).celdas).toEqual([])
  })
  it('marca VENDIDO: se pone si falta, no se quita si sobra', () => {
    const vend = valoresEsperados(
      'VENTAS/Expo',
      HEADERS_EXPO,
      ctx({ estado: 'VENDIDO' })
    )
    expect(planUpsert(HEADERS_EXPO, fila, vend, 2026).celdas).toEqual([
      { col: 21, letra: 'V', header: '', anterior: '', nuevo: 'VENDIDO' },
    ])
    expect(
      planUpsert(HEADERS_EXPO, [...fila, 'VENDIDO'], vend, 2026).celdas
    ).toEqual([])
    expect(
      planUpsert(HEADERS_EXPO, [...fila, 'VENDIDO 12/03'], vend, 2026).celdas
    ).toEqual([])
    const pub = valoresEsperados(
      'VENTAS/Expo',
      HEADERS_EXPO,
      ctx({ estado: 'PUBLICADO' })
    )
    expect(
      planUpsert(HEADERS_EXPO, [...fila, 'VENDIDO'], pub, 2026).celdas
    ).toEqual([])
  })
  it('Ventas/R: SI sólo si la celda VENDIDO está vacía', () => {
    const e = valoresEsperados(
      'VENTAS/R',
      HEADERS_VENTAS_R,
      ctx({ referencia: '#R-05', tipo: 'R', estado: 'VENDIDO' })
    )
    const base = [
      '#R-05',
      'Peugeot',
      '2008',
      '0046LLR',
      '01/12/2020',
      'VR3USHNKKLJ927403',
      'NAVE',
      'SI',
      'SI',
    ]
    expect(
      planUpsert(HEADERS_VENTAS_R, [...base, 'BRYAN'], e, 2026).celdas
    ).toEqual([])
    expect(planUpsert(HEADERS_VENTAS_R, [...base, ''], e, 2026).celdas).toEqual(
      [{ col: 9, letra: 'J', header: 'VENDIDO', anterior: '', nuevo: 'SI' }]
    )
  })
  it('sin fila → append', () => {
    const e = valoresEsperados('VENTAS/Expo', HEADERS_EXPO, ctx())
    expect(planUpsert(HEADERS_EXPO, null, e, 2026)).toEqual({
      append: true,
      celdas: [],
    })
    const f = filaParaAppend(HEADERS_EXPO, e)
    expect(f).toHaveLength(21)
    expect(f[0]).toBe('#1002')
    expect(f[6]).toBe(78364)
    expect(f[10]).toBe('')
  })
})

describe('encontrarFila / referenciaCanonica', () => {
  const filas = [['#1001', 'x'], ['1002', 'y'], ['#D-2', 'z'], []]
  it('encuentra por referencia normalizada', () => {
    expect(encontrarFila(filas, 0, '#1002', 'C')).toBe(1)
    expect(encontrarFila(filas, 0, '#D-02', 'D')).toBe(2)
    expect(encontrarFila(filas, 0, '#9999', 'C')).toBe(-1)
  })
  it('referencia canónica del vehículo', () => {
    expect(referenciaCanonica({ referencia: '1088', tipo: 'C' })).toBe('#1088')
    expect(referenciaCanonica({ referencia: 'R-11', tipo: 'R' })).toBe('#R-11')
    expect(referenciaCanonica({ referencia: null, tipo: 'C' })).toBeNull()
  })
})
