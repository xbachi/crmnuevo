/**
 * @jest-environment node
 *
 * POST /api/gestoria/expedientes-snapshot — reemplazo total del trimestre en
 * una transacción (DELETE + INSERTs) con matrícula extraída del nombre de
 * carpeta. pool mockeado (query directo + client transaccional).
 */

const mockClientQuery = jest.fn()
const mockRelease = jest.fn()
const mockConnect = jest.fn(async () => ({ query: mockClientQuery, release: mockRelease }))

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn(), connect: (...args: unknown[]) => mockConnect(...args) },
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { POST } from '@/app/api/gestoria/expedientes-snapshot/route'

const mockQuery = pool.query as jest.Mock
const SECRET = 'test-webhook-secret'

function makeRequest(body: unknown, secret: string | undefined = SECRET) {
  return new NextRequest('http://localhost/api/gestoria/expedientes-snapshot', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-webhook-secret': secret } : {}),
    },
  })
}

const bodyOk = {
  anio: 2026,
  trimestre: 2,
  carpetas: [
    {
      mes: 'abril',
      carpeta: '68-Kia-Xceed-0608NLF',
      archivos: [{ nombre: 'Factura-Venta-F-2026-020.pdf', bytes: 1234 }],
    },
    {
      mes: 'junio',
      carpeta: 'Yamaha Raptor quad-E9961BDJ',
      archivos: [{ nombre: 'factura-iva-F-2026-4221.pdf', bytes: 999 }],
    },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.N8N_INVOICE_WEBHOOK_SECRET = SECRET
})

afterEach(() => {
  delete process.env.N8N_INVOICE_WEBHOOK_SECRET
})

describe('POST /api/gestoria/expedientes-snapshot', () => {
  it('rechaza sin X-Webhook-Secret válido', async () => {
    const res = await POST(makeRequest(bodyOk, 'wrong'))
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('valida anio/trimestre/carpetas', async () => {
    expect((await POST(makeRequest({ ...bodyOk, trimestre: 5 }))).status).toBe(400)
    expect((await POST(makeRequest({ ...bodyOk, anio: 'x' }))).status).toBe(400)
    expect((await POST(makeRequest({ anio: 2026, trimestre: 2 }))).status).toBe(400)
    expect(
      (await POST(makeRequest({ anio: 2026, trimestre: 2, carpetas: [{ mes: '', carpeta: 'x' }] })))
        .status
    ).toBe(400)
  })

  it('devuelve 503 si la tabla no existe todavía', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ reg: null }] })
    const res = await POST(makeRequest(bodyOk))
    expect(res.status).toBe(503)
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('reemplaza el trimestre completo en una transacción y extrae matrículas', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ reg: 'expedientes_carpetas' }] })
    mockClientQuery.mockImplementation(async (sql: string) =>
      sql.startsWith('DELETE') ? { rowCount: 3 } : { rows: [], rowCount: 1 }
    )

    const res = await POST(makeRequest(bodyOk))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      anio: 2026,
      trimestre: 2,
      carpetas: 2,
      archivos: 2,
      reemplazadas: 3,
    })

    const calls = mockClientQuery.mock.calls
    expect(calls[0][0]).toBe('BEGIN')
    expect(calls[1][0]).toContain('DELETE FROM expedientes_carpetas')
    expect(calls[1][1]).toEqual([2026, 2])
    // INSERTs con matrícula extraída del nombre de carpeta
    expect(calls[2][0]).toContain('INSERT INTO expedientes_carpetas')
    expect(calls[2][1]).toEqual([
      2026,
      2,
      'abril',
      '68-Kia-Xceed-0608NLF',
      '0608NLF',
      JSON.stringify([{ nombre: 'Factura-Venta-F-2026-020.pdf', bytes: 1234 }]),
    ])
    expect(calls[3][1][3]).toBe('Yamaha Raptor quad-E9961BDJ')
    expect(calls[3][1][4]).toBe('E9961BDJ')
    expect(calls[4][0]).toBe('COMMIT')
    expect(mockRelease).toHaveBeenCalled()
  })

  it('hace ROLLBACK si un INSERT falla', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ reg: 'expedientes_carpetas' }] })
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT')) throw new Error('boom')
      return { rows: [], rowCount: 0 }
    })

    const res = await POST(makeRequest(bodyOk))
    expect(res.status).toBe(500)
    const sqls = mockClientQuery.mock.calls.map((c) => c[0])
    expect(sqls).toContain('ROLLBACK')
    expect(sqls).not.toContain('COMMIT')
    expect(mockRelease).toHaveBeenCalled()
  })
})
