/**
 * @jest-environment node
 *
 * GET/POST /api/vehiculos/[id]/automatizaciones y …/[trabajoId]/cancelar:
 * validación, admin para aplicar, "simular exigido" (409), duplicado (409),
 * encolado con referencia/matrícula leídas del server. Lib de DB mockeada;
 * validadores y requireAdminSession reales.
 */
jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/auth-server', () => ({ readSessionFromRequest: jest.fn() }))
jest.mock('@/lib/automatizaciones', () => ({
  ...jest.requireActual('@/lib/automatizaciones'),
  listarPorVehiculo: jest.fn(),
  estadoWorker: jest.fn(),
  leerVehiculoParaTrabajo: jest.fn(),
  leerSimulacion: jest.fn(),
  encolar: jest.fn(),
  cancelar: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { readSessionFromRequest } from '@/lib/auth-server'
import {
  cancelar,
  encolar,
  estadoWorker,
  leerSimulacion,
  leerVehiculoParaTrabajo,
  listarPorVehiculo,
} from '@/lib/automatizaciones'
import { GET, POST } from '@/app/api/vehiculos/[id]/automatizaciones/route'
import { POST as cancelarPOST } from '@/app/api/vehiculos/[id]/automatizaciones/[trabajoId]/cancelar/route'

const mockSession = readSessionFromRequest as jest.Mock
const mockListar = listarPorVehiculo as jest.Mock
const mockWorker = estadoWorker as jest.Mock
const mockVehiculo = leerVehiculoParaTrabajo as jest.Mock
const mockSimulacion = leerSimulacion as jest.Mock
const mockEncolar = encolar as jest.Mock
const mockCancelar = cancelar as jest.Mock

const ADMIN = { uid: 1, role: 'admin', exp: 0 }
const ASESOR = { uid: 2, role: 'asesor', exp: 0 }
const VEHICULO = { id: 7, referencia: '#1088', matricula: '6913MDM', tipo: 'C' }
const SIM_OK = {
  id: 40,
  vehiculo_id: 7,
  tipo: 'cambio_precio',
  modo: 'simular',
  estado: 'ok',
  terminado_hace_s: 120,
  usada: false,
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const post = (id: string, body: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/vehiculos/${id}/automatizaciones`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    params(id)
  )

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockReturnValue(ADMIN)
  mockVehiculo.mockResolvedValue(VEHICULO)
  mockSimulacion.mockResolvedValue(SIM_OK)
  mockEncolar.mockImplementation(async (t) => ({
    ok: true,
    trabajo: { id: 41, estado: 'pendiente', tipo: t.tipo, modo: t.modo },
  }))
})

describe('GET', () => {
  it('400 id inválido; ok → {trabajos, worker}', async () => {
    expect((await GET(new NextRequest('http://x'), params('abc'))).status).toBe(
      400
    )
    mockListar.mockResolvedValueOnce([{ id: 1 }])
    mockWorker.mockResolvedValueOnce({ activo: true })
    const res = await GET(new NextRequest('http://x'), params('7'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      trabajos: [{ id: 1 }],
      worker: { activo: true },
    })
    expect(mockListar).toHaveBeenCalledWith(7)
  })
})

describe('POST', () => {
  it('400 con tipo o modo inválidos, sin tocar la cola', async () => {
    expect((await post('7', { tipo: 'borrar', modo: 'simular' })).status).toBe(
      400
    )
    expect((await post('7', { tipo: 'carteles', modo: 'ya' })).status).toBe(400)
    expect(
      (await post('x', { tipo: 'carteles', modo: 'aplicar' })).status
    ).toBe(400)
    expect(mockEncolar).not.toHaveBeenCalled()
  })

  it('403 si un no-admin intenta aplicar; simular sí puede', async () => {
    mockSession.mockReturnValue(ASESOR)
    const res = await post('7', { tipo: 'carteles', modo: 'aplicar' })
    expect(res.status).toBe(403)
    expect(mockEncolar).not.toHaveBeenCalled()

    expect(
      (await post('7', { tipo: 'cambio_precio', modo: 'simular' })).status
    ).toBe(200)
    expect(mockEncolar).toHaveBeenCalledWith(
      expect.objectContaining({ modo: 'simular', creadoPor: 2 })
    )
  })

  it('401 sin sesión', async () => {
    mockSession.mockReturnValue(null)
    expect(
      (await post('7', { tipo: 'cambio_precio', modo: 'simular' })).status
    ).toBe(401)
  })

  it('409 al aplicar un tipo con simulación sin simulacion_id', async () => {
    const res = await post('7', { tipo: 'cambio_precio', modo: 'aplicar' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/primero hay que simular/)
    expect(mockEncolar).not.toHaveBeenCalled()
  })

  it('409 si la simulación no sirve (vencida, de otro coche, no ok)', async () => {
    for (const sim of [
      { ...SIM_OK, terminado_hace_s: 31 * 60 },
      { ...SIM_OK, vehiculo_id: 8 },
      { ...SIM_OK, estado: 'error' },
      { ...SIM_OK, usada: true },
      null,
    ]) {
      mockSimulacion.mockResolvedValueOnce(sim)
      const res = await post('7', {
        tipo: 'cambio_precio',
        modo: 'aplicar',
        simulacion_id: 40,
      })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toMatch(/simulación #40/)
    }
    expect(mockEncolar).not.toHaveBeenCalled()
  })

  it('aplica con una simulación válida', async () => {
    const res = await post('7', {
      tipo: 'cambio_precio',
      modo: 'aplicar',
      simulacion_id: 40,
    })
    expect(res.status).toBe(200)
    expect(mockSimulacion).toHaveBeenCalledWith(40)
    expect(mockEncolar).toHaveBeenCalledWith({
      vehiculoId: 7,
      referencia: '#1088',
      matricula: '6913MDM',
      tipo: 'cambio_precio',
      modo: 'aplicar',
      simulacionId: 40,
      creadoPor: 1,
    })
  })

  it('bajar_ficha / carteles aplican sin simulación', async () => {
    const res = await post('7', { tipo: 'bajar_ficha', modo: 'aplicar' })
    expect(res.status).toBe(200)
    expect(mockSimulacion).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({
      trabajo: {
        id: 41,
        estado: 'pendiente',
        tipo: 'bajar_ficha',
        modo: 'aplicar',
      },
    })
  })

  it('409 si ya hay uno activo del mismo tipo (doble click)', async () => {
    mockEncolar.mockResolvedValueOnce({ ok: false, duplicado: true })
    const res = await post('7', { tipo: 'carteles', modo: 'aplicar' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Ya hay un pedido de «Carteles»/)
  })

  it('404 sin vehículo; 409 si el tipo de coche no va a Base_Datos', async () => {
    mockVehiculo.mockResolvedValueOnce(null)
    expect(
      (await post('7', { tipo: 'carteles', modo: 'aplicar' })).status
    ).toBe(404)
    mockVehiculo.mockResolvedValueOnce({ ...VEHICULO, tipo: 'R' })
    expect(
      (await post('7', { tipo: 'carteles', modo: 'aplicar' })).status
    ).toBe(409)
    expect(mockEncolar).not.toHaveBeenCalled()
  })
})

describe('POST …/[trabajoId]/cancelar', () => {
  const cancelarReq = (id: string, trabajoId: string) =>
    cancelarPOST(new NextRequest('http://x', { method: 'POST' }), {
      params: Promise.resolve({ id, trabajoId }),
    })

  it('cancela un pendiente; 409 si ya no lo está; 400 ids inválidos', async () => {
    mockCancelar.mockResolvedValueOnce(true)
    expect((await cancelarReq('7', '41')).status).toBe(200)
    expect(mockCancelar).toHaveBeenCalledWith(41, 7)
    mockCancelar.mockResolvedValueOnce(false)
    expect((await cancelarReq('7', '41')).status).toBe(409)
    expect((await cancelarReq('7', 'x')).status).toBe(400)
  })
})
