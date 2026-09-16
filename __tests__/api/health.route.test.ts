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

  it('informa qué integraciones están encendidas, sólo con booleanos', async () => {
    const claves = [
      'SHEETS_VEHICULO_ENABLED',
      'SHEETS_VEHICULO_DISABLED',
      'ONEDRIVE_CARPETAS_ENABLED',
      'SEVEN_WEB_SYNC_URL',
      'SEVEN_WEB_SYNC_SECRET',
      'N8N_RENAME_WEBHOOK_URL',
      'N8N_INVOICE_WEBHOOK_URL',
      'NEXT_PUBLIC_APP_URL',
    ]
    const previo = Object.fromEntries(claves.map((k) => [k, process.env[k]]))
    for (const k of claves) delete process.env[k]
    process.env.SHEETS_VEHICULO_ENABLED = '1'
    process.env.SEVEN_WEB_SYNC_URL = 'https://web.test/estado'
    process.env.SEVEN_WEB_SYNC_SECRET = 'secreto-que-no-debe-salir'
    mockQuery.mockResolvedValue({ rows: [] })

    const json = await (await GET()).json()
    expect(json.integraciones).toEqual({
      hojas: true,
      carpetasOneDrive: false,
      webSync: true,
      n8n: false,
      appUrl: false,
    })
    expect(JSON.stringify(json)).not.toContain('secreto-que-no-debe-salir')

    process.env.SHEETS_VEHICULO_DISABLED = '1'
    expect((await (await GET()).json()).integraciones.hojas).toBe(false)

    for (const k of claves) {
      if (previo[k] === undefined) delete process.env[k]
      else process.env[k] = previo[k]
    }
  })
})
