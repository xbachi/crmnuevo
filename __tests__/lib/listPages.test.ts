/**
 * @jest-environment node
 *
 * getClientesPage / getInteresadosPage / getDealsPage / getDepositosPage —
 * una sola query trae filas + total (COUNT(*) OVER()), LIMIT/OFFSET e ILIKE
 * solo cuando se piden, y total_count no se cuela en las filas. pg mockeado
 * (unit, sin DB).
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
  getClientesPage,
  getDeals,
  getDealsPage,
  getDepositosPage,
  getInteresadosPage,
} from '@/lib/direct-database'

const mockClient = (
  new Pool() as unknown as {
    __client: { query: jest.Mock; release: jest.Mock }
  }
).__client

beforeEach(() => jest.clearAllMocks())

describe('getClientesPage', () => {
  it('limit/offset/q → una query con LIMIT 10 OFFSET 10, ILIKE $1 y total del total_count', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        { id: 11, nombre: 'Ana', total_count: '37' },
        { id: 12, nombre: 'Anabel', total_count: '37' },
      ],
    })

    const res = await getClientesPage({ limit: 10, offset: 10, q: 'ana' })

    expect(mockClient.query).toHaveBeenCalledTimes(1)
    const [sql, values] = mockClient.query.mock.calls[0]
    expect(sql).toMatch(/COUNT\(\*\) OVER\(\) AS total_count/)
    expect(sql).toMatch(/FROM "Cliente"/)
    expect(sql).toMatch(/nombre ILIKE \$1/)
    expect(sql).toMatch(/dni ILIKE \$1/)
    expect(sql).toMatch(/LIMIT 10 OFFSET 10/)
    expect(sql).not.toMatch(/SELECT \*/)
    expect(values).toEqual(['%ana%'])

    expect(res.total).toBe(37) // no rows.length (2)
    expect(res.rows.map((c) => c.id)).toEqual([11, 12])
    expect('total_count' in res.rows[0]).toBe(false)
    expect(mockClient.release).toHaveBeenCalledTimes(1)
  })

  it('sin argumentos → sin WHERE/LIMIT/OFFSET ni params', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 1, total_count: '1' }] })
    const res = await getClientesPage()
    const [sql, values] = mockClient.query.mock.calls[0]
    expect(sql).not.toMatch(/WHERE|LIMIT|OFFSET/)
    expect(values).toBeUndefined()
    expect(res.total).toBe(1)
  })

  it('sin filas → total 0 con una sola query, y error → { [], 0 } liberando el cliente', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] })
    expect(await getClientesPage({ limit: 5, offset: 500 })).toEqual({
      rows: [],
      total: 0,
    })
    expect(mockClient.query).toHaveBeenCalledTimes(1)

    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.query.mockRejectedValueOnce(new Error('boom'))
    expect(await getClientesPage({ limit: 5 })).toEqual({ rows: [], total: 0 })
    expect(mockClient.release).toHaveBeenCalledTimes(2)
    err.mockRestore()
  })
})

describe('getInteresadosPage', () => {
  it('pagina en SQL, busca por nombre/apellidos/teléfono/vehículos y devuelve camelCase', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          id: 3,
          nombre: 'Luis',
          apellidos: 'Pérez',
          telefono: '600',
          vehiculosInteres: '["Golf"]',
          presupuestoMaximo: 15000,
          createdAt: 'x',
          total_count: '4',
        },
      ],
    })

    const res = await getInteresadosPage({ limit: 2, offset: 2, q: 'golf' })

    expect(mockClient.query).toHaveBeenCalledTimes(1)
    const [sql, values] = mockClient.query.mock.calls[0]
    expect(sql).toMatch(/FROM interesados/)
    expect(sql).toMatch(/vehiculosinteres AS "vehiculosInteres"/)
    expect(sql).toMatch(/vehiculosinteres ILIKE \$1/)
    expect(sql).toMatch(/telefono ILIKE \$1/)
    expect(sql).toMatch(/LIMIT 2 OFFSET 2/)
    expect(values).toEqual(['%golf%'])

    expect(res.total).toBe(4)
    expect(res.rows[0]).toMatchObject({
      id: 3,
      nombre: 'Luis',
      vehiculosInteres: '["Golf"]',
      presupuestoMaximo: 15000,
    })
    expect('total_count' in res.rows[0]).toBe(false)
  })
})

describe('getDealsPage', () => {
  it('busca por nº de deal, cliente y vehículo, pagina y arma cliente/vehiculo anidados', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          id: 9,
          numero: 'RES-2026-1',
          clienteId: 2,
          vehiculoId: 5,
          estado: 'reservado',
          cliente_nombre: 'Ana',
          vehiculo_marca: 'BMW',
          total_count: '12',
        },
      ],
    })

    const res = await getDealsPage({ limit: 5, offset: 5, q: 'bmw' })

    expect(mockClient.query).toHaveBeenCalledTimes(1)
    const [sql, values] = mockClient.query.mock.calls[0]
    expect(sql).toMatch(/FROM "Deal" d/)
    expect(sql).toMatch(/LEFT JOIN "Cliente" c/)
    expect(sql).toMatch(/d\.numero ILIKE \$1/)
    expect(sql).toMatch(/c\.apellidos ILIKE \$1/)
    expect(sql).toMatch(/v\.matricula ILIKE \$1/)
    expect(sql).toMatch(/ORDER BY d\."createdAt" DESC, d\.id DESC/)
    expect(sql).toMatch(/LIMIT 5 OFFSET 5/)
    expect(values).toEqual(['%bmw%'])

    expect(res.total).toBe(12)
    expect(res.rows[0]).toMatchObject({
      id: 9,
      numero: 'RES-2026-1',
      cliente: { id: 2, nombre: 'Ana' },
      vehiculo: { id: 5, marca: 'BMW' },
    })
    expect('total_count' in res.rows[0]).toBe(false)
  })

  it('getDeals (firma intacta) devuelve solo el array, sin WHERE/LIMIT', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ id: 1, clienteId: 1, vehiculoId: 1, total_count: '1' }],
    })
    const res = await getDeals()
    expect(Array.isArray(res)).toBe(true)
    expect(res).toHaveLength(1)
    const [sql, values] = mockClient.query.mock.calls[0]
    expect(sql).not.toMatch(/WHERE|LIMIT|OFFSET/)
    expect(values).toBeUndefined()
  })
})

describe('getDepositosPage', () => {
  it('tradicionales + virtuales en un UNION ALL, con búsqueda y paginación en una query', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          id: '7',
          tipo_deposito: 'deposito_tradicional',
          cliente_id: 2,
          vehiculo_id: 5,
          estado: 'ACTIVO',
          comision_porcentaje: '5.00',
          dias_gestion: 60,
          created_at: '2026-09-01',
          nombre: 'Ana',
          apellidos: 'López',
          marca: 'Seat',
          bastidor: null,
          kms: null,
          total_count: '9',
        },
        {
          id: 'vehiculo_8',
          tipo_deposito: 'vehiculo_deposito',
          cliente_id: null,
          vehiculo_id: 8,
          estado: 'DISPONIBLE',
          comision_porcentaje: null,
          dias_gestion: null,
          created_at: '2026-08-01',
          nombre: 'Sin cliente asignado',
          apellidos: '',
          marca: 'Seat',
          bastidor: 'VSS',
          kms: 1200,
          total_count: '9',
        },
      ],
    })

    const res = await getDepositosPage({ limit: 2, offset: 4, q: 'seat' })

    expect(mockClient.query).toHaveBeenCalledTimes(1)
    const [sql, values] = mockClient.query.mock.calls[0]
    expect(sql).toMatch(/UNION ALL/)
    expect(sql).toMatch(/FROM depositos d/)
    expect(sql).toMatch(/WHERE v\.tipo = 'D'/)
    expect(sql).toMatch(/t\.marca ILIKE \$1/)
    expect(sql).toMatch(/t\.matricula ILIKE \$1/)
    expect(sql).toMatch(/ORDER BY t\.created_at DESC/)
    expect(sql).toMatch(/LIMIT 2 OFFSET 4/)
    expect(values).toEqual(['%seat%'])

    expect(res.total).toBe(9)
    // Tradicional: id numérico, valores de la tabla
    expect(res.rows[0]).toMatchObject({
      id: 7,
      tipo_deposito: 'deposito_tradicional',
      estado: 'ACTIVO',
      comision_porcentaje: '5.00',
      dias_gestion: 60,
      cliente: { id: 2, nombre: 'Ana', apellidos: 'López', dni: '' },
      vehiculo: { id: 5, bastidor: '', kms: 0, fechaMatriculacion: '' },
    })
    // Virtual: id 'vehiculo_<id>' y valores por defecto de siempre
    expect(res.rows[1]).toMatchObject({
      id: 'vehiculo_8',
      tipo_deposito: 'vehiculo_deposito',
      estado: 'DISPONIBLE',
      comision_porcentaje: 5.0,
      dias_gestion: 90,
      notas: 'Vehículo de depósito disponible para venta',
      cliente: { id: null, nombre: 'Sin cliente asignado' },
      vehiculo: { id: 8, bastidor: 'VSS', kms: 1200 },
    })
    expect('total_count' in res.rows[0]).toBe(false)
  })
})
