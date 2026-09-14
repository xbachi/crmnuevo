/**
 * @jest-environment node
 *
 * Upsert de vehículos en las hojas (sheetsVehiculo.ts) con pg y googleapis
 * mockeados. Lo que se protege:
 *  - fila existente → un solo values.batchUpdate con SÓLO las celdas distintas;
 *  - fila inexistente → values.append, nunca batchUpdate;
 *  - kill switch y dedupe del outbox;
 *  - vehículo inexistente = fallo permanente (agotado), 429 = fallo transitorio.
 */

const mockSheets = {
  spreadsheets: {
    get: jest.fn(),
    batchUpdate: jest.fn(),
    values: { get: jest.fn(), append: jest.fn(), batchUpdate: jest.fn() },
  },
}

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('googleapis', () => ({
  google: { auth: { GoogleAuth: jest.fn() }, sheets: () => mockSheets },
}))
jest.mock('next/server', () => ({ after: (fn: () => void) => fn() }))
jest.mock('@/lib/webhookOutbox', () => ({
  insertOutboxPending: jest.fn(),
  markOutboxEnviado: jest.fn(),
  markOutboxFallo: jest.fn(),
  markOutboxAgotado: jest.fn(),
}))

import { pool } from '@/lib/direct-database'
import {
  insertOutboxPending,
  markOutboxEnviado,
  markOutboxFallo,
  markOutboxAgotado,
} from '@/lib/webhookOutbox'
import { writeVehiculoToSheets } from '@/lib/googleSheets'
import {
  encolarSheetsVehiculo,
  procesarOutboxSheetsVehiculo,
  reenviarSheetsVehiculo,
  upsertVehiculoEnHojas,
  type CacheLectura,
} from '@/lib/sheetsVehiculo'

const mockQuery = pool.query as jest.Mock

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
const FILA_EXPO = [
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
]
const FILA_COMPRAS = [
  '#1002',
  'Peugeot',
  '2008',
  '0046LLR',
  '01/12/2020',
  '12/3',
  'ayvens',
  'VR3USHNKKLJ927403',
  '78.364',
  '9.800',
  '472',
  '10.272',
  'SI',
  'enviado',
  'VEN',
  'NAVE',
  '4/4',
  'SI',
  'NO',
  'SI',
  'SI',
  'NO',
  'SI',
  '9/4',
]

// Base_Datos/Datos tal y como la devuelve UNFORMATTED_VALUE + FORMATTED_STRING
// (la 2ª MODELO es la cabecera "=C1" ya calculada).
const HEADERS_DATOS = [
  '300',
  'IVA',
  'MODELO',
  'MATRICULA',
  'FECHA MATRICULACION',
  'PRECIO CONTADO',
  'URL IMAGEN',
  'QR',
  'MANTENIMIENTOS',
  'TARIFA FINANCIACION',
  'GARANTIA',
  'GP',
  '% DTO',
  'PRECIO CAMPAÑA',
  'MESES GARANTIA FABRICA',
  'MODELO',
  'FIN FABRICA',
  'HOY',
  'FIN LEGAL',
  'QUEDA OFICIAL?',
  'MESES QUEDAN FABRICA',
  'EXTENSION O LEGAL',
  'PRECIO EXTENSION',
  'kms',
  'motor cv',
  'cubicaje',
  'caja',
  'matriculacion',
  'matriculacion num',
  'cuota',
  'bastidor',
  'combustible',
]
const FILA_DATOS: (string | number)[] = [
  1002,
  'iva 21',
  'Peugeot 2008',
  '0046LLR',
  '1/12/2020',
  12485,
  '',
  '',
  '',
  'NORMAL',
  'SI',
  490,
  0.07,
  11295,
  24,
  'Peugeot 2008',
  '1/12/2022',
  '14/09/2026',
  '14/09/2027',
  'NO',
  '#NUM!',
  'LEGAL',
  690,
  '',
  '',
  '',
  '',
  'Dic 2020',
  202012,
  214,
  'VR3USHNKKLJ927403',
  '',
]
const FILA_DATOS_FORMULA: (string | number)[] = [
  ...FILA_DATOS.slice(0, 9),
  '=IF(((DAYS360(E2;TODAY()))/30)<72;"NORMAL";"ESPECIAL")',
  '=IF (J2="NORMAL";"SI";"NO")',
  '=IFS(F2 < 13000; 490; F2 > 20000; 790)',
  '= IF(J2="NORMAL";0,07;0)',
  '= F2 - 850',
  24,
  '=C2',
  '=DATE(YEAR(E2);MONTH(E2)+O2;DAY(E2))',
  '=TODAY()',
  '=DATE(YEAR(R2);MONTH(R2)+12;DAY(R2))',
  '=IF (R2-Q2>1;"NO";"SI")',
  '=DATEDIF(R2; Q2; "M")',
  '=IF (T2="SI";"EXTENSION";"LEGAL")',
  '=IF (+F2<20000;690;890)',
  '=ARRAYFORMULA(IF(D2:D501="";"";"x"))',
  '',
  '',
  '',
  '=ARRAYFORMULA(IF(E2:E501="";"";"y"))',
  '=ARRAYFORMULA(IF(E2:E501="";"";"z"))',
  214,
  'VR3USHNKKLJ927403',
  '',
]

const VEHICULO = {
  id: 7,
  referencia: '#1002',
  tipo: 'C',
  marca: 'Peugeot',
  modelo: '2008',
  matricula: '0046LLR',
  bastidor: 'VR3USHNKKLJ927403',
  kms: 78364,
  estado: 'PUBLICADO',
  fechaMatriculacion: '2020-12-01',
  fechaCompra: new Date(2026, 2, 12),
  precioCompra: '9800.00',
  gastosTransporte: '472.00',
  segundaLlave: 'SI',
  carpeta: 'SI',
  master: 'NO',
  hojasA: 'SI',
  documentacion: 'SI',
  itv: 'NO',
  seguro: 'SI',
  proveedor: 'ayvens',
  abonado: 'SI',
  comprobante: 'enviado',
  porteSolicitado: 'VEN',
  recibido: false,
  recibidoTexto: '4/4',
  createdAt: new Date(2026, 2, 12),
  deal_importe: null,
  deal_cliente: '',
}

/** pool.query por defecto: vehículo + pasos vacíos + (sin depósito). */
function dbConVehiculo(v: Record<string, unknown> | null = VEHICULO) {
  mockQuery.mockImplementation(async (sql: string) => {
    // Reserva de la fila del outbox ('pendiente' → 'procesando'): OK por defecto.
    if (sql.includes('UPDATE webhook_outbox')) return { rows: [{ id: 1 }] }
    if (sql.includes('FROM "Vehiculo" v')) return { rows: v ? [v] : [] }
    if (sql.includes('FROM vehiculo_pasos'))
      return {
        rows: [{ paso: 'REVI_INIC', texto: '9/4', fecha: '2026-04-09' }],
      }
    if (sql.includes('FROM webhook_outbox')) return { rows: [] }
    if (sql.includes('SELECT referencia FROM "Vehiculo"'))
      return { rows: [{ referencia: '#1002' }] }
    return { rows: [] }
  })
}

function hojas(
  expo: string[][],
  compras: string[][],
  datos: (string | number)[][] = [FILA_DATOS],
  datosFormula: (string | number)[][] = [FILA_DATOS_FORMULA]
) {
  mockSheets.spreadsheets.values.get.mockImplementation(
    async ({
      range,
      valueRenderOption,
    }: {
      range: string
      valueRenderOption?: string
    }) => {
      if (range.startsWith("'Datos'")) {
        const rows = valueRenderOption === 'FORMULA' ? datosFormula : datos
        // Lectura de UNA fila (heredar fórmulas de la fila anterior).
        const una = /!A(\d+):AZ\d+$/.exec(range)
        if (una) return { data: { values: [rows[Number(una[1]) - 2] ?? []] } }
        return { data: { values: [HEADERS_DATOS, ...rows.map((r) => [...r])] } }
      }
      // Copias: el upsert actualiza la fila leída in situ (caché) y los fixtures se comparten.
      return {
        data: {
          values: range.startsWith("'Expo'")
            ? [HEADERS_EXPO, ...expo.map((r) => [...r])]
            : [HEADERS_COMPRAS, ...compras.map((r) => [...r])],
        },
      }
    }
  )
}

const CACHE_DATOS = () => ({
  headers: HEADERS_DATOS,
  filas: [FILA_DATOS],
  formulas: [FILA_DATOS_FORMULA.map((c) => String(c).startsWith('='))],
})

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.SHEETS_VEHICULO_DISABLED
  process.env.SHEETS_VEHICULO_ENABLED = '1'
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'sa@test'
  process.env.GOOGLE_PRIVATE_KEY = 'key'
  mockSheets.spreadsheets.values.append.mockResolvedValue({
    data: { updates: { updatedRange: "'Expo'!A88:U88" } },
  })
  mockSheets.spreadsheets.values.batchUpdate.mockResolvedValue({ data: {} })
  mockSheets.spreadsheets.get.mockResolvedValue({
    data: {
      sheets: [
        { properties: { title: 'Expo', sheetId: 0 } },
        { properties: { title: 'Compras', sheetId: 0 } },
        { properties: { title: 'Datos', sheetId: 1423934348 } },
      ],
    },
  })
  mockSheets.spreadsheets.batchUpdate.mockResolvedValue({ data: {} })
})

describe('upsertVehiculoEnHojas', () => {
  it('fila existente: un batchUpdate por pestaña sólo con las celdas distintas + log', async () => {
    dbConVehiculo({ ...VEHICULO, kms: 80000 })
    hojas([FILA_EXPO], [FILA_COMPRAS])

    const r = await upsertVehiculoEnHojas(7, 'update')

    expect(r.ok).toBe(true)
    expect(r.appends).toBe(0)
    expect(mockSheets.spreadsheets.values.append).not.toHaveBeenCalled()
    const calls = mockSheets.spreadsheets.values.batchUpdate.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][0].requestBody).toEqual({
      valueInputOption: 'RAW',
      data: [{ range: "'Expo'!G2", values: [[80000]] }],
    })
    expect(calls[1][0].requestBody.data).toEqual([
      { range: "'Compras'!I2", values: [[80000]] },
    ])
    const log = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO sheets_sync_log')
    )
    expect(log).toBeDefined()
    expect(log![1].slice(0, 8)).toEqual([
      7,
      'VENTAS',
      'Expo',
      'G2',
      'KMS',
      '78.364',
      '80000',
      'update',
    ])
  })

  it('fila idéntica: no escribe ni loguea', async () => {
    dbConVehiculo()
    hojas([FILA_EXPO], [FILA_COMPRAS])
    const r = await upsertVehiculoEnHojas(7, 'update')
    expect(r).toMatchObject({ ok: true, escritas: 0, appends: 0, detalle: [] })
    expect(mockSheets.spreadsheets.values.batchUpdate).not.toHaveBeenCalled()
    expect(
      mockQuery.mock.calls.some((c) => String(c[0]).includes('sheets_sync_log'))
    ).toBe(false)
  })

  it('fila inexistente: append de la fila completa, nunca batchUpdate', async () => {
    dbConVehiculo()
    hojas([['#1001', 'Citroen']], [FILA_COMPRAS])
    const r = await upsertVehiculoEnHojas(7, 'create')
    expect(r.ok).toBe(true)
    expect(r.appends).toBe(1)
    expect(r.faltantes).toEqual(['VENTAS/Expo'])
    expect(mockSheets.spreadsheets.values.batchUpdate).not.toHaveBeenCalled()
    const ap = mockSheets.spreadsheets.values.append.mock.calls[0][0]
    expect(ap.range).toBe("'Expo'!A1")
    expect(ap.valueInputOption).toBe('RAW')
    expect(ap.requestBody.values[0][0]).toBe('#1002')
    expect(ap.requestBody.values[0][6]).toBe(78364)
    expect(r.detalle[0].celda).toBe('A88')
  })

  it('vendido sin fila: no se reinserta (ni append ni log), se informa en omitidasVendido', async () => {
    dbConVehiculo({ ...VEHICULO, estado: 'VENDIDO' })
    hojas([['#1001', 'Citroen']], [FILA_COMPRAS])
    const r = await upsertVehiculoEnHojas(7, 'cron')
    expect(r.ok).toBe(true)
    expect(r.appends).toBe(0)
    expect(r.faltantes).toEqual([])
    expect(r.omitidasVendido).toEqual(['VENTAS/Expo'])
    expect(mockSheets.spreadsheets.values.append).not.toHaveBeenCalled()
    expect(
      mockQuery.mock.calls.some((c) => String(c[0]).includes('sheets_sync_log'))
    ).toBe(r.escritas > 0) // la fila existente de Compras sí se actualiza (marca VENDIDO)
  })

  it('dryRun: devuelve el plan sin escribir ni loguear', async () => {
    dbConVehiculo({ ...VEHICULO, kms: 80000 })
    hojas([], [FILA_COMPRAS])
    const r = await upsertVehiculoEnHojas(7, 'admin', { dryRun: true })
    expect(r.appends).toBe(1)
    expect(r.escritas).toBeGreaterThan(1)
    expect(mockSheets.spreadsheets.values.append).not.toHaveBeenCalled()
    expect(mockSheets.spreadsheets.values.batchUpdate).not.toHaveBeenCalled()
    expect(
      mockQuery.mock.calls.some((c) => String(c[0]).includes('sheets_sync_log'))
    ).toBe(false)
  })

  it('usa la caché de lectura si se pasa y la actualiza tras el append', async () => {
    dbConVehiculo()
    mockSheets.spreadsheets.values.append.mockResolvedValue({
      data: { updates: { updatedRange: "'Expo'!A2:U2" } },
    })
    const cache: CacheLectura = new Map([
      ['VENTAS/Expo', { headers: HEADERS_EXPO, filas: [] }],
      ['COMPRAS/Compras', { headers: HEADERS_COMPRAS, filas: [FILA_COMPRAS] }],
      ['BASE_DATOS/Datos', CACHE_DATOS()],
    ])
    await upsertVehiculoEnHojas(7, 'cron', { cache })
    expect(mockSheets.spreadsheets.values.get).not.toHaveBeenCalled()
    expect(cache.get('VENTAS/Expo')!.filas).toHaveLength(1)
    expect(cache.get('VENTAS/Expo')!.filas[0][0]).toBe('#1002')
  })

  it('append que no cae al final de la tabla: invalida la caché de la pestaña', async () => {
    dbConVehiculo()
    // Sheets insertó en la fila 88 aunque la caché sólo conocía 0 filas (esperada 2).
    const cache: CacheLectura = new Map([
      ['VENTAS/Expo', { headers: HEADERS_EXPO, filas: [] }],
      ['COMPRAS/Compras', { headers: HEADERS_COMPRAS, filas: [FILA_COMPRAS] }],
      ['BASE_DATOS/Datos', CACHE_DATOS()],
    ])
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await upsertVehiculoEnHojas(7, 'cron', { cache })
    warn.mockRestore()
    expect(r.appends).toBe(1)
    expect(r.detalle[0].celda).toBe('A88')
    expect(cache.has('VENTAS/Expo')).toBe(false)
    expect(cache.has('COMPRAS/Compras')).toBe(true)
  })

  it('Base_Datos: la columna A de una fila existente y las celdas con fórmula nunca se pisan', async () => {
    dbConVehiculo({
      ...VEHICULO,
      precioPublicacion: '13985.00',
      ficha_regimen: 'REBU',
      ficha_tarifa_financiacion: 'ESPECIAL',
      ficha_gp: '590.00',
      ficha_pct_dto: '0.0300',
      ficha_motor_cv: 130,
    })
    hojas([FILA_EXPO], [FILA_COMPRAS])
    const r = await upsertVehiculoEnHojas(7, 'ficha')
    expect(r.ok).toBe(true)
    expect(r.appends).toBe(0)
    const datos = mockSheets.spreadsheets.values.batchUpdate.mock.calls
      .map((c) => c[0])
      .filter(
        (c) =>
          c.spreadsheetId === '1pm2KiO1vXy5Zn7OGe8wjOXhKzUub2QIG5Tjv4GDqEBI'
      )
    expect(datos).toHaveLength(1)
    expect(datos[0].requestBody.valueInputOption).toBe('USER_ENTERED')
    const rangos = datos[0].requestBody.data.map(
      (d: { range: string; values: unknown[][] }) => [d.range, d.values[0][0]]
    )
    // IVA, PRECIO CONTADO y motor cv cambian; TARIFA/GP/% DTO son fórmulas
    // en la hoja (no se tocan) y A2 nunca se reescribe.
    expect(rangos).toEqual([
      ["'Datos'!B2", 'REBU'],
      ["'Datos'!F2", 13985],
      ["'Datos'!Y2", 130],
    ])
  })

  it('Base_Datos: fila nueva → append USER_ENTERED sin "#", fórmulas y formato de la fila anterior', async () => {
    dbConVehiculo({ ...VEHICULO, precioPublicacion: 13985 })
    hojas([FILA_EXPO], [FILA_COMPRAS], [[1001, 'iva 21', 'Otro', '1111AAA']])
    mockSheets.spreadsheets.values.append.mockImplementation(
      async ({ range }: { range: string }) => ({
        data: {
          updates: {
            updatedRange: range.startsWith("'Datos'")
              ? "'Datos'!A3:AF3"
              : "'Expo'!A88:U88",
          },
        },
      })
    )
    const r = await upsertVehiculoEnHojas(7, 'create')
    expect(r.ok).toBe(true)
    expect(r.faltantes).toEqual(['BASE_DATOS/Datos'])
    const ap = mockSheets.spreadsheets.values.append.mock.calls[0][0]
    expect(ap.range).toBe("'Datos'!A1")
    expect(ap.valueInputOption).toBe('USER_ENTERED')
    expect(ap.requestBody.values[0][0]).toBe('1002')
    expect(ap.requestBody.values[0][2]).toBe('Peugeot 2008')
    expect(ap.requestBody.values[0][4]).toBe('01/12/2020')
    expect(ap.requestBody.values[0][5]).toBe(13985)
    // Fórmulas de la fila 2 desplazadas a la 3 (sin las ARRAYFORMULA de kms/matriculacion).
    const formulas = mockSheets.spreadsheets.values.batchUpdate.mock.calls
      .map((c) => c[0])
      .find(
        (c) =>
          c.spreadsheetId === '1pm2KiO1vXy5Zn7OGe8wjOXhKzUub2QIG5Tjv4GDqEBI'
      )
    expect(formulas.requestBody.valueInputOption).toBe('USER_ENTERED')
    const porRango = Object.fromEntries(
      formulas.requestBody.data.map(
        (d: { range: string; values: unknown[][] }) => [d.range, d.values[0][0]]
      )
    )
    expect(porRango["'Datos'!J3"]).toBe(
      '=IF(((DAYS360(E3;TODAY()))/30)<72;"NORMAL";"ESPECIAL")'
    )
    expect(porRango["'Datos'!P3"]).toBe('=C3')
    expect(porRango["'Datos'!R3"]).toBe('=TODAY()')
    expect(porRango["'Datos'!X3"]).toBeUndefined()
    expect(porRango["'Datos'!AB3"]).toBeUndefined()
    const cp = mockSheets.spreadsheets.batchUpdate.mock.calls.find(
      (c) => c[0].requestBody.requests?.[0]?.copyPaste
    )
    expect(cp[0].requestBody.requests[0].copyPaste).toMatchObject({
      pasteType: 'PASTE_FORMAT',
      source: { sheetId: 1423934348, startRowIndex: 1, endRowIndex: 2 },
      destination: { sheetId: 1423934348, startRowIndex: 2, endRowIndex: 3 },
    })
    expect(r.detalle.find((d) => d.pestana === 'Datos')?.celda).toBe('A3')
  })

  it('Base_Datos: vendido con fila → sólo columnas de identidad; tipo R no va', async () => {
    dbConVehiculo({
      ...VEHICULO,
      estado: 'VENDIDO',
      matricula: '9999ZZZ',
      ficha_regimen: 'REBU',
      precioPublicacion: 20000,
    })
    hojas([FILA_EXPO], [FILA_COMPRAS])
    const r = await upsertVehiculoEnHojas(7, 'estado')
    const datos = r.detalle.filter((d) => d.pestana === 'Datos')
    expect(datos.map((d) => d.columna)).toEqual(['MATRICULA'])

    jest.clearAllMocks()
    dbConVehiculo({ ...VEHICULO, tipo: 'R', referencia: '#R-05' })
    hojas([FILA_EXPO], [FILA_COMPRAS])
    await upsertVehiculoEnHojas(7, 'update')
    const rangos = mockSheets.spreadsheets.values.get.mock.calls.map(
      (c) => c[0].range
    )
    expect(rangos.some((x: string) => x.startsWith("'Datos'"))).toBe(false)
  })

  it('SHEETS_VEHICULO_DISABLED=1 → no-op', async () => {
    process.env.SHEETS_VEHICULO_DISABLED = '1'
    const r = await upsertVehiculoEnHojas(7, 'update')
    expect(r).toMatchObject({ ok: true, escritas: 0 })
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockSheets.spreadsheets.values.get).not.toHaveBeenCalled()
  })

  it('vehículo inexistente → permanente', async () => {
    dbConVehiculo(null)
    const r = await upsertVehiculoEnHojas(999, 'update')
    expect(r.ok).toBe(false)
    expect(r.permanente).toBe(true)
  })

  it('429 persistente → ok:false transitorio (no permanente)', async () => {
    dbConVehiculo()
    mockSheets.spreadsheets.values.get.mockRejectedValue(
      Object.assign(new Error('quota'), { status: 429 })
    )
    const r = await upsertVehiculoEnHojas(7, 'update')
    expect(r.ok).toBe(false)
    expect(r.permanente).toBeUndefined()
    expect(r.error).toContain('quota')
  }, 15_000)
})

describe('encolarSheetsVehiculo / procesarOutboxSheetsVehiculo', () => {
  it('inserta en el outbox y procesa en background (marca enviado)', async () => {
    dbConVehiculo()
    hojas([FILA_EXPO], [FILA_COMPRAS])
    ;(insertOutboxPending as jest.Mock).mockResolvedValue(42)
    const r = await encolarSheetsVehiculo(7, 'update')
    expect(r).toEqual({ encolado: true, outboxId: 42 })
    expect(insertOutboxPending).toHaveBeenCalledWith(
      'sheets_vehiculo',
      { vehiculoId: 7, motivo: 'update' },
      '#1002'
    )
    await new Promise((res) => setImmediate(res))
    expect(markOutboxEnviado).toHaveBeenCalledWith(42)
  })

  it('dedupe: si ya hay pendiente para el vehículo no encola otro', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('FROM webhook_outbox') ? { rows: [{ id: 5 }] } : { rows: [] }
    )
    const r = await encolarSheetsVehiculo(7, 'kanban')
    expect(r).toEqual({ encolado: false, outboxId: 5, reason: 'ya pendiente' })
    expect(insertOutboxPending).not.toHaveBeenCalled()
  })

  it('kill switch: no encola', async () => {
    process.env.SHEETS_VEHICULO_DISABLED = '1'
    const r = await encolarSheetsVehiculo(7, 'update')
    expect(r.encolado).toBe(false)
    expect(mockQuery).not.toHaveBeenCalled()
    expect(insertOutboxPending).not.toHaveBeenCalled()
  })

  it('vehículo inexistente → agotado; fallo transitorio → fallo', async () => {
    dbConVehiculo(null)
    await procesarOutboxSheetsVehiculo(1, { vehiculoId: 999, motivo: 'retry' })
    expect(markOutboxAgotado).toHaveBeenCalledWith(
      1,
      expect.stringContaining('inexistente')
    )

    dbConVehiculo()
    mockSheets.spreadsheets.values.get.mockRejectedValue(new Error('boom'))
    await procesarOutboxSheetsVehiculo(2, { vehiculoId: 7, motivo: 'retry' })
    expect(markOutboxFallo).toHaveBeenCalledWith(
      2,
      expect.stringContaining('boom')
    )
  })

  it('sin reserva de la fila (otro job en curso) no procesa ni marca nada', async () => {
    dbConVehiculo()
    hojas([FILA_EXPO], [FILA_COMPRAS])
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('UPDATE webhook_outbox') ? { rows: [] } : { rows: [] }
    )
    await procesarOutboxSheetsVehiculo(3, { vehiculoId: 7, motivo: 'update' })
    expect(mockSheets.spreadsheets.values.get).not.toHaveBeenCalled()
    expect(markOutboxEnviado).not.toHaveBeenCalled()
    expect(markOutboxFallo).not.toHaveBeenCalled()
    const reserva = mockQuery.mock.calls.find(([s]) =>
      String(s).includes('UPDATE webhook_outbox')
    )
    expect(String(reserva?.[0])).toMatch(/estado = 'procesando'/)
    expect(String(reserva?.[0])).toMatch(/NOT EXISTS/)
    expect(reserva?.[1]).toEqual([3, 'sheets_vehiculo'])
  })

  it('reenviar con outboxId: si no reserva → skip, si reserva → upsert', async () => {
    dbConVehiculo()
    hojas([FILA_EXPO], [FILA_COMPRAS])
    const base = mockQuery.getMockImplementation()!
    mockQuery.mockImplementation(async (sql: string, p?: unknown[]) =>
      sql.includes('UPDATE webhook_outbox') ? { rows: [] } : base(sql, p)
    )
    const s = await reenviarSheetsVehiculo(
      { vehiculoId: 7, motivo: 'retry' },
      9
    )
    expect(s).toEqual({ ok: false, error: 'en curso', skip: true })
    expect(mockSheets.spreadsheets.values.get).not.toHaveBeenCalled()

    dbConVehiculo()
    const r = await reenviarSheetsVehiculo(
      { vehiculoId: 7, motivo: 'retry' },
      9
    )
    expect(r.ok).toBe(true)
    expect(r.skip).toBeUndefined()
    // Expo + Compras + Datos (valores y fórmulas)
    expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledTimes(4)
  })

  it('writeVehiculoToSheets sin id: no lanza ni encola', async () => {
    await expect(
      writeVehiculoToSheets({ referencia: '#1', tipo: 'C' } as never)
    ).resolves.toBeUndefined()
    expect(insertOutboxPending).not.toHaveBeenCalled()
  })
})
