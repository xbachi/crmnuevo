/** @jest-environment node */

import { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))

import { pool } from '@/lib/direct-database'
import { POST } from '@/app/api/gestoria/factura/route'

const query = pool.query as jest.Mock

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/gestoria/factura', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': 'test-secret',
    },
    body: JSON.stringify(body),
  })
}

const validBody = {
  proveedor: 'Mecauto',
  categoria: 'coche-servicio',
  hashContenido: 'a'.repeat(32),
  numeroFactura: 'F-123',
  fechaFactura: '2026-07-11',
  matricula: '1234 ABC',
}

describe('POST /api/gestoria/factura', () => {
  beforeEach(() => {
    process.env.N8N_INVOICE_WEBHOOK_SECRET = 'test-secret'
    query.mockReset()
  })

  it('rechaza hashes que no sean MD5 válidos antes de consultar la DB', async () => {
    const response = await POST(
      makeRequest({ ...validBody, hashContenido: 'no-es-un-md5' })
    )

    expect(response.status).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rechaza facturas sin fecha para no archivarlas fuera de período', async () => {
    const response = await POST(
      makeRequest({ ...validBody, fechaFactura: undefined })
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVOICE_DATE_REQUIRED',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('rechaza facturas de coche sin matrícula', async () => {
    const response = await POST(
      makeRequest({ ...validBody, matricula: undefined })
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'VEHICLE_PLATE_REQUIRED',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('localiza por identidad normalizada una colisión de número', async () => {
    query.mockRejectedValueOnce({ code: '23505' }).mockResolvedValueOnce({
      rows: [{ id: 7, hash_contenido: 'b'.repeat(32) }],
    })

    const response = await POST(makeRequest(validBody))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      duplicado: true,
      motivo: 'numero',
      existente: { id: 7 },
    })
    expect(query.mock.calls[1][1]).toEqual(['mecauto', 'F123'])
    expect(query.mock.calls[1][0]).toContain('[^A-Za-z0-9]+')
  })
})
