/**
 * @jest-environment node
 */
jest.mock('@/lib/direct-database', () => {
  const client = { query: jest.fn(), release: jest.fn() }
  return {
    pool: { query: jest.fn(), connect: jest.fn(async () => client) },
    __client: client,
  }
})

import { pool } from '@/lib/direct-database'
import {
  cargarContextoCalculo,
  cargarParametros,
  crearPresupuesto,
  generarToken,
  numeroPresupuesto,
} from '@/lib/presupuesto/repo'
import { PARAMETROS_DEFECTO } from '@/lib/presupuesto/tipos'

const mockQuery = pool.query as unknown as jest.Mock
const mockConnect = pool.connect as unknown as jest.Mock
const mockClient = (
  jest.requireMock('@/lib/direct-database') as {
    __client: { query: jest.Mock; release: jest.Mock }
  }
).__client

const CALCULO = { hoy: '2026-09-14', validoHasta: '2026-09-21' }
const VERSION = {
  params: PARAMETROS_DEFECTO,
  tarifaPremium: { id: 1, nombre: '8,99', coeficientes: {} },
  tarifaSinPremium: { id: 2, nombre: '9,99', coeficientes: {} },
}

beforeEach(() => {
  mockQuery.mockReset()
  mockClient.query.mockReset()
  mockClient.release.mockReset()
  mockConnect.mockClear()
})

describe('generarToken / numeroPresupuesto', () => {
  it('token base64url de 32 caracteres', () => {
    const t = generarToken()
    expect(t).toHaveLength(32)
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(generarToken()).not.toBe(t)
  })

  it('numeración P-AAAA-NNNN', () => {
    expect(numeroPresupuesto(2026, 1)).toBe('P-2026-0001')
    expect(numeroPresupuesto(2026, 123)).toBe('P-2026-0123')
    expect(numeroPresupuesto(2027, 12345)).toBe('P-2027-12345')
  })
})

describe('crearPresupuesto', () => {
  const input = {
    vehiculoId: 1088,
    nombreCliente: 'Marta',
    opciones: { financia: true },
    calculo: CALCULO,
    version: VERSION,
    creadoPor: 'seba',
  } as unknown as Parameters<typeof crearPresupuesto>[0]

  it('transacción: BEGIN, upsert numeración por año, INSERT, COMMIT', async () => {
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('presupuesto_numeracion'))
        return { rows: [{ ultimo: 7 }] }
      if (sql.includes('INSERT INTO presupuestos')) {
        return {
          rows: [
            {
              id: 1,
              numero: 'P-2026-0007',
              valido_hasta: new Date(2026, 8, 21),
              created_at: new Date('2026-09-14T10:00:00Z'),
              updated_at: new Date('2026-09-14T10:00:00Z'),
            },
          ],
        }
      }
      return { rows: [] }
    })

    const row = await crearPresupuesto(input)

    const sqls = mockClient.query.mock.calls.map((c) => String(c[0]))
    expect(sqls[0]).toBe('BEGIN')
    expect(sqls[1]).toMatch(/INSERT INTO presupuesto_numeracion/)
    expect(sqls[1]).toMatch(
      /ON CONFLICT \(anio\) DO UPDATE SET ultimo = presupuesto_numeracion\.ultimo \+ 1/
    )
    expect(sqls[1]).toMatch(/RETURNING ultimo/)
    expect(mockClient.query.mock.calls[1][1]).toEqual([2026])
    expect(sqls[2]).toMatch(/INSERT INTO presupuestos/)
    expect(sqls[3]).toBe('COMMIT')
    expect(sqls.join(' ')).not.toMatch(/next_number/)

    const params = mockClient.query.mock.calls[2][1] as unknown[]
    expect(params[0]).toBe('P-2026-0007')
    expect(params[1]).toBe(1088)
    expect(params[9]).toBe(1)
    expect(params[10]).toBe(2)
    expect(params[12]).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(params[13]).toBe('2026-09-21')
    expect(params[14]).toBe('seba')

    expect(row.numero).toBe('P-2026-0007')
    expect(row.valido_hasta).toBe('2026-09-21')
    expect(row.created_at).toBe('2026-09-14T10:00:00.000Z')
    expect(mockClient.release).toHaveBeenCalledTimes(1)
  })

  it('error → ROLLBACK + release', async () => {
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('presupuesto_numeracion')) throw new Error('boom')
      return { rows: [] }
    })
    await expect(crearPresupuesto(input)).rejects.toThrow('boom')
    const sqls = mockClient.query.mock.calls.map((c) => String(c[0]))
    expect(sqls).toContain('ROLLBACK')
    expect(sqls).not.toContain('COMMIT')
    expect(mockClient.release).toHaveBeenCalledTimes(1)
  })
})

describe('parámetros y contexto', () => {
  it('cargarParametros mezcla defaults con filas (ignora claves desconocidas)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { clave: 'gestion', valor: 450 },
        { clave: 'tarifa_sin_premium_id', valor: 2 },
        { clave: 'desconocida', valor: 1 },
      ],
    })
    const p = await cargarParametros()
    expect(p.gestion).toBe(450)
    expect(p.tarifa_sin_premium_id).toBe(2)
    expect(p.pct_normal).toBe(0.07)
    expect((p as Record<string, unknown>).desconocida).toBeUndefined()
  })

  it('cargarContextoCalculo usa la tarifa sin premium configurada', async () => {
    const activa = {
      id: 1,
      nombre: '8,99',
      activa: true,
      coeficientes: { '120': 0.01476 },
      tin: '8.990',
    }
    const historica = {
      id: 2,
      nombre: '9,99',
      activa: false,
      coeficientes: { '120': 0.0151 },
    }
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('presupuesto_parametros')) {
        return { rows: [{ clave: 'tarifa_sin_premium_id', valor: 2 }] }
      }
      if (sql.includes('WHERE activa')) return { rows: [activa] }
      if (sql.includes('WHERE id = $1'))
        return { rows: params?.[0] === 2 ? [historica] : [] }
      return { rows: [] }
    })
    const ctx = await cargarContextoCalculo('2026-09-14')
    expect(ctx.hoy).toBe('2026-09-14')
    expect(ctx.tarifaPremium).toEqual({
      id: 1,
      nombre: '8,99',
      coeficientes: { '120': 0.01476 },
    })
    expect(ctx.tarifaSinPremium).toEqual({
      id: 2,
      nombre: '9,99',
      coeficientes: { '120': 0.0151 },
    })
  })

  it('sin tarifa activa → error', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    await expect(cargarContextoCalculo('2026-09-14')).rejects.toThrow(
      'Sin tarifa activa'
    )
  })
})
