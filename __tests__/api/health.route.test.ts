/**
 * @jest-environment node
 *
 * GET /api/health — ok y error de DB. pg mockeado.
 */
jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))

import { GET } from '@/app/api/health/route'
import { pool } from '@/lib/direct-database'

const mockQuery = pool.query as unknown as jest.Mock

describe('GET /api/health', () => {
  beforeEach(() => mockQuery.mockReset())

  it('200 con db ok, versión y timestamp', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'abcdef1234567890'
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] })
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, db: 'ok', commit: 'abcdef1' })
    expect(typeof json.version).toBe('string')
    expect(new Date(json.ts).toString()).not.toBe('Invalid Date')
    expect(mockQuery).toHaveBeenCalledWith('SELECT 1')
    delete process.env.VERCEL_GIT_COMMIT_SHA
  })

  it('503 si la DB falla, sin filtrar el error', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused to db.internal'))
    const res = await GET()
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json).toMatchObject({ ok: false, db: 'error', commit: null })
    expect(JSON.stringify(json)).not.toContain('db.internal')
  })
})
