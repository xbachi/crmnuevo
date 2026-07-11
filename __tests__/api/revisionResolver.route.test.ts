/**
 * @jest-environment node
 *
 * POST /api/revision/[id]/resolver — sesión requerida, aprobación de registros
 * incompletos (UPDATE facturas_registro) y descarte. pg mockeado (unit, sin DB).
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))

import { POST } from '@/app/api/revision/[id]/resolver/route'
import { pool } from '@/lib/direct-database'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth-server'

const mockQuery = pool.query as unknown as jest.Mock

function makeReq(
  body: Record<string, unknown>,
  token?: string
): NextRequest {
  return {
    url: 'http://localhost/api/revision/5/resolver',
    cookies: {
      get: (name: string) =>
        name === SESSION_COOKIE && token ? { value: token } : undefined,
    },
    json: async () => body,
  } as unknown as NextRequest
}

const params = { params: Promise.resolve({ id: '5' }) }
const TOKEN = createSessionToken(7, 'asesor')

const ITEM_REGISTRO = {
  id: 5,
  origen: 'registro-incompleto',
  estado: 'pendiente',
  payload: { tipoAccion: 'registro', registroId: 42, proveedor: 'aema', importe: null, fecha: null },
}

beforeEach(() => mockQuery.mockReset())

describe('POST /api/revision/[id]/resolver', () => {
  it('sin sesión → 401 y no toca la DB', async () => {
    const res = await POST(makeReq({ accion: 'aprobar' }), params)
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('accion inválida → 400', async () => {
    const res = await POST(makeReq({ accion: 'romper' }, TOKEN), params)
    expect(res.status).toBe(400)
  })

  it('aprobar tipoAccion=registro → UPDATE facturas_registro con fecha+periodo+importe', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM revision_items')) return { rows: [ITEM_REGISTRO] }
      if (sql.includes('UPDATE facturas_registro')) return { rows: [{ id: 42 }] }
      if (sql.includes('UPDATE revision_items')) return { rows: [] }
      throw new Error(`SQL inesperado: ${sql}`)
    })
    const res = await POST(
      makeReq({ accion: 'aprobar', datos: { fecha: '2026-05-02', importe: '123,45' } }, TOKEN),
      params
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, estado: 'aprobado' })

    const updReg = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE facturas_registro')
    )
    expect(updReg).toBeTruthy()
    // params: fecha, anio, trimestre, mes, importe, registroId
    expect(updReg![1]).toEqual(['2026-05-02', 2026, 2, 5, 123.45, 42])

    const updItem = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE revision_items')
    )
    expect(updItem![1][0]).toBe('aprobado')
    expect(updItem![1][2]).toBe('uid:7') // resuelto_por desde la sesión
  })

  it('aprobar registro sin registroId en payload → 422 y el item sigue pendiente', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM revision_items')) {
        return { rows: [{ ...ITEM_REGISTRO, payload: { tipoAccion: 'registro' } }] }
      }
      return { rows: [] }
    })
    const res = await POST(
      makeReq({ accion: 'aprobar', datos: { importe: '10' } }, TOKEN),
      params
    )
    expect(res.status).toBe(422)
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE revision_items'))
    ).toBe(false)
  })

  it('descartar → no ejecuta acción, solo marca descartado con resolución', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM revision_items')) return { rows: [ITEM_REGISTRO] }
      if (sql.includes('UPDATE revision_items')) return { rows: [] }
      throw new Error(`SQL inesperado: ${sql}`)
    })
    const res = await POST(makeReq({ accion: 'descartar' }, TOKEN), params)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.estado).toBe('descartado')
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE facturas_registro'))
    ).toBe(false)
  })

  it('item ya resuelto → 409', async () => {
    mockQuery.mockImplementation(async () => ({
      rows: [{ ...ITEM_REGISTRO, estado: 'aprobado' }],
    }))
    const res = await POST(makeReq({ accion: 'aprobar' }, TOKEN), params)
    expect(res.status).toBe(409)
  })
})
