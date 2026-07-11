/**
 * @jest-environment node
 *
 * PUT /api/vehiculos/[id] — whitelist de campos, máquina de estados y
 * normalización de matrícula. direct-database va mockeado (unit, sin DB).
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({
  getVehiculoById: jest.fn(),
  updateVehiculo: jest.fn(),
  deleteVehiculo: jest.fn(),
}))

import { PUT } from '@/app/api/vehiculos/[id]/route'
import { getVehiculoById, updateVehiculo } from '@/lib/direct-database'

const mockGet = getVehiculoById as unknown as jest.Mock
const mockUpdate = updateVehiculo as unknown as jest.Mock

function makeReq(body: Record<string, unknown>): NextRequest {
  return {
    url: 'http://localhost/api/vehiculos/7',
    json: async () => body,
  } as unknown as NextRequest
}

const params = { params: Promise.resolve({ id: '7' }) }

const VEHICULO = {
  id: 7,
  referencia: '123',
  marca: 'Seat',
  modelo: 'Leon',
  matricula: '9500 KBD',
  estado: 'VENDIDO',
  inversorId: null,
}

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(VEHICULO)
  mockUpdate
    .mockReset()
    .mockImplementation(async (_id, data) => ({ ...VEHICULO, ...data }))
})

describe('PUT /api/vehiculos/[id] — máquina de estados', () => {
  it('transición inválida (VENDIDO→PUBLICADO) → 422 y no actualiza', async () => {
    const res = await PUT(makeReq({ estado: 'PUBLICADO' }), params)
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toMatch(/Transición de estado inválida/)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('transición inválida con force: true → pasa (con warn) y guarda canónico', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await PUT(
      makeReq({ estado: 'publicado', force: true }),
      params
    )
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const data = mockUpdate.mock.calls[0][1]
    expect(data.estado).toBe('PUBLICADO') // casing canónico
    expect('force' in data).toBe(false) // force no llega a la DB
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Transición de estado forzada')
    )
    warn.mockRestore()
  })

  it('transición válida (VENDIDO→DISPONIBLE vía alias EN_STOCK) → 200', async () => {
    const res = await PUT(makeReq({ estado: 'EN_STOCK' }), params)
    expect(res.status).toBe(200)
    expect(mockUpdate.mock.calls[0][1].estado).toBe('DISPONIBLE')
  })

  it('mismo estado con otro casing es no-op válido', async () => {
    const res = await PUT(makeReq({ estado: 'vendido' }), params)
    expect(res.status).toBe(200)
    expect(mockUpdate.mock.calls[0][1].estado).toBe('VENDIDO')
  })
})

describe('PUT /api/vehiculos/[id] — whitelist', () => {
  it('campos no permitidos no llegan a updateVehiculo', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await PUT(
      makeReq({
        marca: 'Cupra',
        id: 999,
        dealActivoId: 12,
        orden: 5,
        loQueSea: 'x',
      }),
      params
    )
    expect(res.status).toBe(200)
    const data = mockUpdate.mock.calls[0][1]
    expect(data).toEqual({ marca: 'Cupra' })
    warn.mockRestore()
  })
})

describe('PUT /api/vehiculos/[id] — matrícula', () => {
  it('normaliza espacios/casing al guardar y responde matriculaNorm', async () => {
    const res = await PUT(makeReq({ matricula: '  9500   kbd ' }), params)
    expect(res.status).toBe(200)
    expect(mockUpdate.mock.calls[0][1].matricula).toBe('9500 KBD')
    const json = await res.json()
    expect(json.matriculaNorm).toBe('9500KBD')
  })

  it('sin matricula en el body no agrega matriculaNorm al payload', async () => {
    const res = await PUT(makeReq({ marca: 'Cupra' }), params)
    const json = await res.json()
    expect('matriculaNorm' in json).toBe(false)
  })
})
