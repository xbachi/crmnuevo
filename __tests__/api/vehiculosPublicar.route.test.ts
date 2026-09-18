/**
 * @jest-environment node
 *
 * Bloqueo de publicación: PUT /api/vehiculos/[id] y PUT /api/vehiculos/kanban
 * responden 409 con `faltantes` cuando el coche no está listo para PUBLICADO.
 * Ni la venta ni la reserva ni la preparación se bloquean nunca.
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
  getVehiculoById: jest.fn(),
  getVehiculos: jest.fn(async () => []),
  updateVehiculo: jest.fn(),
  updateVehiculosOrden: jest.fn(async () => undefined),
  deleteVehiculo: jest.fn(),
}))
jest.mock('@/lib/vehiculoCamposDoc', () => ({
  faltantesParaPublicar: jest.fn(async () => []),
}))

import { PUT } from '@/app/api/vehiculos/[id]/route'
import { PUT as PUT_KANBAN } from '@/app/api/vehiculos/kanban/route'
import {
  getVehiculoById,
  pool,
  updateVehiculo,
  updateVehiculosOrden,
} from '@/lib/direct-database'
import { faltantesParaPublicar } from '@/lib/vehiculoCamposDoc'

const mockGet = getVehiculoById as unknown as jest.Mock
const mockUpdate = updateVehiculo as unknown as jest.Mock
const mockOrden = updateVehiculosOrden as unknown as jest.Mock
const mockQuery = pool.query as unknown as jest.Mock
const mockFaltantes = faltantesParaPublicar as unknown as jest.Mock

const FALTA_BASTIDOR = [
  { campo: 'bastidor', etiqueta: 'Bastidor', motivo: 'Falta bastidor.' },
]

function makeReq(body: Record<string, unknown>): NextRequest {
  return {
    url: 'http://localhost/api/vehiculos/7',
    json: async () => body,
  } as unknown as NextRequest
}

const params = { params: Promise.resolve({ id: '7' }) }

const VEHICULO = {
  id: 7,
  referencia: '1088',
  marca: 'Kia',
  modelo: 'Ceed',
  matricula: '1234 BCD',
  estado: 'FOTOS',
  inversorId: null,
}

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(VEHICULO)
  mockUpdate
    .mockReset()
    .mockImplementation(async (_id, data) => ({ ...VEHICULO, ...data }))
  mockOrden.mockReset().mockResolvedValue(undefined)
  mockQuery.mockReset().mockResolvedValue({ rows: [] })
  mockFaltantes.mockReset().mockResolvedValue([])
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('PUT /api/vehiculos/[id] — bloqueo de publicación', () => {
  it('FOTOS→PUBLICADO con campos sin rellenar → 409 y no escribe', async () => {
    mockFaltantes.mockResolvedValue(FALTA_BASTIDOR)
    const res = await PUT(makeReq({ estado: 'PUBLICADO' }), params)
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.faltantes).toEqual(FALTA_BASTIDOR)
    expect(json.error).toContain('Bastidor')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('con todo en orden → 200 y publica', async () => {
    const res = await PUT(makeReq({ estado: 'PUBLICADO' }), params)
    expect(res.status).toBe(200)
    expect(mockUpdate.mock.calls[0][1].estado).toBe('PUBLICADO')
  })

  it('force NO salta el bloqueo (sí salta la máquina de estados)', async () => {
    mockFaltantes.mockResolvedValue(FALTA_BASTIDOR)
    const res = await PUT(makeReq({ estado: 'PUBLICADO', force: true }), params)
    expect(res.status).toBe(409)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('VENDIDO nunca se bloquea aunque falte de todo', async () => {
    mockFaltantes.mockResolvedValue(FALTA_BASTIDOR)
    const res = await PUT(makeReq({ estado: 'VENDIDO' }), params)
    expect(res.status).toBe(200)
    expect(mockFaltantes).not.toHaveBeenCalled()
  })

  it('RESERVADO y la preparación tampoco se bloquean', async () => {
    mockFaltantes.mockResolvedValue(FALTA_BASTIDOR)
    for (const estado of ['RESERVADO', 'LIMPIEZA', 'PINTURA']) {
      const res = await PUT(makeReq({ estado }), params)
      expect(res.status).toBe(200)
    }
    expect(mockFaltantes).not.toHaveBeenCalled()
  })

  it('un coche YA publicado que se edita no se bloquea', async () => {
    mockGet.mockResolvedValue({ ...VEHICULO, estado: 'PUBLICADO' })
    mockFaltantes.mockResolvedValue(FALTA_BASTIDOR)
    const res = await PUT(makeReq({ estado: 'PUBLICADO', kms: 91000 }), params)
    expect(res.status).toBe(200)
    expect(mockFaltantes).not.toHaveBeenCalled()
  })

  it('rellenar un campo y publicar en el mismo PUT pasa el patch al cálculo', async () => {
    const res = await PUT(
      makeReq({ estado: 'PUBLICADO', color: 'Blanco' }),
      params
    )
    expect(res.status).toBe(200)
    expect(mockFaltantes).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ color: 'Blanco', estado: 'PUBLICADO' })
    )
  })

  it('un PUT que no toca el estado no consulta nada', async () => {
    const res = await PUT(makeReq({ kms: 91000 }), params)
    expect(res.status).toBe(200)
    expect(mockFaltantes).not.toHaveBeenCalled()
  })
})

describe('PUT /api/vehiculos/kanban — bloqueo de publicación', () => {
  const updates = [{ id: 7, estado: 'PUBLICADO', orden: 0 }]

  it('arrastrar a Publicado un coche incompleto → 409 y no escribe nada', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 7, estado: 'FOTOS' }] })
    mockFaltantes.mockResolvedValue(FALTA_BASTIDOR)
    const res = await PUT_KANBAN(makeReq({ updates }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.vehiculoId).toBe(7)
    expect(json.faltantes).toEqual(FALTA_BASTIDOR)
    expect(mockOrden).not.toHaveBeenCalled()
  })

  it('la tanda entera se rechaza: no hay escrituras a medias', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { id: 7, estado: 'FOTOS' },
        { id: 8, estado: 'FOTOS' },
      ],
    })
    mockFaltantes.mockImplementation(async (id: number) =>
      id === 8 ? FALTA_BASTIDOR : []
    )
    const res = await PUT_KANBAN(
      makeReq({
        updates: [
          { id: 7, estado: 'PUBLICADO', orden: 0 },
          { id: 8, estado: 'PUBLICADO', orden: 1 },
        ],
      })
    )
    expect(res.status).toBe(409)
    expect(mockOrden).not.toHaveBeenCalled()
  })

  it('reordenar dentro de Publicado un coche ya publicado no se bloquea', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 7, estado: 'PUBLICADO' }] })
    mockFaltantes.mockResolvedValue(FALTA_BASTIDOR)
    const res = await PUT_KANBAN(makeReq({ updates }))
    expect(res.status).toBe(200)
    expect(mockOrden).toHaveBeenCalledTimes(1)
  })

  it('mover a cualquier otra columna no consulta el bloqueo', async () => {
    const res = await PUT_KANBAN(
      makeReq({ updates: [{ id: 7, estado: 'LIMPIEZA', orden: 0 }] })
    )
    expect(res.status).toBe(200)
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockFaltantes).not.toHaveBeenCalled()
  })

  it('coche completo → 200 y escribe', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 7, estado: 'FOTOS' }] })
    const res = await PUT_KANBAN(makeReq({ updates }))
    expect(res.status).toBe(200)
    expect(mockOrden).toHaveBeenCalledTimes(1)
  })
})
