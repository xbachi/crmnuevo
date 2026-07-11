/**
 * @jest-environment node
 *
 * Bandeja de revisión: POST /api/revision (encolar, dedup) y GET (sesión).
 * pg mockeado (unit, sin DB).
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))

import { POST, GET } from '@/app/api/revision/route'
import { pool } from '@/lib/direct-database'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth-server'

const mockQuery = pool.query as unknown as jest.Mock

const SECRET = 'test-secret'
process.env.N8N_INVOICE_WEBHOOK_SECRET = SECRET

function makePost(body: Record<string, unknown>, secret: string | null = SECRET): NextRequest {
  return {
    url: 'http://localhost/api/revision',
    headers: { get: (k: string) => (k.toLowerCase() === 'x-webhook-secret' ? secret : null) },
    json: async () => body,
  } as unknown as NextRequest
}

function makeGet(qs = 'estado=pendiente', token?: string): NextRequest {
  return {
    url: `http://localhost/api/revision?${qs}`,
    cookies: {
      get: (name: string) =>
        name === SESSION_COOKIE && token ? { value: token } : undefined,
    },
  } as unknown as NextRequest
}

const BODY = {
  origen: 'gasto-rechazado',
  titulo: 'Factura mecauto 6935KYC fuera de rango',
  dedupKey: 'gasto-FC26-179',
  payload: { proveedor: 'mecauto', importe: 9000, tipoAccion: 'gasto' },
}

beforeEach(() => mockQuery.mockReset())

describe('POST /api/revision — encolar con dedup', () => {
  it('sin secret → 401 y no toca la DB', async () => {
    const res = await POST(makePost(BODY, 'wrong'))
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('origen inválido → 400', async () => {
    const res = await POST(makePost({ ...BODY, origen: 'lo-que-sea' }))
    expect(res.status).toBe(400)
  })

  it('item nuevo → inserta y devuelve duplicado:false', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] })
    const res = await POST(makePost(BODY))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, duplicado: false, id: 7 })
    // dedup_key va como 4º parámetro del INSERT
    expect(mockQuery.mock.calls[0][1][3]).toBe('gasto-FC26-179')
  })

  it('mismo dedup_key dos veces → ON CONFLICT DO NOTHING y duplicado:true', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // INSERT sin RETURNING → conflicto
      .mockResolvedValueOnce({ rows: [{ id: 7, estado: 'pendiente' }] })
    const res = await POST(makePost(BODY))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.duplicado).toBe(true)
    expect(json.existente).toMatchObject({ id: 7 })
  })

  it('sin dedupKey explícito deriva uno estable del contenido', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 8 }] })
    await POST(makePost({ origen: 'otro', titulo: 'x', payload: { a: 1 } }))
    const key1 = mockQuery.mock.calls[0][1][3]
    mockQuery.mockReset()
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 8 }] })
    await POST(makePost({ origen: 'otro', titulo: 'x', payload: { a: 1 } }))
    expect(mockQuery.mock.calls[0][1][3]).toBe(key1)
  })
})

describe('GET /api/revision — lista con sesión', () => {
  it('sin sesión → 401', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('con sesión → lista paginada + count de pendientes', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("estado = 'pendiente'")) return { rows: [{ n: 3 }] }
      if (sql.includes('count(*)')) return { rows: [{ n: 3 }] }
      return { rows: [{ id: 1, titulo: 't', origen: 'otro', estado: 'pendiente' }] }
    })
    const res = await GET(makeGet('estado=pendiente&page=1&limit=10', createSessionToken(7, 'asesor')))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.items).toHaveLength(1)
    expect(json.pendientes).toBe(3)
    expect(json.page).toBe(1)
  })
})
