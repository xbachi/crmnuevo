/**
 * @jest-environment node
 *
 * updateVehiculosOrden (kanban): reordenar dentro de una columna NO cambia el
 * estado y por tanto no registra paso ni encola la hoja; sólo lo hace cuando el
 * estado realmente cambia. pg mockeado (unit, sin DB).
 */
jest.mock('pg', () => {
  const client = { query: jest.fn(), release: jest.fn() }
  const pool = {
    connect: jest.fn(async () => client),
    query: jest.fn(),
    on: jest.fn(),
    end: jest.fn(),
    __client: client,
  }
  return { Pool: jest.fn(() => pool) }
})
jest.mock('@/lib/vehiculoPasos', () => ({ registrarPasoEstado: jest.fn() }))
jest.mock('@/lib/sheetsVehiculo', () => ({ encolarSheetsVehiculo: jest.fn() }))

import { Pool } from 'pg'
import { registrarPasoEstado } from '@/lib/vehiculoPasos'
import { encolarSheetsVehiculo } from '@/lib/sheetsVehiculo'
import { updateVehiculosOrden } from '@/lib/direct-database'

const mockClient = (
  new Pool() as unknown as {
    __client: { query: jest.Mock; release: jest.Mock }
  }
).__client

beforeEach(() => {
  jest.clearAllMocks()
})

it('mismo estado (reordenar la columna): ni paso ni encolado', async () => {
  mockClient.query.mockResolvedValue({
    rows: [{ id: 7, estado: 'MECAUTO', orden: 2, estado_previo: 'mecauto' }],
  })
  const r = await updateVehiculosOrden([{ id: 7, estado: 'MECAUTO', orden: 2 }])
  expect(r).toEqual([{ id: 7, estado: 'MECAUTO', orden: 2 }])
  expect(mockClient.query.mock.calls[0][0]).toMatch(/estado_previo/)
  expect(mockClient.query.mock.calls[0][1]).toEqual([7, 'MECAUTO', 2])
  expect(registrarPasoEstado).not.toHaveBeenCalled()
  expect(encolarSheetsVehiculo).not.toHaveBeenCalled()
  expect(mockClient.release).toHaveBeenCalled()
})

it('estado distinto: registra el paso y encola la hoja', async () => {
  mockClient.query.mockResolvedValue({
    rows: [{ id: 7, estado: 'PINTURA', orden: 0, estado_previo: 'MECAUTO' }],
  })
  await updateVehiculosOrden([{ id: 7, estado: 'PINTURA', orden: 0 }])
  expect(registrarPasoEstado).toHaveBeenCalledWith(7, 'PINTURA')
  expect(encolarSheetsVehiculo).toHaveBeenCalledWith(7, 'kanban')
})
