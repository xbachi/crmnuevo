/**
 * @jest-environment node
 *
 * GET /api/clientes, /api/interesados, /api/deals, /api/depositos — sin
 * `page` responden el array completo de siempre (selects, kanban y fichas lo
 * esperan); con `page` (limit/q opcionales) llaman a la función *Page con el
 * offset correcto y devuelven { <clave>, pagination } con el total real.
 * direct-database mockeado (unit, sin DB).
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => {
  const client = { query: jest.fn(), release: jest.fn() }
  return {
    pool: {
      connect: jest.fn(async () => client),
      query: jest.fn(),
      __client: client,
    },
    getClientesPage: jest.fn(),
    getInteresadosPage: jest.fn(),
    getDeals: jest.fn(),
    getDealsPage: jest.fn(),
    getDepositosPage: jest.fn(),
    createDeal: jest.fn(),
  }
})

import { GET as getClientes } from '@/app/api/clientes/route'
import { GET as getInteresados } from '@/app/api/interesados/route'
import { GET as getDealsRoute } from '@/app/api/deals/route'
import { GET as getDepositos } from '@/app/api/depositos/route'
import {
  getClientesPage,
  getDeals,
  getDealsPage,
  getDepositosPage,
  getInteresadosPage,
  pool,
} from '@/lib/direct-database'

const mockPool = pool as unknown as {
  query: jest.Mock
  __client: { query: jest.Mock; release: jest.Mock }
}
const mockClientesPage = getClientesPage as unknown as jest.Mock
const mockInteresadosPage = getInteresadosPage as unknown as jest.Mock
const mockDeals = getDeals as unknown as jest.Mock
const mockDealsPage = getDealsPage as unknown as jest.Mock
const mockDepositosPage = getDepositosPage as unknown as jest.Mock

function makeReq(path: string, qs = ''): NextRequest {
  return { url: `http://localhost${path}${qs}` } as unknown as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

describe('GET /api/clientes', () => {
  it('sin params → SELECT completo por pool y array plano (misma forma que antes)', async () => {
    mockPool.__client.query.mockResolvedValue({
      rows: [{ id: 1, nombre: 'Ana' }],
    })

    const res = await getClientes(makeReq('/api/clientes'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(Array.isArray(json)).toBe(true)
    expect(json).toEqual([{ id: 1, nombre: 'Ana' }])
    expect(mockPool.__client.query.mock.calls[0][0]).toMatch(/FROM "Cliente"/)
    expect(mockPool.__client.query.mock.calls[0][0]).not.toMatch(/LIMIT/)
    expect(mockClientesPage).not.toHaveBeenCalled()
  })

  it('?limit=5 sin page (fichas antiguas) → sigue siendo el array completo', async () => {
    mockPool.__client.query.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] })
    const json = await (
      await getClientes(makeReq('/api/clientes', '?limit=5'))
    ).json()
    expect(Array.isArray(json)).toBe(true)
    expect(json).toHaveLength(2)
    expect(mockClientesPage).not.toHaveBeenCalled()
  })

  it('?page=2&limit=10&q=ana → getClientesPage con offset 10 y pagination.total real', async () => {
    mockClientesPage.mockResolvedValue({
      rows: [{ id: 11 }, { id: 12 }],
      total: 37,
    })

    const res = await getClientes(
      makeReq('/api/clientes', '?page=2&limit=10&q=ana')
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(mockClientesPage).toHaveBeenCalledTimes(1)
    expect(mockClientesPage).toHaveBeenCalledWith({
      limit: 10,
      offset: 10,
      q: 'ana',
    })
    expect(mockPool.__client.query).not.toHaveBeenCalled()
    expect(json.clientes).toEqual([{ id: 11 }, { id: 12 }])
    expect(json.pagination).toEqual({
      total: 37, // del total_count, no clientes.length (2)
      page: 2,
      limit: 10,
      totalPages: 4,
      hasNext: true,
      hasPrev: true,
    })
  })

  it('page inválido → 1; limit por defecto 50 y tope 200; sin resultados → totalPages 1', async () => {
    mockClientesPage.mockResolvedValue({ rows: [], total: 0 })

    let json = await (
      await getClientes(makeReq('/api/clientes', '?page=abc'))
    ).json()
    expect(mockClientesPage).toHaveBeenLastCalledWith({
      limit: 50,
      offset: 0,
      q: undefined,
    })
    expect(json.pagination).toMatchObject({
      page: 1,
      limit: 50,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    })

    json = await (
      await getClientes(makeReq('/api/clientes', '?page=0&limit=999'))
    ).json()
    expect(mockClientesPage).toHaveBeenLastCalledWith({
      limit: 200,
      offset: 0,
      q: undefined,
    })
    expect(json.pagination.limit).toBe(200)
  })
})

describe('GET /api/interesados', () => {
  it('sin params → array plano mapeado desde el pool', async () => {
    mockPool.__client.query.mockResolvedValue({
      rows: [{ id: 1, nombre: 'Luis', vehiculosinteres: '["Golf"]' }],
    })
    const json = await (
      await getInteresados(makeReq('/api/interesados'))
    ).json()
    expect(json).toEqual([
      expect.objectContaining({ id: 1, vehiculosInteres: '["Golf"]' }),
    ])
    expect(mockInteresadosPage).not.toHaveBeenCalled()
  })

  it('?page=1&q=golf → { interesados, pagination }', async () => {
    mockInteresadosPage.mockResolvedValue({ rows: [{ id: 3 }], total: 1 })
    const json = await (
      await getInteresados(makeReq('/api/interesados', '?page=1&q=golf'))
    ).json()
    expect(mockInteresadosPage).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      q: 'golf',
    })
    expect(json.interesados).toEqual([{ id: 3 }])
    expect(json.pagination).toMatchObject({ total: 1, page: 1, totalPages: 1 })
  })
})

describe('GET /api/deals', () => {
  it('sin params → getDeals y array plano (deals/nuevo lo espera así)', async () => {
    mockDeals.mockResolvedValue([{ id: 1, estado: 'reservado' }])
    const json = await (await getDealsRoute(makeReq('/api/deals'))).json()
    expect(json).toEqual([{ id: 1, estado: 'reservado' }])
    expect(mockDealsPage).not.toHaveBeenCalled()
  })

  it('?page=3&limit=20 → getDealsPage con offset 40 y { deals, pagination }', async () => {
    mockDealsPage.mockResolvedValue({ rows: [{ id: 41 }], total: 41 })
    const json = await (
      await getDealsRoute(makeReq('/api/deals', '?page=3&limit=20'))
    ).json()
    expect(mockDealsPage).toHaveBeenCalledWith({
      limit: 20,
      offset: 40,
      q: undefined,
    })
    expect(mockDeals).not.toHaveBeenCalled()
    expect(json.deals).toEqual([{ id: 41 }])
    expect(json.pagination).toMatchObject({
      total: 41,
      page: 3,
      totalPages: 3,
      hasNext: false,
      hasPrev: true,
    })
  })
})

describe('GET /api/depositos', () => {
  it('sin params → dos queries por pool.query y array plano combinado', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 7,
            cliente_id: 2,
            vehiculo_id: 5,
            estado: 'ACTIVO',
            created_at: '2026-09-01',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ vehiculo_id: 8, createdAt: '2026-08-01', tipo: 'D' }],
      })
    const json = await (await getDepositos(makeReq('/api/depositos'))).json()
    expect(Array.isArray(json)).toBe(true)
    expect(json.map((d: { id: number | string }) => d.id)).toEqual([
      7,
      'vehiculo_8',
    ])
    expect(mockPool.query).toHaveBeenCalledTimes(2)
    expect(mockDepositosPage).not.toHaveBeenCalled()
  })

  it('?page=2&limit=10&q=seat → getDepositosPage y { depositos, pagination }', async () => {
    mockDepositosPage.mockResolvedValue({
      rows: [{ id: 'vehiculo_8' }],
      total: 11,
    })
    const json = await (
      await getDepositos(makeReq('/api/depositos', '?page=2&limit=10&q=seat'))
    ).json()
    expect(mockDepositosPage).toHaveBeenCalledWith({
      limit: 10,
      offset: 10,
      q: 'seat',
    })
    expect(mockPool.query).not.toHaveBeenCalled()
    expect(json.depositos).toEqual([{ id: 'vehiculo_8' }])
    expect(json.pagination).toMatchObject({
      total: 11,
      page: 2,
      totalPages: 2,
      hasNext: false,
      hasPrev: true,
    })
  })
})
