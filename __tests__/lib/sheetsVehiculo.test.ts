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

function hojas(expo: string[][], compras: string[][]) {
  mockSheets.spreadsheets.values.get.mockImplementation(
    async ({ range }: { range: string }) => ({
      // Copias: el upsert actualiza la fila leída in situ (caché) y los fixtures se comparten.
      data: {
        values: range.startsWith("'Expo'")
          ? [HEADERS_EXPO, ...expo.map((r) => [...r])]
          : [HEADERS_COMPRAS, ...compras.map((r) => [...r])],
      },
    })
  )
}

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
    ])
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await upsertVehiculoEnHojas(7, 'cron', { cache })
    warn.mockRestore()
    expect(r.appends).toBe(1)
    expect(r.detalle[0].celda).toBe('A88')
    expect(cache.has('VENTAS/Expo')).toBe(false)
    expect(cache.has('COMPRAS/Compras')).toBe(true)
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
    expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledTimes(2)
  })

  it('writeVehiculoToSheets sin id: no lanza ni encola', async () => {
    await expect(
      writeVehiculoToSheets({ referencia: '#1', tipo: 'C' } as never)
    ).resolves.toBeUndefined()
    expect(insertOutboxPending).not.toHaveBeenCalled()
  })
})
