/**
 * @jest-environment node
 *
 * getVehiculosPage / getVehiculos — una sola query trae filas + total
 * (COUNT(*) OVER()), LIMIT/OFFSET solo cuando se piden y total_count no se
 * cuela en el objeto vehículo. pg mockeado (unit, sin DB).
 */

// El pool se construye al importar direct-database, así que el fake vive
// dentro de la factory del mock.
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
import { getVehiculos, getVehiculosPage } from '@/lib/direct-database'

const mockClient = (
  new Pool() as unknown as {
    __client: { query: jest.Mock; release: jest.Mock }
  }
).__client

const row = (id: number, total_count: string) => ({
  id,
  referencia: String(id),
  marca: 'BMW',
  modelo: 'X1',
  tipo: 'C',
  inversor_nombre: null,
  deposito_id: null,
  total_count,
})

beforeEach(() => jest.clearAllMocks())

describe('getVehiculosPage', () => {
  it('limit/offset/search → LIMIT 2 OFFSET 2, $1 = %bmw%, total del total_count', async () => {
    mockClient.query.mockResolvedValue({ rows: [row(3, '7'), row(4, '7')] })

    const res = await getVehiculosPage({ limit: 2, offset: 2, search: 'bmw' })

    expect(mockClient.query).toHaveBeenCalledTimes(1)
    const [sql, values] = mockClient.query.mock.calls[0]
    expect(sql).toMatch(/COUNT\(\*\) OVER\(\) AS total_count/)
    expect(sql).toMatch(/LIMIT 2 OFFSET 2/)
    expect(sql).toMatch(/LOWER\(v\.marca\) LIKE LOWER\(\$1\)/)
    expect(values).toEqual(['%bmw%'])

    expect(res.total).toBe(7) // no vehiculos.length (2)
    expect(res.vehiculos.map((v) => v.id)).toEqual([3, 4])
    expect('total_count' in res.vehiculos[0]).toBe(false)
    expect(mockClient.release).toHaveBeenCalledTimes(1)
  })

  it('tipo se normaliza a letra y usa el siguiente placeholder', async () => {
    mockClient.query.mockResolvedValue({ rows: [] })
    await getVehiculosPage({ search: 'x', tipo: 'Inversor' })
    const [sql, values] = mockClient.query.mock.calls[0]
    expect(sql).toMatch(/v\.tipo = \$2/)
    expect(values).toEqual(['%x%', 'I'])
  })

  it('sin argumentos → sin WHERE/LIMIT/OFFSET y sin params', async () => {
    mockClient.query.mockResolvedValue({ rows: [row(1, '1')] })
    const res = await getVehiculosPage()
    const [sql, values] = mockClient.query.mock.calls[0]
    expect(sql).not.toMatch(/WHERE|LIMIT|OFFSET/)
    expect(values).toBeUndefined()
    expect(res.total).toBe(1)
  })

  it('página fuera de rango → total vía COUNT, tras liberar el cliente', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '7' }] })

    const res = await getVehiculosPage({ limit: 2, offset: 10, search: 'bmw' })

    expect(res).toEqual({ vehiculos: [], total: 7 })
    expect(mockClient.query).toHaveBeenCalledTimes(2)
    expect(mockClient.query.mock.calls[1][0]).toMatch(/SELECT COUNT\(\*\)/)
    expect(mockClient.query.mock.calls[1][1]).toEqual(['%bmw%'])
    // release de la 1ª conexión antes del connect de la 2ª (pool max=1)
    expect(mockClient.release.mock.invocationCallOrder[0]).toBeLessThan(
      mockClient.query.mock.invocationCallOrder[1]
    )
  })

  it('sin filas y sin offset → total 0 sin segunda query', async () => {
    mockClient.query.mockResolvedValue({ rows: [] })
    const res = await getVehiculosPage({ limit: 5, search: 'nada' })
    expect(res).toEqual({ vehiculos: [], total: 0 })
    expect(mockClient.query).toHaveBeenCalledTimes(1)
  })

  it('error de query → { [], 0 } y libera el cliente', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.query.mockRejectedValue(new Error('boom'))
    const res = await getVehiculosPage({ limit: 5 })
    expect(res).toEqual({ vehiculos: [], total: 0 })
    expect(mockClient.release).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })
})

describe('getVehiculos (firma pública intacta)', () => {
  it('devuelve solo el array y reenvía los argumentos posicionales', async () => {
    mockClient.query.mockResolvedValue({ rows: [row(1, '9')] })
    const res = await getVehiculos(5, 10, 'seat', 'C')
    expect(Array.isArray(res)).toBe(true)
    expect(res).toHaveLength(1)
    expect('total_count' in res[0]).toBe(false)
    const [sql, values] = mockClient.query.mock.calls[0]
    expect(sql).toMatch(/LIMIT 5 OFFSET 10/)
    expect(values).toEqual(['%seat%', 'C'])
  })
})
