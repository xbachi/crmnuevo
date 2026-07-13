/**
 * @jest-environment node
 *
 * POST /api/vehiculos/[id]/matricula — cambio de matrícula con historial, y el
 * guardarraíl del PUT genérico (que ya no puede pisar la matrícula).
 */
import type { NextRequest } from 'next/server'

const mockQuery = jest.fn()
const mockConnect = jest.fn()

jest.mock('@/lib/direct-database', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
  },
  getVehiculoById: jest.fn(),
  updateVehiculo: jest.fn(),
  deleteVehiculo: jest.fn(),
}))

import { POST } from '@/app/api/vehiculos/[id]/matricula/route'
import { PUT } from '@/app/api/vehiculos/[id]/route'
import { getVehiculoById } from '@/lib/direct-database'

const makeReq = (body: Record<string, unknown>): NextRequest =>
  ({ url: 'http://localhost/api/vehiculos/398/matricula', json: async () => body }) as unknown as NextRequest

const params = { params: Promise.resolve({ id: '398' }) }

// Cliente de transacción: responde por substring de SQL y registra las queries.
function makeClient(rowsPor: Array<[string, unknown]>) {
  const sqls: string[] = []
  const query = jest.fn(async (sql: string) => {
    sqls.push(sql)
    for (const [match, result] of rowsPor) if (sql.includes(match)) return result
    return { rows: [] }
  })
  return { client: { query, release: jest.fn() }, sqls }
}

beforeEach(() => {
  mockQuery.mockReset()
  mockConnect.mockReset()
})

describe('POST /api/vehiculos/[id]/matricula', () => {
  it('registra el cambio: historial con la anterior y Vehiculo con la nueva', async () => {
    mockQuery.mockResolvedValue({ rows: [{ reg: 'vehiculo_matriculas' }] }) // tablaExiste
    const { client, sqls } = makeClient([
      ['FROM "Vehiculo" WHERE id', { rows: [{ matricula: '5732BDR' }] }],
      ['vehiculo_id <> $2', { rows: [] }],
      ['FROM "Vehiculo" WHERE matricula_norm', { rows: [] }],
      [
        'ORDER BY es_actual DESC, id DESC',
        {
          rows: [
            { matricula: '5439NNW', es_actual: true },
            { matricula: '5732BDR', es_actual: false },
          ],
        },
      ],
    ])
    mockConnect.mockResolvedValue(client)

    const res = await POST(
      makeReq({ matricula: '5439nnw', motivo: 'provisional sustituida por definitiva' }),
      params
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, matricula: '5439NNW', anterior: '5732BDR' })
    expect(json.historial).toEqual([
      { matricula: '5439NNW', es_actual: true },
      { matricula: '5732BDR', es_actual: false },
    ])
    // la vieja queda cerrada, la nueva vigente y el Vehiculo actualizado
    expect(sqls.some((s) => s.includes('SET es_actual = FALSE'))).toBe(true)
    expect(
      client.query.mock.calls.some(
        (c) => String(c[0]).includes('UPDATE "Vehiculo" SET matricula') && (c[1] as string[])[0] === '5439NNW'
      )
    ).toBe(true)
    expect(sqls).toContain('COMMIT')
  })

  it('rechaza una matrícula que ya es de otro vehículo (no une dos coches)', async () => {
    mockQuery.mockResolvedValue({ rows: [{ reg: 'vehiculo_matriculas' }] })
    const { client, sqls } = makeClient([
      ['FROM "Vehiculo" WHERE id', { rows: [{ matricula: '5732BDR' }] }],
      ['vehiculo_id <> $2', { rows: [{ vehiculo_id: 12 }] }],
    ])
    mockConnect.mockResolvedValue(client)

    const res = await POST(makeReq({ matricula: '0608NLF' }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('ya pertenece al vehículo 12')
    expect(sqls).toContain('ROLLBACK')
    expect(sqls).not.toContain('COMMIT')
  })

  it('409 si la tabla de historial todavía no existe', async () => {
    mockQuery.mockResolvedValue({ rows: [{ reg: null }] })
    const res = await POST(makeReq({ matricula: '5439NNW' }), params)
    expect(res.status).toBe(409)
    expect(mockConnect).not.toHaveBeenCalled()
  })
})

describe('PUT /api/vehiculos/[id] ya no cambia la matrícula', () => {
  it('409 con hint al endpoint de historial', async () => {
    ;(getVehiculoById as unknown as jest.Mock).mockResolvedValue({
      id: 398,
      matricula: '5732BDR',
      estado: 'VENDIDO',
    })
    const res = await PUT(makeReq({ matricula: '5439NNW' }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).hint).toContain('/api/vehiculos/398/matricula')
  })
})
