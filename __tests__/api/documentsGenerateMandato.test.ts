/**
 * @jest-environment node
 *
 * POST /api/documents/generate con type 'mandato-gestoria': genera el PDF,
 * lo sube a Blob y persiste la URL en Deal.mandatoGestoria. Blob, DB y
 * generador mockeados.
 */
import type { NextRequest } from 'next/server'

jest.mock('@vercel/blob', () => ({ put: jest.fn(), del: jest.fn() }))
jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
  getDealById: jest.fn(),
  setDealDocumentRef: jest.fn(),
}))
jest.mock('@/lib/contractGenerator', () => ({
  generarContratoReserva: jest.fn(),
  generarContratoVenta: jest.fn(),
  generarFactura: jest.fn(),
  generarMandatoGestoria: jest.fn(),
}))

import { POST } from '@/app/api/documents/generate/route'
import { put } from '@vercel/blob'
import { getDealById, setDealDocumentRef } from '@/lib/direct-database'
import { generarMandatoGestoria } from '@/lib/contractGenerator'

const mockPut = put as unknown as jest.Mock
const mockGetDeal = getDealById as unknown as jest.Mock
const mockSetRef = setDealDocumentRef as unknown as jest.Mock
const mockGenerar = generarMandatoGestoria as unknown as jest.Mock

const PDF = new Uint8Array(Buffer.from('%PDF-1.4 fake %%EOF'))

function makeReq(body: Record<string, unknown>): NextRequest {
  return {
    url: 'http://localhost/api/documents/generate',
    json: async () => body,
  } as unknown as NextRequest
}

const ENV_KEYS = ['GESTORIA_NOMBRE', 'GESTORIA_NIF', 'GESTORIA_DIRECCION']
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  jest.clearAllMocks()
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  jest.restoreAllMocks()
})

describe('POST /api/documents/generate — mandato-gestoria', () => {
  it('con type + dealId: carga el deal, sube a Blob y persiste mandatoGestoria', async () => {
    mockGetDeal.mockResolvedValue({
      id: 42,
      numero: 'RES-2026-000042',
      fechaCreacion: new Date('2026-08-01'),
      fechaVentaFirmada: new Date('2026-09-01'),
      cliente: { id: 1, nombre: 'Ana', apellidos: 'Pérez', dni: '1A' },
      vehiculo: { id: 2, marca: 'Seat', modelo: 'Ibiza', matricula: '1234ABC' },
    })
    mockGenerar.mockResolvedValue(PDF)
    mockPut.mockResolvedValue({
      url: 'https://blob.test/documentos/42/mandato-gestoria-x.pdf',
      pathname: 'documentos/42/mandato-gestoria-x.pdf',
    })
    process.env.GESTORIA_NOMBRE = 'Gestoría Test'
    process.env.GESTORIA_NIF = 'B00000000'

    const res = await POST(makeReq({ type: 'mandato-gestoria', dealId: 42 }))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(mockGetDeal).toHaveBeenCalledWith(42)
    // La gestoría sale del entorno cuando el body no la trae.
    expect(mockGenerar).toHaveBeenCalledWith(
      expect.objectContaining({ numero: 'RES-2026-000042' }),
      {
        gestoria: {
          nombre: 'Gestoría Test',
          nif: 'B00000000',
          direccion: null,
        },
      }
    )
    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(String(mockPut.mock.calls[0][0])).toMatch(
      /^documentos\/42\/mandato-gestoria-RES-2026-000042-\d+\.pdf$/
    )
    expect(mockSetRef).toHaveBeenCalledWith(
      42,
      'mandatoGestoria',
      'https://blob.test/documentos/42/mandato-gestoria-x.pdf'
    )
  })

  it('la gestoría del body pisa la del entorno', async () => {
    mockGenerar.mockResolvedValue(PDF)
    mockPut.mockResolvedValue({ url: 'https://blob.test/m.pdf', pathname: 'm' })
    process.env.GESTORIA_NOMBRE = 'Del entorno'

    const res = await POST(
      makeReq({
        documentType: 'mandato-gestoria',
        dealId: '7',
        dealNumber: 'RES-7',
        dealData: { numero: 'RES-7', fechaCreacion: new Date() },
        gestoria: { nombre: 'Del body', nif: 'B1', direccion: 'Calle 1' },
      })
    )

    expect(res.status).toBe(200)
    expect(mockGetDeal).not.toHaveBeenCalled()
    expect(mockGenerar.mock.calls[0][1]).toEqual({
      gestoria: { nombre: 'Del body', nif: 'B1', direccion: 'Calle 1' },
    })
    expect(mockSetRef).toHaveBeenCalledWith(
      7,
      'mandatoGestoria',
      'https://blob.test/m.pdf'
    )
  })

  it('deal inexistente → 404 sin generar nada', async () => {
    mockGetDeal.mockResolvedValue(null)
    const res = await POST(makeReq({ type: 'mandato-gestoria', dealId: 999 }))
    expect(res.status).toBe(404)
    expect(mockGenerar).not.toHaveBeenCalled()
    expect(mockPut).not.toHaveBeenCalled()
  })

  it('tipo desconocido → 400', async () => {
    const res = await POST(makeReq({ type: 'poder-notarial', dealId: 42 }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Tipo de documento inválido')
    expect(mockGetDeal).not.toHaveBeenCalled()
    expect(mockPut).not.toHaveBeenCalled()
    expect(mockSetRef).not.toHaveBeenCalled()
  })
})
