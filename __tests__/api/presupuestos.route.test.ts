/**
 * @jest-environment node
 *
 * /api/presupuestos (POST, GET), [id]/aceptar y [id]/enviar. repo, pg, deals y
 * mailer mockeados; el motor puro es real (fixture Tesla del SPEC).
 */
jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
  createDeal: jest.fn(),
  updateDeal: jest.fn(),
}))
jest.mock('@/lib/auth-server', () => ({ readSessionFromRequest: jest.fn() }))
jest.mock('@/lib/mailer', () => ({ sendMail: jest.fn() }))
jest.mock('@/lib/presupuesto/pdf', () => ({
  generarPresupuestoPdf: jest.fn(),
}))
jest.mock('@/lib/presupuesto/repo', () => ({
  crearPresupuesto: jest.fn(),
  listarPresupuestos: jest.fn(),
  leerPresupuesto: jest.fn(),
  actualizarPresupuesto: jest.fn(),
  cargarContextoCalculo: jest.fn(),
}))
jest.mock('@/lib/presupuesto/servicio', () => ({
  ...jest.requireActual('@/lib/presupuesto/servicio'),
  construirPresupuesto: jest.fn(),
  cargarVehiculoPresupuesto: jest.fn(),
  obtenerPdf: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { pool, createDeal, updateDeal } from '@/lib/direct-database'
import { readSessionFromRequest } from '@/lib/auth-server'
import { sendMail } from '@/lib/mailer'
import {
  actualizarPresupuesto,
  crearPresupuesto,
  leerPresupuesto,
  listarPresupuestos,
} from '@/lib/presupuesto/repo'
import {
  cargarVehiculoPresupuesto,
  construirPresupuesto,
  obtenerPdf,
} from '@/lib/presupuesto/servicio'
import { calcularPresupuesto } from '@/lib/presupuesto/calculo'
import { OPCIONES_DEFECTO, PARAMETROS_DEFECTO } from '@/lib/presupuesto/tipos'
import { GET, POST } from '@/app/api/presupuestos/route'
import { POST as ACEPTAR } from '@/app/api/presupuestos/[id]/aceptar/route'
import { POST as ENVIAR } from '@/app/api/presupuestos/[id]/enviar/route'

const mockQuery = pool.query as unknown as jest.Mock
const mockSession = readSessionFromRequest as jest.Mock
const mockCrear = crearPresupuesto as jest.Mock
const mockListar = listarPresupuestos as jest.Mock
const mockLeer = leerPresupuesto as jest.Mock
const mockActualizar = actualizarPresupuesto as jest.Mock
const mockConstruir = construirPresupuesto as jest.Mock
const mockVehiculo = cargarVehiculoPresupuesto as jest.Mock
const mockObtenerPdf = obtenerPdf as jest.Mock
const mockCreateDeal = createDeal as jest.Mock
const mockUpdateDeal = updateDeal as jest.Mock
const mockSendMail = sendMail as jest.Mock

const T899 = {
  id: 1,
  nombre: '8,99 ATENEA sept-2026',
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
  nombre: '9,99 DIC-2022',
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
  hoy: '2026-09-14',
  params: PARAMETROS_DEFECTO,
  tarifaPremium: T899,
  tarifaSinPremium: T999,
}
const VEHICULO = {
  id: 1088,
  referencia: '#1088',
  marca: 'Tesla',
  modelo: 'Model 3',
  matricula: '1234ABC',
  kms: 40000,
  color: 'Blanco',
  fechaMatriculacion: '2023-05-05',
  anio: 2023,
  estado: 'publicado',
  dealActivoId: null,
  venta: null,
}
const FICHA = {
  regimen: 'REBU',
  nombre_comercial: 'Tesla Model 3 RWD',
  precio_contado: 32985,
  url_imagen: null,
  url_qr: null,
  mantenimientos: null,
  tarifa_financiacion: 'NORMAL',
  garantia: true,
  gp: 990,
  pct_dto: null,
  meses_garantia_fabrica: null,
  motor_cv: 283,
  cubicaje: null,
  caja: 'Automático',
  combustible: 'Eléctrico',
}
const CALCULO = calcularPresupuesto({
  vehiculo: {
    precio_contado: 32985,
    tarifa_financiacion: 'NORMAL',
    gp: 990,
    fecha_matriculacion: '2023-05-05',
    meses_garantia_fabrica: null,
  },
  opciones: OPCIONES_DEFECTO,
  params: PARAMETROS_DEFECTO,
  tarifaPremium: T899,
  tarifaSinPremium: T999,
  hoy: '2026-09-14',
})
const FILA = {
  id: 5,
  numero: 'P-2026-0001',
  vehiculo_id: 1088,
  interesado_id: null,
  cliente_id: null,
  nombre_cliente: 'Marta',
  telefono: '600 12 34 56',
  email: 'marta@example.com',
  opciones: OPCIONES_DEFECTO,
  calculo: CALCULO,
  tarifa_id: 1,
  tarifa_sin_premium_id: 2,
  version_parametros: {
    params: PARAMETROS_DEFECTO,
    tarifaPremium: T899,
    tarifaSinPremium: T999,
  },
  pdf_url: null,
  token_publico: 'tok_abcdefghijklmnopqrstuvwxyz',
  estado: 'borrador',
  valido_hasta: '2026-09-21',
  visto_at: null,
  aceptado_at: null,
  enviado_at: null,
  deal_id: null,
  creado_por: 'Seba',
  created_at: '2026-09-14T10:00:00.000Z',
  updated_at: '2026-09-14T10:00:00.000Z',
}

function req(url: string, body?: unknown, method = 'POST') {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockReturnValue({ uid: 1, role: 'admin', exp: 9999999999 })
  mockQuery.mockResolvedValue({ rows: [{ display_name: 'Seba', email: null }] })
  mockVehiculo.mockResolvedValue(VEHICULO)
  mockActualizar.mockImplementation(async (_id, patch) => ({
    ...FILA,
    ...patch,
  }))
})

describe('POST /api/presupuestos', () => {
  it('401 sin sesión', async () => {
    mockSession.mockReturnValue(null)
    const res = await POST(req('/api/presupuestos', { vehiculoId: 1088 }))
    expect(res.status).toBe(401)
  })

  it('400 con opciones inválidas', async () => {
    const res = await POST(
      req('/api/presupuestos', {
        vehiculoId: 1088,
        nombreCliente: 'Marta',
        opciones: { modoPlazo: 'LARGO', entrada: 'abc' },
      })
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.errores).toEqual(
      expect.arrayContaining([
        expect.stringContaining('modoPlazo'),
        expect.stringContaining('entrada'),
      ])
    )
    expect(mockConstruir).not.toHaveBeenCalled()
  })

  it('409 si el vehículo no tiene precio', async () => {
    mockConstruir.mockResolvedValue({ error: 'SIN_PRECIO' })
    const res = await POST(
      req('/api/presupuestos', { vehiculoId: 1088, nombreCliente: 'Marta' })
    )
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('SIN_PRECIO')
  })

  it('201 crea con el cálculo, la versión y creado_por', async () => {
    mockConstruir.mockResolvedValue({
      vehiculo: VEHICULO,
      ficha: FICHA,
      contexto: CONTEXTO,
      calculo: CALCULO,
    })
    mockCrear.mockResolvedValue(FILA)
    const res = await POST(
      req('/api/presupuestos', {
        vehiculoId: 1088,
        nombreCliente: ' Marta ',
        telefono: '600 12 34 56',
        email: '',
        opciones: { financia: true, entrada: '1.500,00' },
      })
    )
    expect(res.status).toBe(201)
    expect(mockConstruir).toHaveBeenCalledWith(
      1088,
      expect.objectContaining({ financia: true, entrada: 1500 })
    )
    expect(mockCrear).toHaveBeenCalledWith(
      expect.objectContaining({
        vehiculoId: 1088,
        nombreCliente: 'Marta',
        telefono: '600 12 34 56',
        email: null,
        calculo: CALCULO,
        version: {
          params: PARAMETROS_DEFECTO,
          tarifaPremium: T899,
          tarifaSinPremium: T999,
        },
        creadoPor: 'Seba',
      })
    )
    const json = await res.json()
    expect(json.presupuesto.numero).toBe('P-2026-0001')
    expect(json.urlPublica).toMatch(/\/p\/tok_abcdefghijklmnopqrstuvwxyz$/)
  })
})

describe('GET /api/presupuestos', () => {
  it('pasa filtros y añade urlPublica; sin page no pagina', async () => {
    mockListar.mockResolvedValue({
      rows: [{ ...FILA, marca: 'Tesla', modelo: 'Model 3' }],
      total: 1,
    })
    const res = await GET(
      req(
        '/api/presupuestos?vencidos=true&estado=visto&vehiculoId=1088',
        undefined,
        'GET'
      )
    )
    expect(res.status).toBe(200)
    expect(mockListar).toHaveBeenCalledWith(
      expect.objectContaining({
        vencidos: true,
        estado: 'visto',
        vehiculoId: 1088,
        limit: 200,
        offset: 0,
      })
    )
    const json = await res.json()
    expect(json.pagination).toBeUndefined()
    expect(json.presupuestos[0].urlPublica).toContain('/p/tok_')
  })

  it('con page devuelve pagination', async () => {
    mockListar.mockResolvedValue({ rows: [], total: 120 })
    const res = await GET(
      req('/api/presupuestos?page=2&limit=50', undefined, 'GET')
    )
    const json = await res.json()
    expect(mockListar).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 50 })
    )
    expect(json.pagination).toMatchObject({
      total: 120,
      page: 2,
      totalPages: 3,
    })
  })
})

describe('POST /api/presupuestos/[id]/aceptar', () => {
  it('sin cliente marca aceptado y manda al wizard', async () => {
    mockLeer.mockResolvedValue(FILA)
    const res = await ACEPTAR(
      req('/api/presupuestos/5/aceptar', { columna: 'premium' }),
      params('5')
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      deal: null,
      url: '/deals/nuevo?vehiculoId=1088',
    })
    expect(mockActualizar).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ estado: 'aceptado' })
    )
    expect(mockCreateDeal).not.toHaveBeenCalled()
  })

  it('con cliente crea el deal, lo reserva y enlaza el presupuesto', async () => {
    mockLeer.mockResolvedValue({ ...FILA, cliente_id: 3 })
    mockCreateDeal.mockResolvedValue({ id: 77, numero: 'RES-2026-000001' })
    mockUpdateDeal.mockResolvedValue({ id: 77, estado: 'reservado' })
    const res = await ACEPTAR(
      req('/api/presupuestos/5/aceptar', { columna: 'sin_premium' }),
      params('5')
    )
    expect(res.status).toBe(200)
    expect(mockCreateDeal).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 3,
        vehiculoId: 1088,
        importeTotal: CALCULO.columnas.sin_premium.total,
        financiacion: true,
        observaciones: 'Presupuesto P-2026-0001 (sin_premium)',
        responsableComercial: 'Seba',
      })
    )
    expect(mockUpdateDeal).toHaveBeenCalledWith(77, { estado: 'reservado' })
    expect(mockActualizar).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        estado: 'aceptado',
        deal_id: 77,
        cliente_id: 3,
      })
    )
    expect(await res.json()).toEqual({
      deal: { id: 77, numero: 'RES-2026-000001' },
      url: '/deals/77',
    })
  })

  it('409 si el vehículo ya está reservado o el presupuesto está cerrado', async () => {
    mockLeer.mockResolvedValue(FILA)
    mockVehiculo.mockResolvedValue({ ...VEHICULO, estado: 'reservado' })
    const r1 = await ACEPTAR(
      req('/api/presupuestos/5/aceptar', { columna: 'premium' }),
      params('5')
    )
    expect(r1.status).toBe(409)
    expect((await r1.json()).code).toBe('VEHICULO_NO_DISPONIBLE')

    mockLeer.mockResolvedValue({ ...FILA, estado: 'anulado' })
    const r2 = await ACEPTAR(
      req('/api/presupuestos/5/aceptar', { columna: 'premium' }),
      params('5')
    )
    expect(r2.status).toBe(409)
    expect(mockCreateDeal).not.toHaveBeenCalled()
  })
})

describe('POST /api/presupuestos/[id]/enviar', () => {
  it('whatsapp devuelve el enlace wa.me con vehículo, url y fecha; borrador → enviado', async () => {
    mockLeer.mockResolvedValue(FILA)
    const res = await ENVIAR(
      req('/api/presupuestos/5/enviar', { canal: 'whatsapp' }),
      params('5')
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.enlace).toMatch(/^https:\/\/wa\.me\/34600123456\?text=/)
    expect(json.texto).toBe(
      'Hola Marta, te paso el presupuesto del Tesla Model 3 (1234ABC): https://sevencars.vercel.app/p/tok_abcdefghijklmnopqrstuvwxyz. Válido hasta 21/09/2026.'
    )
    expect(mockActualizar).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        estado: 'enviado',
        enviado_at: expect.any(String),
      })
    )
  })

  it('whatsapp sin teléfono válido → 400', async () => {
    mockLeer.mockResolvedValue({ ...FILA, telefono: null })
    const res = await ENVIAR(
      req('/api/presupuestos/5/enviar', { canal: 'whatsapp' }),
      params('5')
    )
    expect(res.status).toBe(400)
    expect(mockActualizar).not.toHaveBeenCalled()
  })

  it('email adjunta el PDF y no retrocede un presupuesto visto', async () => {
    mockLeer.mockResolvedValue({ ...FILA, estado: 'visto' })
    mockObtenerPdf.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      nombreArchivo: 'Presupuesto-P-2026-0001-Tesla-Model-3-Rwd-1234ABC.pdf',
      pdf_url: 'https://blob/x.pdf',
    })
    mockSendMail.mockResolvedValue({ sent: true })
    const res = await ENVIAR(
      req('/api/presupuestos/5/enviar', { canal: 'email' }),
      params('5')
    )
    expect(res.status).toBe(200)
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'marta@example.com',
        subject: 'Presupuesto de tu Tesla Model 3 (1234ABC) — Sevencars',
        attachments: [
          expect.objectContaining({
            filename: 'Presupuesto-P-2026-0001-Tesla-Model-3-Rwd-1234ABC.pdf',
            contentType: 'application/pdf',
          }),
        ],
      })
    )
    expect(mockActualizar).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ estado: 'visto' })
    )
  })

  it('email no enviado → 502 sin cambiar estado', async () => {
    mockLeer.mockResolvedValue(FILA)
    mockObtenerPdf.mockResolvedValue({
      bytes: new Uint8Array([1]),
      nombreArchivo: 'x.pdf',
      pdf_url: null,
    })
    mockSendMail.mockResolvedValue({
      sent: false,
      reason: 'SMTP_PASS no configurada',
    })
    const res = await ENVIAR(
      req('/api/presupuestos/5/enviar', { canal: 'email' }),
      params('5')
    )
    expect(res.status).toBe(502)
    expect(mockActualizar).not.toHaveBeenCalled()
  })
})
