/**
 * @jest-environment node
 *
 * POST /api/admin/webhook-outbox/retry (C-23): must retry only 'pendiente'
 * rows with intentos < max_intentos, and update estado/intentos/ultimo_error
 * per outcome.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { POST } from '@/app/api/admin/webhook-outbox/retry/route'

const mockQuery = pool.query as jest.Mock

const ADMIN_SECRET = 'test-admin-secret'

function makeRequest(secret?: string) {
  return new NextRequest('http://localhost/api/admin/webhook-outbox/retry', {
    method: 'POST',
    headers: secret ? { 'x-admin-secret': secret } : {},
  })
}

describe('POST /api/admin/webhook-outbox/retry', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.ADMIN_SECRET = ADMIN_SECRET
  })

  afterEach(() => {
    delete process.env.ADMIN_SECRET
  })

  it('rejects requests without a valid X-Admin-Secret', async () => {
    const res = await POST(makeRequest('wrong-secret'))
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('retries only pendiente rows with intentos < max_intentos, and marks outcomes', async () => {
    const payloadA = { numeroFactura: 'F-2026-0001', fechaISO: '2026-01-10' }
    const payloadB = { numeroFactura: 'F-2026-0002', fechaISO: '2026-01-11' }

    // The SELECT itself already filters WHERE estado='pendiente' AND intentos < max_intentos —
    // the mock returns exactly what that query would: two eligible rows.
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, payload: payloadA, numero_factura: 'F-2026-0001' },
        { id: 2, payload: payloadB, numero_factura: 'F-2026-0002' },
      ],
    })
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 200 }) // row 1 succeeds
      .mockResolvedValueOnce({ ok: false, status: 500 }) // row 2 fails again
    mockQuery.mockResolvedValueOnce({ rows: [] }) // markOutboxEnviado(1)
    mockQuery.mockResolvedValueOnce({ rows: [] }) // markOutboxFallo(2)

    process.env.N8N_INVOICE_WEBHOOK_URL = 'https://n8n.example.com/webhook/invoice'
    const res = await POST(makeRequest(ADMIN_SECRET))
    delete process.env.N8N_INVOICE_WEBHOOK_URL

    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ reintentadas: 2, exitosas: 1, fallidas: 1 })

    // The SELECT must scope to pendiente + intentos < max_intentos.
    expect(mockQuery.mock.calls[0][0]).toMatch(/estado = 'pendiente' AND intentos < max_intentos/)

    // Row 1 → enviado
    expect(mockQuery.mock.calls[1][0]).toMatch(/estado = 'enviado'/)
    expect(mockQuery.mock.calls[1][1]).toEqual([1])

    // Row 2 → failure recorded, not thrown
    expect(mockQuery.mock.calls[2][0]).toMatch(/intentos = intentos \+ 1/)
    expect(mockQuery.mock.calls[2][1]).toEqual([2, 'webhook returned 500'])
  })

  it('reports zero retries when there is nothing eligible', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await POST(makeRequest(ADMIN_SECRET))
    const body = await res.json()

    expect(body).toEqual({ ok: true, reintentadas: 0, exitosas: 0, fallidas: 0, detalle: [] })
  })
})
