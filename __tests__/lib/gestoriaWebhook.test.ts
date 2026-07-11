/**
 * @jest-environment node
 *
 * C-23: notifyGestoriaInvoice() must leave a trace in webhook_outbox for
 * every send attempt — 'pendiente' on insert, 'enviado' on success,
 * a recorded failure otherwise. Before this, a failed/timed-out webhook
 * left nothing but a console.error nobody sees.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))

import { pool } from '@/lib/direct-database'
import { notifyGestoriaInvoice } from '@/lib/gestoriaWebhook'

const mockQuery = pool.query as jest.Mock

const payload = {
  numeroFactura: 'F-2026-0001',
  fechaISO: '2026-01-15',
  matricula: '1234ABC',
  marca: 'Seat',
  modelo: 'Ibiza',
  tipo: 'VAT',
  pdfBase64: 'AA==',
}

describe('notifyGestoriaInvoice — webhook_outbox bookkeeping', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.N8N_INVOICE_WEBHOOK_URL = 'https://n8n.example.com/webhook/invoice'
    process.env.N8N_INVOICE_WEBHOOK_SECRET = 'secret'
  })

  afterEach(() => {
    delete process.env.N8N_INVOICE_WEBHOOK_URL
    delete process.env.N8N_INVOICE_WEBHOOK_SECRET
  })

  it('inserts a pendiente row and marks it enviado when the webhook responds ok', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 42 }] }) // insertOutboxPending
    mockQuery.mockResolvedValueOnce({ rows: [] }) // markOutboxEnviado
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 })

    await notifyGestoriaInvoice(payload)

    expect(mockQuery).toHaveBeenCalledTimes(2)
    expect(mockQuery.mock.calls[0][0]).toMatch(/INSERT INTO webhook_outbox/)
    expect(mockQuery.mock.calls[0][1]).toEqual([
      'factura_venta',
      JSON.stringify(payload),
      'F-2026-0001',
    ])
    expect(mockQuery.mock.calls[1][0]).toMatch(/estado = 'enviado'/)
    expect(mockQuery.mock.calls[1][1]).toEqual([42])
  })

  it('records the failure (without throwing) when the webhook returns a non-ok status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 43 }] })
    mockQuery.mockResolvedValueOnce({ rows: [] })
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(notifyGestoriaInvoice(payload)).resolves.toBeUndefined()

    expect(mockQuery.mock.calls[1][0]).toMatch(/intentos = intentos \+ 1/)
    expect(mockQuery.mock.calls[1][1]).toEqual([43, 'webhook returned 500'])
  })

  it('records the failure when fetch itself rejects (e.g. timeout)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 44 }] })
    mockQuery.mockResolvedValueOnce({ rows: [] })
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('The operation was aborted'))

    await notifyGestoriaInvoice(payload)

    expect(mockQuery.mock.calls[1][1]).toEqual([44, 'The operation was aborted'])
  })

  it('is a no-op (no outbox row, no fetch) when the webhook URL is not configured', async () => {
    delete process.env.N8N_INVOICE_WEBHOOK_URL

    await notifyGestoriaInvoice(payload)

    expect(mockQuery).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
