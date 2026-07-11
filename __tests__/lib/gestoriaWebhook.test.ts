/** @jest-environment node */

import { sendGestoriaInvoice } from '@/lib/gestoriaWebhook'

const payload = {
  numeroFactura: 'R-2026-030',
  fechaISO: '2026-07-11',
  matricula: '1234ABC',
  marca: 'Seat',
  modelo: 'León',
  tipo: 'REBU',
  pdfBase64: 'cGRm',
}

describe('entrega webhook a gestoría', () => {
  beforeEach(() => {
    process.env.N8N_INVOICE_WEBHOOK_URL = 'https://n8n.invalid/webhook'
    process.env.N8N_INVOICE_WEBHOOK_SECRET = 'test-secret'
  })

  afterEach(() => {
    delete process.env.N8N_INVOICE_WEBHOOK_URL
    delete process.env.N8N_INVOICE_WEBHOOK_SECRET
    jest.restoreAllMocks()
  })

  it('rechaza respuestas no exitosas para que la cola pueda reintentar', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 503 }))
    await expect(sendGestoriaInvoice(payload)).rejects.toThrow('503')
  })

  it('rechaza una configuración sin secreto', async () => {
    delete process.env.N8N_INVOICE_WEBHOOK_SECRET
    await expect(sendGestoriaInvoice(payload)).rejects.toThrow(
      'N8N_INVOICE_WEBHOOK_SECRET'
    )
  })
})
