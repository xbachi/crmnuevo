/**
 * @jest-environment node
 *
 * GET/PUT /api/vehiculos/[id]/ficha-comercial: validación, 404, y encolado
 * del upsert de hojas (motivo 'ficha') sólo cuando se guarda algo.
 */
jest.mock('@/lib/fichaComercial', () => ({
  ...jest.requireActual('@/lib/fichaComercial'),
  leerFicha: jest.fn(),
  guardarFicha: jest.fn(),
}))
jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/sheetsVehiculo', () => ({ encolarSheetsVehiculo: jest.fn() }))

import { NextRequest } from 'next/server'
import { guardarFicha, leerFicha } from '@/lib/fichaComercial'
import { encolarSheetsVehiculo } from '@/lib/sheetsVehiculo'
import { GET, PUT } from '@/app/api/vehiculos/[id]/ficha-comercial/route'

const mockLeer = leerFicha as jest.Mock
const mockGuardar = guardarFicha as jest.Mock
const mockEncolar = encolarSheetsVehiculo as jest.Mock

const FICHA = {
  regimen: 'IVA21',
  nombre_comercial: 'Kia XCeed',
  precio_contado: 12485,
  tarifa_financiacion: 'NORMAL',
  garantia: true,
  gp: 490,
  pct_dto: 0.07,
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const put = (id: string, body: unknown) =>
  PUT(
    new NextRequest(`http://localhost/api/vehiculos/${id}/ficha-comercial`, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    params(id)
  )

beforeEach(() => {
  jest.clearAllMocks()
  mockLeer.mockResolvedValue(FICHA)
  mockGuardar.mockResolvedValue(FICHA)
  mockEncolar.mockResolvedValue({ encolado: true, outboxId: 1 })
})

describe('GET', () => {
  it('id inválido → 400; sin vehículo → 404; ok → ficha', async () => {
    expect((await GET(new NextRequest('http://x'), params('abc'))).status).toBe(
      400
    )
    mockLeer.mockResolvedValueOnce(null)
    expect((await GET(new NextRequest('http://x'), params('9'))).status).toBe(
      404
    )
    const res = await GET(new NextRequest('http://x'), params('7'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(FICHA)
    expect(mockLeer).toHaveBeenCalledWith(7)
  })
})

describe('PUT', () => {
  it('body inválido → 400 con errores, sin guardar ni encolar', async () => {
    const res = await put('7', { pct_dto: 0.5, gp: 9999 })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.errores).toHaveLength(2)
    expect(mockGuardar).not.toHaveBeenCalled()
    expect(mockEncolar).not.toHaveBeenCalled()
  })

  it('válido → guarda el patch y encola motivo ficha', async () => {
    const res = await put('7', {
      regimen: 'REBU',
      precio_contado: '13.985',
      gp: '',
      foo: 'x',
    })
    expect(res.status).toBe(200)
    expect(mockGuardar).toHaveBeenCalledWith(7, {
      regimen: 'REBU',
      precio_contado: 13985,
      gp: null,
    })
    expect(mockEncolar).toHaveBeenCalledWith(7, 'ficha')
    expect(await res.json()).toEqual(FICHA)
  })

  it('vehículo inexistente → 404; patch vacío no encola', async () => {
    mockGuardar.mockResolvedValueOnce(null)
    expect((await put('99', { regimen: 'REBU' })).status).toBe(404)
    expect(mockEncolar).not.toHaveBeenCalled()
    expect((await put('7', {})).status).toBe(200)
    expect(mockEncolar).not.toHaveBeenCalled()
  })

  it('fallo al encolar no rompe la respuesta', async () => {
    mockEncolar.mockRejectedValueOnce(new Error('boom'))
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = await put('7', { regimen: 'REBU' })
    err.mockRestore()
    expect(res.status).toBe(200)
  })
})
