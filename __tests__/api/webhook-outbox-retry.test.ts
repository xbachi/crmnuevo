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
jest.mock('@/lib/sheetsVehiculo', () => ({
  reenviarSheetsVehiculo: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { reenviarSheetsVehiculo } from '@/lib/sheetsVehiculo'
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
        {
          id: 1,
          tipo: 'factura_venta',
          payload: payloadA,
          numero_factura: 'F-2026-0001',
        },
        {
          id: 2,
          tipo: 'factura_venta',
          payload: payloadB,
          numero_factura: 'F-2026-0002',
        },
      ],
    })
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 200 }) // row 1 succeeds
      .mockResolvedValueOnce({ ok: false, status: 500 }) // row 2 fails again
    mockQuery.mockResolvedValueOnce({ rows: [] }) // markOutboxEnviado(1)
    mockQuery.mockResolvedValueOnce({ rows: [] }) // markOutboxFallo(2)

    process.env.N8N_INVOICE_WEBHOOK_URL =
      'https://n8n.example.com/webhook/invoice'
    const res = await POST(makeRequest(ADMIN_SECRET))
    delete process.env.N8N_INVOICE_WEBHOOK_URL

    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ reintentadas: 2, exitosas: 1, fallidas: 1 })

    // The SELECT must scope to pendiente + intentos < max_intentos, and read
    // `tipo` — without it every row would be sent to the gestoria webhook.
    expect(mockQuery.mock.calls[0][0]).toMatch(/intentos < max_intentos/)
    expect(mockQuery.mock.calls[0][0]).toMatch(
      /tipo <> 'sheets_vehiculo' AND estado = 'pendiente'/
    )
    // sheets_vehiculo: las recién encoladas están en curso; los 'procesando' viejos se recuperan
    expect(mockQuery.mock.calls[0][0]).toMatch(
      /estado = 'procesando' AND updated_at < NOW\(\) - INTERVAL '10 minutes'/
    )
    expect(mockQuery.mock.calls[0][0]).toMatch(
      /SELECT id, tipo, payload, numero_factura/
    )

    // Row 1 → enviado
    expect(mockQuery.mock.calls[1][0]).toMatch(/estado = 'enviado'/)
    expect(mockQuery.mock.calls[1][1]).toEqual([1])

    // Row 2 → failure recorded, not thrown
    expect(mockQuery.mock.calls[2][0]).toMatch(/intentos = intentos \+ 1/)
    expect(mockQuery.mock.calls[2][1]).toEqual([2, 'webhook returned 500'])
  })

  it('routes each row by tipo: web_estado never reaches the gestoria webhook', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 10,
          tipo: 'web_estado',
          payload: {
            matricula: '3429LHT',
            matriculas: ['3429LHT'],
            estado: 'reservado',
            ts: 1757800000,
          },
          numero_factura: '3429LHT',
        },
        { id: 11, tipo: 'lo_que_sea', payload: {}, numero_factura: null },
      ],
    })
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    })
    mockQuery.mockResolvedValue({ rows: [] })

    process.env.SEVEN_WEB_SYNC_URL =
      'https://www.sevencars.es/wp-json/sevencars/v1/vehiculo/estado'
    process.env.SEVEN_WEB_SYNC_SECRET = 'web-secret'
    process.env.N8N_INVOICE_WEBHOOK_URL =
      'https://n8n.example.com/webhook/invoice'
    const res = await POST(makeRequest(ADMIN_SECRET))
    delete process.env.SEVEN_WEB_SYNC_URL
    delete process.env.SEVEN_WEB_SYNC_SECRET
    delete process.env.N8N_INVOICE_WEBHOOK_URL

    const body = await res.json()
    expect(body).toMatchObject({ reintentadas: 2, exitosas: 1, fallidas: 1 })

    // Only ONE request went out, and to the web — not to n8n.
    expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1)
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain(
      'sevencars.es'
    )

    // Unknown tipo: recorded as a failure with a clear reason, sent nowhere.
    expect(body.detalle[1]).toMatchObject({
      id: 11,
      tipo: 'lo_que_sea',
      ok: false,
    })
    expect(body.detalle[1].error).toMatch(/tipo desconocido/)

    // detalle says which type each row was.
    expect(body.detalle[0]).toMatchObject({
      id: 10,
      tipo: 'web_estado',
      referencia: '3429LHT',
      ok: true,
    })
  })

  it('reports zero retries when there is nothing eligible', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await POST(makeRequest(ADMIN_SECRET))
    const body = await res.json()

    expect(body).toEqual({
      ok: true,
      reintentadas: 0,
      exitosas: 0,
      fallidas: 0,
      omitidas: 0,
      detalle: [],
    })
  })

  it('sheets_vehiculo: reserva la fila por id; si no puede (en curso) la omite sin marcarla', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 20,
          tipo: 'sheets_vehiculo',
          payload: { vehiculoId: 7, motivo: 'update' },
          numero_factura: '#1002',
        },
        {
          id: 21,
          tipo: 'sheets_vehiculo',
          payload: { vehiculoId: 8, motivo: 'estado' },
          numero_factura: '#1003',
        },
      ],
    })
    mockQuery.mockResolvedValue({ rows: [] })
    ;(reenviarSheetsVehiculo as jest.Mock)
      .mockResolvedValueOnce({ ok: false, error: 'en curso', skip: true })
      .mockResolvedValueOnce({ ok: true })

    const res = await POST(makeRequest(ADMIN_SECRET))
    const body = await res.json()
    expect(body).toMatchObject({
      ok: true,
      reintentadas: 2,
      exitosas: 1,
      fallidas: 0,
      omitidas: 1,
    })
    expect(reenviarSheetsVehiculo).toHaveBeenNthCalledWith(
      1,
      { vehiculoId: 7, motivo: 'update' },
      20
    )
    expect(reenviarSheetsVehiculo).toHaveBeenNthCalledWith(
      2,
      { vehiculoId: 8, motivo: 'estado' },
      21
    )
    // Sólo la fila 21 se marca (enviado); la 20 queda como estaba.
    const marks = mockQuery.mock.calls.slice(1)
    expect(marks).toHaveLength(1)
    expect(marks[0][0]).toMatch(/estado = 'enviado'/)
    expect(marks[0][1]).toEqual([21])
    expect(body.detalle).toHaveLength(1)
  })
})
