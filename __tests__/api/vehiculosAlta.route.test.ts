/**
 * @jest-environment node
 *
 * Campos obligatorios del alta: POST /api/vehiculos y POST
 * /api/vehiculos-optimized responden 400 con `faltantes` y no crean nada.
 * Todo lo que toca red o DB va mockeado (unit).
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({
  getVehiculos: jest.fn(async () => []),
  getVehiculosCount: jest.fn(async () => 0),
  getVehiculosPage: jest.fn(async () => ({ vehiculos: [], total: 0 })),
  getVehiculoById: jest.fn(),
  saveVehiculo: jest.fn(async (d: Record<string, unknown>) => ({
    id: 1,
    ...d,
  })),
  checkUniqueFields: jest.fn(async () => null),
  updateVehiculo: jest.fn(),
  deleteVehiculo: jest.fn(),
  getInversores: jest.fn(async () => []),
}))
jest.mock('@/lib/sheetsVehiculo', () => ({
  encolarSheetsVehiculo: jest.fn(async () => undefined),
}))
jest.mock('@/lib/onedriveCarpetas', () => ({
  encolarCarpetasOneDrive: jest.fn(async () => undefined),
  nombreCarpetaCanonico: jest.fn(() => 'carpeta'),
}))
jest.mock('@/lib/fichaComercial', () => ({
  guardarFicha: jest.fn(async () => null),
  validarFicha: jest.fn(() => ({ ok: true, patch: {} })),
}))

import { POST } from '@/app/api/vehiculos/route'
import { POST as POST_OPT } from '@/app/api/vehiculos-optimized/route'
import { saveVehiculo } from '@/lib/direct-database'

const mockSave = saveVehiculo as unknown as jest.Mock

function makeReq(body: Record<string, unknown>): NextRequest {
  return {
    url: 'http://localhost/api/vehiculos',
    json: async () => body,
  } as unknown as NextRequest
}

/** Alta completa de un coche de compra. */
const ALTA_OK = {
  referencia: '#1088',
  tipo: 'C',
  marca: 'Kia',
  modelo: 'Ceed',
  matricula: '1234BCD',
  kms: 90000,
  fechaCompra: '2026-01-15',
  proveedor: 'Subasta X',
  precioCompra: 9500,
}

beforeEach(() => {
  mockSave.mockClear()
  jest.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('POST /api/vehiculos — campos obligatorios del alta', () => {
  it('alta completa → 200 y crea el coche', async () => {
    const res = await POST(makeReq(ALTA_OK))
    expect(res.status).toBe(200)
    expect(mockSave).toHaveBeenCalledTimes(1)
  })

  it('sin proveedor ni fecha de compra → 400 con faltantes y sin crear nada', async () => {
    const res = await POST(
      makeReq({ ...ALTA_OK, proveedor: '', fechaCompra: '' })
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.faltantes.map((f: { campo: string }) => f.campo)).toEqual([
      'fechaCompra',
      'proveedor',
    ])
    expect(json.faltantes[0]).toHaveProperty('etiqueta')
    expect(json.error).toContain('Fecha de compra')
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('SIN bastidor sigue creando el coche: lo trae el permiso', async () => {
    const res = await POST(makeReq({ ...ALTA_OK, bastidor: '' }))
    expect(res.status).toBe(200)
    expect(mockSave.mock.calls[0][0].bastidor).toBeUndefined()
  })

  it('tipo I sin inversor → 400', async () => {
    const res = await POST(
      makeReq({ ...ALTA_OK, referencia: '#1088', tipo: 'I' })
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.faltantes.map((f: { campo: string }) => f.campo)).toContain(
      'inversorId'
    )
  })

  it('tipo D sin precio → 400 hablando de «precio acordado con el cliente»', async () => {
    const res = await POST(
      makeReq({
        ...ALTA_OK,
        referencia: '#D-28',
        tipo: 'D',
        precioCompra: '',
      })
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Precio acordado con el cliente')
  })

  it('sigue rechazando la matrícula inválida (no se cambió esa validación)', async () => {
    const res = await POST(makeReq({ ...ALTA_OK, matricula: 'XXX' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no válida/)
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('sin referencia → 400 (la pone el CRM, va aparte de faltantes)', async () => {
    const res = await POST(makeReq({ ...ALTA_OK, referencia: '' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/referencia/i)
  })
})

describe('POST /api/vehiculos-optimized — mismas reglas', () => {
  it('sin precio de compra → 400 con faltantes', async () => {
    const res = await POST_OPT(makeReq({ ...ALTA_OK, precioCompra: null }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.faltantes.map((f: { campo: string }) => f.campo)).toEqual([
      'precioCompra',
    ])
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('alta completa → 200', async () => {
    const res = await POST_OPT(makeReq(ALTA_OK))
    expect(res.status).toBe(200)
    expect(mockSave).toHaveBeenCalledTimes(1)
  })
})
