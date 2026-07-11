/** @jest-environment node */

import { NextRequest } from 'next/server'

const query = jest.fn()
const release = jest.fn()

jest.mock('@/lib/direct-database', () => ({
  pool: {
    connect: jest.fn(async () => ({ query, release })),
  },
}))

jest.mock('@/lib/costoBeneficio', () => ({
  resyncVehiculoRowToCB: jest.fn(async () => ({
    action: 'updated',
    detail: 'ok',
  })),
}))

import { POST } from '@/app/api/vehiculos/gasto/route'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/vehiculos/gasto', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': 'test-secret',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/vehiculos/gasto', () => {
  beforeEach(() => {
    process.env.N8N_INVOICE_WEBHOOK_SECRET = 'test-secret'
    query.mockReset()
    release.mockReset()
  })

  it('devuelve 409 y no reasigna una factura existente a otro vehículo', async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 20, matricula: '2222-BBB' }] })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 5,
            vehiculo_id: 10,
            matricula: '1111-AAA',
            tipo: 'mecauto',
            importe: '150.00',
            proveedor: 'Mecauto',
            numero_factura: 'F-1',
          },
        ],
      })
      .mockResolvedValueOnce({})

    const response = await POST(
      makeRequest({
        matricula: '2222-BBB',
        tipo: 'mecauto',
        importe: 150,
        numeroFactura: 'F-1',
        proveedor: 'Mecauto',
      })
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'EXPENSE_INVOICE_CONFLICT',
      existente: { vehiculoId: 10 },
      recibido: { vehiculoId: 20 },
    })
    const sql = query.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).not.toContain('DO UPDATE')
    expect(sql).not.toContain('UPDATE "Vehiculo"')
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('trata un reintento idéntico como idempotente', async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 10, matricula: '1111-AAA' }] })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 5,
            vehiculo_id: 10,
            matricula: '1111-AAA',
            tipo: 'mecauto',
            importe: '150.00',
            proveedor: 'Mecauto',
            numero_factura: 'F-1',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: '150.00' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})

    const response = await POST(
      makeRequest({
        matricula: '1111-AAA',
        tipo: 'mecauto',
        importe: 150,
        numeroFactura: ' f-1 ',
        proveedor: ' MECAUTO ',
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      vehiculoId: 10,
      nuevoValor: 150,
    })
    expect(release).toHaveBeenCalledTimes(1)
  })
})
