/**
 * @jest-environment node
 *
 * GET /api/vehiculos-optimized (destino del rewrite /api/vehiculos) — la
 * paginación pedida por el cliente llega a la capa de datos y el total es el
 * real (no la longitud del array). direct-database mockeado (unit, sin DB).
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({
  getVehiculosPage: jest.fn(),
  getVehiculos: jest.fn(),
  saveVehiculo: jest.fn(),
  updateVehiculo: jest.fn(),
  deleteVehiculo: jest.fn(),
  getVehiculoById: jest.fn(),
}))
jest.mock('@/lib/googleSheets', () => ({ writeVehiculoToSheets: jest.fn() }))

import { GET } from '@/app/api/vehiculos-optimized/route'
import { getVehiculosPage } from '@/lib/direct-database'

const mockPage = getVehiculosPage as unknown as jest.Mock

function makeReq(qs = ''): NextRequest {
  return {
    url: `http://localhost/api/vehiculos-optimized${qs}`,
  } as unknown as NextRequest
}

const v = (id: number) => ({ id, referencia: String(id), marca: 'BMW' })

beforeEach(() => mockPage.mockReset())

describe('GET /api/vehiculos-optimized — paginación', () => {
  it('?page=2&limit=2&search=bmw → limit 2 / offset 2 / search bmw, total real', async () => {
    mockPage.mockResolvedValue({ vehiculos: [v(3), v(4)], total: 7 })

    const res = await GET(makeReq('?page=2&limit=2&search=bmw'))
    expect(res.status).toBe(200)
    expect(mockPage).toHaveBeenCalledTimes(1)
    expect(mockPage).toHaveBeenCalledWith({
      limit: 2,
      offset: 2,
      search: 'bmw',
      tipo: undefined,
    })

    const json = await res.json()
    expect(json.vehiculos).toHaveLength(2)
    expect(json.pagination).toEqual(
      expect.objectContaining({
        total: 7, // del total_count, no vehiculos.length (2)
        page: 2,
        limit: 2,
        totalPages: 4,
        hasNext: true,
        hasPrev: true,
      })
    )
    // Claves planas viejas mantenidas por compatibilidad
    expect(json.total).toBe(7)
    expect(json.page).toBe(2)
    expect(json.limit).toBe(2)
    expect(json.totalPages).toBe(4)
  })

  it('última página → hasNext false', async () => {
    mockPage.mockResolvedValue({ vehiculos: [v(7)], total: 7 })

    const res = await GET(makeReq('?page=4&limit=2'))
    const json = await res.json()
    expect(mockPage.mock.calls[0][0]).toMatchObject({ limit: 2, offset: 6 })
    expect(json.pagination).toMatchObject({
      total: 7,
      page: 4,
      totalPages: 4,
      hasNext: false,
    })
  })

  it('tipo se reenvía a la capa de datos', async () => {
    mockPage.mockResolvedValue({ vehiculos: [], total: 0 })
    await GET(makeReq('?page=1&limit=10&tipo=I'))
    expect(mockPage.mock.calls[0][0]).toMatchObject({ tipo: 'I', offset: 0 })
  })

  it('sin page/limit → sin LIMIT/OFFSET (todo el stock) en una sola página', async () => {
    mockPage.mockResolvedValue({ vehiculos: [v(1), v(2), v(3)], total: 3 })

    const res = await GET(makeReq())
    expect(mockPage).toHaveBeenCalledWith({
      limit: undefined,
      offset: undefined,
      search: undefined,
      tipo: undefined,
    })
    const json = await res.json()
    expect(json.vehiculos).toHaveLength(3)
    expect(json.pagination).toMatchObject({
      total: 3,
      page: 1,
      totalPages: 1,
      hasNext: false,
    })
  })

  it('page/limit inválidos caen al default (page 1, limit 20)', async () => {
    mockPage.mockResolvedValue({ vehiculos: [], total: 0 })
    await GET(makeReq('?page=abc&limit=0'))
    expect(mockPage.mock.calls[0][0]).toMatchObject({ limit: 20, offset: 0 })
  })

  it('500 si la capa de datos lanza', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockPage.mockRejectedValue(new Error('boom'))
    const res = await GET(makeReq('?page=1&limit=5'))
    expect(res.status).toBe(500)
    err.mockRestore()
  })
})
