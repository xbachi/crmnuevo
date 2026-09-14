/**
 * @jest-environment node
 *
 * POST /api/admin/sheets-vehiculos/aviso — nota A1 en las pestañas gestionadas.
 * googleapis y googleSheets mockeados (unit, sin red).
 */

const mockBatchUpdate = jest.fn()

jest.mock('googleapis', () => ({
  google: {
    sheets: () => ({ spreadsheets: { batchUpdate: mockBatchUpdate } }),
  },
}))

jest.mock('@/lib/googleSheets', () => ({
  getGoogleSheetsAuth: jest.fn().mockResolvedValue({}),
  getSheetId: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { getSheetId } from '@/lib/googleSheets'
import { SHEETS_CONFIG } from '@/lib/sheetsConfig'
import {
  POST,
  NOTA_AVISO_CRM,
} from '@/app/api/admin/sheets-vehiculos/aviso/route'

const mockGetSheetId = getSheetId as jest.Mock
const ADMIN_SECRET = 'test-admin-secret'

function makeRequest(secret = ADMIN_SECRET) {
  return new NextRequest('http://localhost/api/admin/sheets-vehiculos/aviso', {
    method: 'POST',
    headers: { 'x-admin-secret': secret },
  })
}

const SHEET_IDS: Record<string, number> = {
  Expo: 0,
  Deposito: 1589175432,
  R: 755811500,
  Compras: 0,
  Datos: 1423934348,
}

beforeEach(() => {
  mockBatchUpdate.mockReset()
  mockGetSheetId.mockReset()
  mockGetSheetId.mockImplementation(async (_id: string, pestana: string) => {
    if (pestana in SHEET_IDS) return SHEET_IDS[pestana]
    throw new Error(`Hoja '${pestana}' no encontrada`)
  })
  process.env.ADMIN_SECRET = ADMIN_SECRET
})

afterEach(() => {
  delete process.env.ADMIN_SECRET
})

describe('POST /api/admin/sheets-vehiculos/aviso', () => {
  it('sin X-Admin-Secret válido → 401 y no toca las hojas', async () => {
    const res = await POST(makeRequest('wrong'))
    expect(res.status).toBe(401)
    expect(mockBatchUpdate).not.toHaveBeenCalled()
    expect(mockGetSheetId).not.toHaveBeenCalled()
  })

  it('escribe la nota en A1 de las 7 pestañas con un batchUpdate por hoja', async () => {
    mockBatchUpdate.mockResolvedValue({ data: {} })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.pestanas).toHaveLength(7)
    expect(json.pestanas).toContainEqual({
      hoja: 'BASE_DATOS',
      pestana: 'Datos',
      sheetId: 1423934348,
    })

    expect(mockBatchUpdate).toHaveBeenCalledTimes(3)
    const ids = mockBatchUpdate.mock.calls.map((c) => c[0].spreadsheetId)
    expect(ids).toEqual([
      SHEETS_CONFIG.SPREADSHEET_IDS.VENTAS,
      SHEETS_CONFIG.SPREADSHEET_IDS.COMPRAS,
      SHEETS_CONFIG.SPREADSHEET_IDS.BASE_DATOS,
    ])

    for (const call of mockBatchUpdate.mock.calls) {
      const requests = call[0].requestBody.requests
      expect(requests.length).toBeGreaterThanOrEqual(1)
      for (const r of requests) {
        expect(r.updateCells.fields).toBe('note')
        expect(r.updateCells.range).toMatchObject({
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 1,
        })
        expect(r.updateCells.rows).toEqual([
          { values: [{ note: NOTA_AVISO_CRM }] },
        ])
        // Sólo la nota: nunca valores ni formato.
        expect(r.updateCells.rows[0].values[0]).not.toHaveProperty(
          'userEnteredValue'
        )
      }
    }
  })

  it('pestaña no encontrada → 500 con errores y sin abortar la otra hoja', async () => {
    mockBatchUpdate.mockResolvedValue({ data: {} })
    mockGetSheetId.mockImplementation(async (id: string, pestana: string) => {
      if (id === SHEETS_CONFIG.SPREADSHEET_IDS.VENTAS && pestana === 'R')
        throw new Error("Hoja 'R' no encontrada")
      return SHEET_IDS[pestana]
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.errores).toEqual(["VENTAS/R: Hoja 'R' no encontrada"])
    expect(json.pestanas).toHaveLength(6)
    expect(mockBatchUpdate).toHaveBeenCalledTimes(3)
    expect(mockBatchUpdate.mock.calls[0][0].requestBody.requests).toHaveLength(
      2
    )
  })
})
