/**
 * @jest-environment node
 *
 * checkSheetsVehiculos (cron / admin): lee las 6 pestañas UNA sola vez,
 * reporta faltantes, diferencias y huérfanas; en dryRun no escribe nada,
 * en modo apply repara con el mismo upsert; el kill switch sólo frena apply.
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
import { checkSheetsVehiculos } from '@/lib/sheetsVehiculo'

const mockQuery = pool.query as jest.Mock

const H_EXPO = [
  'SI',
  'MARCA',
  'MODELO',
  '2DA LLAVE',
  'MATRICULA',
  'BASTIDOR',
  'KMS',
]
const H_DEPO_V = ['751', 'MARCA', 'MODELO', 'MATRICULA']
const H_R_V = [
  'Referencia',
  'MARCA',
  'MODELO',
  'MATRICULA',
  'ESTADO',
  'VENDIDO',
]
const H_COMPRAS = ['R', 'MARCA', 'MODELO', 'MATRICULA', 'PROVEEDOR', 'TOTAL']
const H_DEPO_C = ['REFERENCIA', 'MARCA', 'MODELO', 'MATRICULA']
const H_R_C = ['REFERENCIA', 'MARCA', 'MODELO', 'MATRICULA', 'GANANCI']

const V1 = {
  id: 1,
  referencia: '#1002',
  tipo: 'C',
  marca: 'Peugeot',
  modelo: '2008',
  matricula: '0046LLR',
  bastidor: 'VR3USHNKKLJ927403',
  kms: 78364,
  estado: 'PUBLICADO',
  proveedor: 'ayvens',
  createdAt: new Date(2026, 2, 12),
}
const V2 = {
  id: 2,
  referencia: '#D-02',
  tipo: 'D',
  marca: 'Nissan',
  modelo: 'Qashqai',
  matricula: '8722MZK',
  estado: 'VENDIDO',
  createdAt: new Date(2026, 2, 12),
}
const V3 = { id: 3, referencia: '#M-01', tipo: 'M', marca: 'X' }

const VALORES: Record<string, string[][]> = {}

function hojas() {
  VALORES["'Expo'"] = [
    H_EXPO,
    [
      '#1002',
      'Peugeot',
      '2008',
      'SI',
      '0046LLR',
      'VR3USHNKKLJ927403',
      '78.364',
    ],
  ]
  VALORES["'Deposito'/VENTAS"] = [
    H_DEPO_V,
    ['#D-02', 'Nissan', 'Qashqai', '8722MZK'],
  ]
  VALORES["'R'/VENTAS"] = [
    H_R_V,
    ['#R-05', 'Peugeot', '307', '2446CBJ', 'NAVE', 'BRYAN'],
  ]
  VALORES["'Compras'"] = [
    H_COMPRAS,
    ['#1002', 'Peugeot', '2008', '0046LLR', 'hertz', '8.742'],
  ]
  VALORES["'Deposito'/COMPRAS"] = [H_DEPO_C]
  VALORES["'R'/COMPRAS"] = [H_R_C]
  mockSheets.spreadsheets.values.get.mockImplementation(
    async ({
      range,
      spreadsheetId,
    }: {
      range: string
      spreadsheetId: string
    }) => {
      const tab = range.split('!')[0]
      const hoja =
        spreadsheetId === '1RwnqBYlPMXj2rUJ3XqegrSQ-kM5RIJG61uGALy-pEH8'
          ? 'VENTAS'
          : 'COMPRAS'
      const values = VALORES[tab] ?? VALORES[`${tab}/${hoja}`]
      return { data: { values: values.map((r) => [...r]) } }
    }
  )
  mockSheets.spreadsheets.values.append.mockResolvedValue({
    data: { updates: { updatedRange: "'Deposito'!A2:D2" } },
  })
  mockSheets.spreadsheets.values.batchUpdate.mockResolvedValue({ data: {} })
  mockSheets.spreadsheets.get.mockResolvedValue({
    data: { sheets: [{ properties: { title: 'Deposito', sheetId: 5 } }] },
  })
  mockSheets.spreadsheets.batchUpdate.mockResolvedValue({ data: {} })
}

function db(extra: Record<string, unknown>[] = []) {
  const vehiculos = [V1, V2, V3, ...extra]
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.startsWith('SELECT id, referencia, tipo FROM "Vehiculo"'))
      return {
        rows: vehiculos.map(({ id, referencia, tipo }) => ({
          id,
          referencia,
          tipo,
        })),
      }
    if (sql.includes('FROM "Vehiculo" v')) {
      const v = vehiculos.find((x) => x.id === params?.[0])
      return { rows: v ? [{ ...v, deal_importe: null, deal_cliente: '' }] : [] }
    }
    return { rows: [] }
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.SHEETS_VEHICULO_DISABLED
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'x@y'
  process.env.GOOGLE_PRIVATE_KEY = 'k'
  hojas()
  db()
})

describe('checkSheetsVehiculos', () => {
  it('dryRun: 6 lecturas, sin escrituras, reporta faltante + diferencia + huérfana', async () => {
    const r = await checkSheetsVehiculos({ dryRun: true, sinEsperas: true })
    expect(r.errores).toEqual([])
    expect(r.vehiculos).toBe(2) // el tipo M no cuenta
    expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledTimes(6)
    expect(mockSheets.spreadsheets.values.append).not.toHaveBeenCalled()
    expect(mockSheets.spreadsheets.values.batchUpdate).not.toHaveBeenCalled()
    expect(
      mockQuery.mock.calls.some(([s]) => String(s).includes('sheets_sync_log'))
    ).toBe(false)

    // #D-02 no está en COMPRAS/Deposito
    expect(r.porPestana['COMPRAS/Deposito'].faltantes).toEqual(['#D-02'])
    expect(r.appends).toBe(1)
    // PROVEEDOR 'hertz' ≠ 'ayvens' en COMPRAS/Compras; TOTAL no se toca
    const difs = r.porPestana['COMPRAS/Compras'].diferencias
    expect(difs).toEqual([
      expect.objectContaining({
        referencia: '#1002',
        celda: 'E2',
        columna: 'PROVEEDOR',
        anterior: 'hertz',
        nuevo: 'ayvens',
      }),
    ])
    expect(r.porPestana['VENTAS/Expo'].diferencias).toEqual([])
    // #R-05 en la hoja sin vehículo en el CRM
    expect(r.porPestana['VENTAS/R'].huerfanas).toEqual(['#R-05'])
    expect(r.porPestana['VENTAS/Expo'].huerfanas).toEqual([])
    expect(r.porPestana['VENTAS/Expo'].filas).toBe(1)
    // marca VENDIDO de #D-02 en Ventas/Deposito (columna sin cabecera)
    expect(r.porPestana['VENTAS/Deposito'].diferencias).toEqual([
      expect.objectContaining({
        referencia: '#D-02',
        columna: '',
        nuevo: 'VENDIDO',
      }),
    ])
  })

  it('apply: repara con batchUpdate + append y registra el log', async () => {
    const r = await checkSheetsVehiculos({ dryRun: false, sinEsperas: true })
    expect(r.errores).toEqual([])
    expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledTimes(6)
    expect(mockSheets.spreadsheets.values.append).toHaveBeenCalledTimes(1)
    expect(mockSheets.spreadsheets.values.batchUpdate).toHaveBeenCalledTimes(2)
    const logs = mockQuery.mock.calls.filter(([s]) =>
      String(s).includes('sheets_sync_log')
    )
    expect(logs.length).toBeGreaterThanOrEqual(2)
    expect(r.escritas).toBeGreaterThanOrEqual(3)
  })

  it('apply: append fuera de sitio → relee la pestaña, sin error', async () => {
    mockSheets.spreadsheets.values.append.mockResolvedValue({
      data: { updates: { updatedRange: "'Deposito'!A9:D9" } },
    })
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await checkSheetsVehiculos({ dryRun: false, sinEsperas: true })
    warn.mockRestore()
    expect(r.errores).toEqual([])
    expect(r.appends).toBe(1)
    expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledTimes(7)
  })

  it('kill switch: apply no hace nada, dryRun sigue leyendo', async () => {
    process.env.SHEETS_VEHICULO_DISABLED = '1'
    const a = await checkSheetsVehiculos({ dryRun: false, sinEsperas: true })
    expect(a.errores).toEqual(['SHEETS_VEHICULO_DISABLED=1'])
    expect(mockSheets.spreadsheets.values.get).not.toHaveBeenCalled()
    const d = await checkSheetsVehiculos({ dryRun: true, sinEsperas: true })
    expect(d.errores).toEqual([])
    expect(mockSheets.spreadsheets.values.get).toHaveBeenCalledTimes(6)
  })

  it('vehículo sin referencia: se lista en sinReferencia, no es error ni se sincroniza', async () => {
    db([{ id: 4, referencia: null, tipo: 'C', marca: 'Sin ref' }])
    const r = await checkSheetsVehiculos({ dryRun: true, sinEsperas: true })
    expect(r.errores).toEqual([])
    expect(r.sinReferencia).toEqual(['#4'])
    expect(r.vehiculos).toBe(3)
    expect(
      mockQuery.mock.calls.some(([, p]) => Array.isArray(p) && p[0] === 4)
    ).toBe(false)
  })

  it('fallo de lectura de una pestaña: error y sin recorrer vehículos', async () => {
    mockSheets.spreadsheets.values.get.mockRejectedValue(new Error('boom'))
    const r = await checkSheetsVehiculos({ dryRun: true, sinEsperas: true })
    expect(r.errores).toEqual(['lectura VENTAS/Expo: boom'])
    expect(r.vehiculos).toBe(0)
  })
})
