/**
 * @jest-environment node
 *
 * [id]/renovar y PUT [id] con estado 'enviado'. repo y pg mockeados; el motor
 * puro es real.
 */
jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/auth-server', () => ({ readSessionFromRequest: jest.fn() }))
jest.mock('@/lib/presupuesto/repo', () => ({
  crearPresupuesto: jest.fn(),
  leerPresupuesto: jest.fn(),
  actualizarPresupuesto: jest.fn(),
}))
jest.mock('@/lib/presupuesto/servicio', () => ({
  ...jest.requireActual('@/lib/presupuesto/servicio'),
  construirPresupuesto: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { readSessionFromRequest } from '@/lib/auth-server'
import {
  actualizarPresupuesto,
  crearPresupuesto,
  leerPresupuesto,
} from '@/lib/presupuesto/repo'
import { construirPresupuesto } from '@/lib/presupuesto/servicio'
import { calcularPresupuesto } from '@/lib/presupuesto/calculo'
import { OPCIONES_DEFECTO, PARAMETROS_DEFECTO } from '@/lib/presupuesto/tipos'
import { POST as RENOVAR } from '@/app/api/presupuestos/[id]/renovar/route'
import { PUT } from '@/app/api/presupuestos/[id]/route'

const mockQuery = pool.query as unknown as jest.Mock
const mockSession = readSessionFromRequest as jest.Mock
const mockCrear = crearPresupuesto as jest.Mock
const mockLeer = leerPresupuesto as jest.Mock
const mockActualizar = actualizarPresupuesto as jest.Mock
const mockConstruir = construirPresupuesto as jest.Mock

const T899 = {
  id: 1,
  nombre: '8,99',
  coeficientes: {
    '120': 0.01476,
    '108': 0.0155,
    '96': 0.016501,
    '84': 0.017863,
    '72': 0.019758,
    '60': 0.022494,
    '48': 0.026691,
    '36': 0.033799,
  },
}
const T999 = {
  id: 2,
  nombre: '9,99',
  coeficientes: {
    '120': 0.0151,
    '108': 0.016,
    '96': 0.0171,
    '84': 0.0186,
    '72': 0.021,
    '60': 0.024,
    '48': 0.028,
    '36': 0.035,
    '24': 0.05,
  },
}
const CONTEXTO = {
  hoy: '2026-09-18',
  params: PARAMETROS_DEFECTO,
  tarifaPremium: T899,
  tarifaSinPremium: T999,
}
const OPCIONES = { ...OPCIONES_DEFECTO, entrada: 3000 }
const calc = (precio: number) =>
  calcularPresupuesto({
    vehiculo: {
      precio_contado: precio,
      tarifa_financiacion: 'NORMAL',
      gp: 990,
      fecha_matriculacion: '2023-05-05',
      meses_garantia_fabrica: null,
    },
    opciones: OPCIONES,
    params: PARAMETROS_DEFECTO,
    tarifaPremium: T899,
    tarifaSinPremium: T999,
    hoy: '2026-09-18',
  })
const VEHICULO = {
  id: 1088,
  referencia: '#1088',
  marca: 'Tesla',
  modelo: 'Model 3',
  matricula: '1234ABC',
  kms: 40000,
  color: null,
  fechaMatriculacion: '2023-05-05',
  anio: 2023,
  estado: 'publicado',
  dealActivoId: null,
  venta: null,
}
const FILA = {
  id: 5,
  numero: 'P-2026-0001',
  vehiculo_id: 1088,
  interesado_id: 7,
  cliente_id: null,
  nombre_cliente: 'Marta',
  telefono: '600 12 34 56',
  email: 'marta@example.com',
  opciones: OPCIONES,
  calculo: calc(32985),
  tarifa_id: 1,
  tarifa_sin_premium_id: 2,
  version_parametros: {
    params: PARAMETROS_DEFECTO,
    tarifaPremium: T899,
    tarifaSinPremium: T999,
  },
  pdf_url: null,
  token_publico: 'tok_abcdefghijklmnopqrstuvwxyz',
  estado: 'vencido',
  valido_hasta: '2026-09-10',
  visto_at: null,
  aceptado_at: null,
  enviado_at: '2026-09-03T10:00:00.000Z',
  deal_id: null,
  creado_por: 'Seba',
  created_at: '2026-09-03T10:00:00.000Z',
  updated_at: '2026-09-03T10:00:00.000Z',
}

function req(url: string, body?: unknown, method = 'POST') {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockReturnValue({ uid: 1, role: 'admin', exp: 9999999999 })
  mockQuery.mockResolvedValue({ rows: [{ display_name: 'Seba', email: null }] })
})

describe('POST /api/presupuestos/[id]/renovar', () => {
  it('crea uno nuevo con el precio de hoy, mismo contacto y opciones; el vencido queda como historial', async () => {
    mockLeer.mockResolvedValue(FILA)
    const nuevoCalculo = calc(29985)
    mockConstruir.mockResolvedValue({
      vehiculo: VEHICULO,
      ficha: {},
      contexto: CONTEXTO,
      calculo: nuevoCalculo,
    })
    mockCrear.mockImplementation(async (input) => ({
      ...FILA,
      id: 9,
      numero: 'P-2026-0009',
      estado: 'borrador',
      token_publico: 'tok_nuevo_0123456789abcdef',
      calculo: input.calculo,
    }))

    const res = await RENOVAR(req('/api/presupuestos/5/renovar'), params('5'))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(mockConstruir).toHaveBeenCalledWith(1088, OPCIONES)
    expect(mockCrear).toHaveBeenCalledWith(
      expect.objectContaining({
        vehiculoId: 1088,
        interesadoId: 7,
        nombreCliente: 'Marta',
        telefono: '600 12 34 56',
        email: 'marta@example.com',
        opciones: OPCIONES,
        calculo: nuevoCalculo,
        creadoPor: 'Seba',
      })
    )
    expect(json.presupuesto.numero).toBe('P-2026-0009')
    expect(json.presupuesto.calculo.columnas.premium.total).toBeLessThan(
      FILA.calculo.columnas.premium.total
    )
    expect(json.urlPublica).toMatch(/\/p\/tok_nuevo_0123456789abcdef$/)
    expect(json.anterior).toEqual({ id: 5, estado: 'vencido' })
    expect(mockActualizar).not.toHaveBeenCalled()
  })

  it('si el anterior seguía vivo pasa a anulado', async () => {
    mockLeer.mockResolvedValue({
      ...FILA,
      estado: 'enviado',
      valido_hasta: '2026-09-25',
    })
    mockConstruir.mockResolvedValue({
      vehiculo: VEHICULO,
      ficha: {},
      contexto: CONTEXTO,
      calculo: calc(29985),
    })
    mockCrear.mockResolvedValue({
      ...FILA,
      id: 9,
      numero: 'P-2026-0009',
      estado: 'borrador',
    })
    const res = await RENOVAR(req('/api/presupuestos/5/renovar'), params('5'))
    expect(res.status).toBe(201)
    expect(mockActualizar).toHaveBeenCalledWith(5, { estado: 'anulado' })
    expect((await res.json()).anterior).toEqual({ id: 5, estado: 'anulado' })
  })

  it('409 si está aceptado o el coche ya no tiene precio; 404 si no existe', async () => {
    mockLeer.mockResolvedValue({ ...FILA, estado: 'aceptado' })
    expect(
      (await RENOVAR(req('/api/presupuestos/5/renovar'), params('5'))).status
    ).toBe(409)

    mockLeer.mockResolvedValue(FILA)
    mockConstruir.mockResolvedValue({ error: 'SIN_PRECIO' })
    const r = await RENOVAR(req('/api/presupuestos/5/renovar'), params('5'))
    expect(r.status).toBe(409)
    expect((await r.json()).code).toBe('SIN_PRECIO')
    expect(mockCrear).not.toHaveBeenCalled()

    mockLeer.mockResolvedValue(null)
    expect(
      (await RENOVAR(req('/api/presupuestos/5/renovar'), params('5'))).status
    ).toBe(404)
  })

  it('401 sin sesión', async () => {
    mockSession.mockReturnValue(null)
    expect(
      (await RENOVAR(req('/api/presupuestos/5/renovar'), params('5'))).status
    ).toBe(401)
  })
})

describe("PUT /api/presupuestos/[id] estado 'enviado'", () => {
  it('borrador → enviado con enviado_at', async () => {
    mockLeer.mockResolvedValue({
      ...FILA,
      estado: 'borrador',
      enviado_at: null,
    })
    mockActualizar.mockImplementation(async (_id, patch) => ({
      ...FILA,
      ...patch,
    }))
    const res = await PUT(
      req('/api/presupuestos/5', { estado: 'enviado' }, 'PUT'),
      params('5')
    )
    expect(res.status).toBe(200)
    const patch = mockActualizar.mock.calls[0][1]
    expect(patch.estado).toBe('enviado')
    expect(typeof patch.enviado_at).toBe('string')
  })

  it('409 si no es borrador; 400 con otro estado', async () => {
    mockLeer.mockResolvedValue({ ...FILA, estado: 'visto' })
    expect(
      (
        await PUT(
          req('/api/presupuestos/5', { estado: 'enviado' }, 'PUT'),
          params('5')
        )
      ).status
    ).toBe(409)
    mockLeer.mockResolvedValue({ ...FILA, estado: 'borrador' })
    expect(
      (
        await PUT(
          req('/api/presupuestos/5', { estado: 'visto' }, 'PUT'),
          params('5')
        )
      ).status
    ).toBe(400)
    expect(mockActualizar).not.toHaveBeenCalled()
  })
})
