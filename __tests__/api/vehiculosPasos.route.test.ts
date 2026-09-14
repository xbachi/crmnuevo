/**
 * @jest-environment node
 *
 * PUT /api/vehiculos/[id] con `pasos` (checklist de preparación) y GET con pasos.
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({
  getVehiculoById: jest.fn(),
  updateVehiculo: jest.fn(),
  deleteVehiculo: jest.fn(),
}))
jest.mock('@/lib/vehiculoPasos', () => ({
  ...jest.requireActual('@/lib/vehiculoPasosConst'),
  esPasoVehiculo: (v: unknown) =>
    [
      'REVI_INIC',
      'MECAUTO',
      'REVI_PINTURA',
      'PINTURA',
      'LIMPIEZA',
      'FOTOS',
      'PUBLICADO',
    ].includes(String(v)),
  getPasos: jest.fn(),
  upsertPasos: jest.fn(),
  registrarPasoEstado: jest.fn(),
}))
jest.mock('@/lib/sheetsVehiculo', () => ({
  encolarSheetsVehiculo: jest.fn().mockResolvedValue({ encolado: true }),
}))
jest.mock('@/lib/webSync', () => ({
  notifyWebVehiculoEstado: jest.fn().mockResolvedValue({ sent: false }),
}))

import { GET, PUT } from '@/app/api/vehiculos/[id]/route'
import { getVehiculoById, updateVehiculo } from '@/lib/direct-database'
import { getPasos, upsertPasos } from '@/lib/vehiculoPasos'
import { encolarSheetsVehiculo } from '@/lib/sheetsVehiculo'

const mockGet = getVehiculoById as unknown as jest.Mock
const mockUpdate = updateVehiculo as unknown as jest.Mock
const mockGetPasos = getPasos as unknown as jest.Mock
const mockUpsertPasos = upsertPasos as unknown as jest.Mock
const mockEncolar = encolarSheetsVehiculo as unknown as jest.Mock

function makeReq(body: Record<string, unknown>): NextRequest {
  return {
    url: 'http://localhost/api/vehiculos/7',
    json: async () => body,
  } as unknown as NextRequest
}
const params = { params: Promise.resolve({ id: '7' }) }
const VEHICULO = {
  id: 7,
  referencia: '#1002',
  tipo: 'C',
  estado: 'FOTOS',
  matricula: '0046LLR',
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
  mockGet.mockReset().mockResolvedValue(VEHICULO)
  mockUpdate
    .mockReset()
    .mockImplementation(async (_id, data) => ({ ...VEHICULO, ...data }))
  mockGetPasos
    .mockReset()
    .mockResolvedValue([
      { paso: 'FOTOS', texto: '1/6', fecha: '2026-06-01', fuente: 'import' },
    ])
  mockUpsertPasos.mockReset().mockResolvedValue(undefined)
  mockEncolar.mockClear()
})
afterEach(() => jest.restoreAllMocks())

describe('GET /api/vehiculos/[id]', () => {
  it('devuelve el vehículo con sus pasos', async () => {
    const res = await GET(makeReq({}), params)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.pasos).toEqual([
      expect.objectContaining({ paso: 'FOTOS', texto: '1/6' }),
    ])
  })
})

describe('PUT /api/vehiculos/[id] — pasos', () => {
  it('body con sólo pasos → upsertPasos, no toca Vehiculo y encola sheets', async () => {
    const res = await PUT(
      makeReq({
        pasos: [{ paso: 'PINTURA', texto: '5-9 fergo', fecha: '2026-09-05' }],
      }),
      params
    )
    expect(res.status).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockUpsertPasos).toHaveBeenCalledWith(
      7,
      [{ paso: 'PINTURA', texto: '5-9 fergo', fecha: '2026-09-05' }],
      'crm'
    )
    expect(mockEncolar).toHaveBeenCalledWith(7, 'update')
  })

  it('pasos + campos de compra → updateVehiculo con la whitelist ampliada y pasos aparte', async () => {
    const res = await PUT(
      makeReq({
        proveedor: 'ayvens',
        recibidoFecha: '',
        pasos: [{ paso: 'FOTOS', texto: null, fecha: null }],
      }),
      params
    )
    expect(res.status).toBe(200)
    const data = mockUpdate.mock.calls[0][1]
    expect(data).toEqual({ proveedor: 'ayvens', recibidoFecha: null })
    expect('pasos' in data).toBe(false)
    expect(mockUpsertPasos).toHaveBeenCalledTimes(1)
  })

  it('paso desconocido → 400', async () => {
    const res = await PUT(
      makeReq({ pasos: [{ paso: 'CARPETA', texto: 'SI' }] }),
      params
    )
    expect(res.status).toBe(400)
    expect(mockUpsertPasos).not.toHaveBeenCalled()
  })

  it('fecha de paso inválida → 400', async () => {
    const res = await PUT(
      makeReq({ pasos: [{ paso: 'FOTOS', fecha: '24/3' }] }),
      params
    )
    expect(res.status).toBe(400)
  })

  it('recibidoFecha inválida → 400', async () => {
    const res = await PUT(makeReq({ recibidoFecha: '24/3' }), params)
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
