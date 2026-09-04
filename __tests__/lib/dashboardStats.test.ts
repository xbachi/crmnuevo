/**
 * @jest-environment node
 *
 * getVehiculoStats / getDepositoStats / getStockStats — una sola query con
 * COUNT(*) FILTER sobre "Vehiculo" (antes 5 + 5 COUNT secuenciales) mapeada
 * a las mismas claves de siempre. pg mockeado (unit, sin DB).
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

import { Pool } from 'pg'
import {
  getDepositoStats,
  getStockStats,
  getVehiculoStats,
} from '@/lib/direct-database'

const mockClient = (
  new Pool() as unknown as {
    __client: { query: jest.Mock; release: jest.Mock }
  }
).__client

// pg devuelve los COUNT como string
const ROW = {
  total_activos: '42',
  publicados: '17',
  en_proceso: '20',
  reservados: '5',
  vendidos: '88',
  dep_total: '9',
  dep_en_proceso: '3',
  dep_publicados: '4',
  dep_reservados: '2',
  dep_vendidos: '11',
}

beforeEach(() => jest.clearAllMocks())

describe('getVehiculoStats', () => {
  it('hace UNA query y mapea a las claves de siempre', async () => {
    mockClient.query.mockResolvedValue({ rows: [ROW] })

    const stats = await getVehiculoStats()

    expect(mockClient.query).toHaveBeenCalledTimes(1)
    expect(stats).toEqual({
      totalActivos: 42,
      publicados: 17,
      enProceso: 20,
      reservados: 5,
      vendidos: 88,
    })
    expect(mockClient.release).toHaveBeenCalledTimes(1)
  })

  it('mantiene los criterios de estado originales en el SQL', async () => {
    mockClient.query.mockResolvedValue({ rows: [ROW] })
    await getVehiculoStats()

    const [sql] = mockClient.query.mock.calls[0]
    expect(sql).toMatch(/FROM "Vehiculo"/)
    expect(sql).toMatch(/COUNT\(\*\) FILTER \(WHERE/)
    expect(sql).toMatch(/UPPER\(TRIM\(estado\)\) = 'PUBLICADO'/)
    expect(sql).toMatch(/UPPER\(TRIM\(estado\)\) = 'RESERVADO'/)
    expect(sql).toMatch(/UPPER\(TRIM\(estado\)\) = 'VENDIDO'/)
    // sin estado (NULL / vacío) cuenta como en proceso
    expect(sql).toMatch(/estado IS NULL OR estado = ''/)
    expect(sql).toMatch(
      /IN \('SIN_ESTADO', 'INICIAL', 'REVI_INIC', 'MECAUTO', 'REVI_PINTURA', 'PINTURA', 'LIMPIEZA', 'FOTOS'\)/
    )
    // total activos excluye vendidos
    expect(sql).toMatch(/UPPER\(TRIM\(estado\)\) NOT IN \('VENDIDO'\)/)
  })
})

describe('getDepositoStats', () => {
  it('hace UNA query y mapea a las claves de siempre', async () => {
    mockClient.query.mockResolvedValue({ rows: [ROW] })

    const stats = await getDepositoStats()

    expect(mockClient.query).toHaveBeenCalledTimes(1)
    expect(stats).toEqual({
      totalDepositos: 9,
      enProceso: 3,
      publicados: 4,
      reservados: 2,
      vendidos: 11,
    })
    expect(mockClient.release).toHaveBeenCalledTimes(1)
  })

  it('filtra depósitos por referencia D- (case-insensitive)', async () => {
    mockClient.query.mockResolvedValue({ rows: [ROW] })
    await getDepositoStats()
    const [sql] = mockClient.query.mock.calls[0]
    expect(sql).toMatch(/UPPER\(TRIM\(referencia\)\) LIKE 'D-%'/)
    expect(sql).toMatch(
      /LIKE 'D-%' AND UPPER\(TRIM\(estado\)\) != 'VENDIDO'\) AS dep_total/
    )
  })
})

describe('getStockStats', () => {
  it('devuelve vehículos y depósitos de la misma query', async () => {
    mockClient.query.mockResolvedValue({ rows: [ROW] })

    const res = await getStockStats()

    expect(mockClient.query).toHaveBeenCalledTimes(1)
    expect(res.vehiculos.totalActivos).toBe(42)
    expect(res.depositos.totalDepositos).toBe(9)
  })

  it('tabla vacía → todo a 0', async () => {
    mockClient.query.mockResolvedValue({ rows: [] })
    const res = await getStockStats()
    expect(res.vehiculos).toEqual({
      totalActivos: 0,
      publicados: 0,
      enProceso: 0,
      reservados: 0,
      vendidos: 0,
    })
    expect(res.depositos).toEqual({
      totalDepositos: 0,
      enProceso: 0,
      publicados: 0,
      reservados: 0,
      vendidos: 0,
    })
  })

  it('error de query → relanza y libera el cliente', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.query.mockRejectedValue(new Error('boom'))
    await expect(getVehiculoStats()).rejects.toThrow('boom')
    expect(mockClient.release).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })
})
