/**
 * @jest-environment node
 *
 * POST /api/deals/[id]/contrato/enviar-firma — 501 cuando la firma digital
 * no está configurada (sin SIGNATURIT_API_KEY). pg y deals mockeados.
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
  getDealById: jest.fn(),
}))

import { POST } from '@/app/api/deals/[id]/contrato/enviar-firma/route'
import { pool, getDealById } from '@/lib/direct-database'

const mockQuery = pool.query as unknown as jest.Mock
const mockGetDeal = getDealById as unknown as jest.Mock

function makeReq(body: Record<string, unknown> = {}): NextRequest {
  return {
    url: 'http://localhost/api/deals/9/contrato/enviar-firma',
    json: async () => body,
  } as unknown as NextRequest
}

const params = { params: Promise.resolve({ id: '9' }) }

describe('POST /api/deals/[id]/contrato/enviar-firma', () => {
  const OLD_KEY = process.env.SIGNATURIT_API_KEY

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.SIGNATURIT_API_KEY
    else process.env.SIGNATURIT_API_KEY = OLD_KEY
    jest.restoreAllMocks()
  })

  it('sin SIGNATURIT_API_KEY → 501 con hint y no toca nada', async () => {
    delete process.env.SIGNATURIT_API_KEY
    const res = await POST(makeReq(), params)
    expect(res.status).toBe(501)
    const json = await res.json()
    expect(json.error).toBe('firma digital no configurada')
    expect(json.hint).toContain('SIGNATURIT_API_KEY')
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockGetDeal).not.toHaveBeenCalled()
  })

  it('con API key y pdfBase64 en el body → crea la solicitud y la persiste', async () => {
    process.env.SIGNATURIT_API_KEY = 'test-key'
    mockGetDeal.mockResolvedValue({
      id: 9,
      numero: 'D-0009',
      cliente: { nombre: 'Ana', apellidos: 'Pérez', email: 'ana@test.com' },
    })
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }] })
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'sig-123', url: 'https://sign/x' }), { status: 200 })
      )

    const res = await POST(
      makeReq({ pdfBase64: Buffer.from('%PDF-fake').toString('base64') }),
      params
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({
      ok: true,
      proveedor: 'signaturit',
      solicitudId: 'sig-123',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // se persistió en firma_solicitudes con estado 'enviada'
    const ins = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO firma_solicitudes')
    )
    expect(ins![1]).toEqual([9, 'signaturit', 'sig-123'])
  })
})
