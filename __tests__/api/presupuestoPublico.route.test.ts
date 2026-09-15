/**
 * @jest-environment node
 *
 * /api/public/presupuesto/[token] (GET) y /visto (POST): sin sesión, sin
 * caché y sin datos internos.
 */
jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/fichaComercial', () => ({
  ...jest.requireActual('@/lib/fichaComercial'),
  leerFicha: jest.fn(),
}))
jest.mock('@/lib/presupuesto/pdf', () => ({
  generarPresupuestoPdf: jest.fn(),
}))
jest.mock('@/lib/presupuesto/repo', () => ({
  leerPorToken: jest.fn(),
  marcarVisto: jest.fn(),
  cargarParametros: jest.fn(),
}))
jest.mock('@/lib/presupuesto/servicio', () => ({
  ...jest.requireActual('@/lib/presupuesto/servicio'),
  cargarVehiculoPresupuesto: jest.fn(),
}))

import type { NextRequest } from 'next/server'
import { leerFicha } from '@/lib/fichaComercial'
import {
  cargarParametros,
  leerPorToken,
  marcarVisto,
} from '@/lib/presupuesto/repo'
import { cargarVehiculoPresupuesto } from '@/lib/presupuesto/servicio'
import { calcularPresupuesto } from '@/lib/presupuesto/calculo'
import { OPCIONES_DEFECTO, PARAMETROS_DEFECTO } from '@/lib/presupuesto/tipos'
import { GET } from '@/app/api/public/presupuesto/[token]/route'
import { POST as VISTO } from '@/app/api/public/presupuesto/[token]/visto/route'

const mockLeerPorToken = leerPorToken as jest.Mock
const mockMarcarVisto = marcarVisto as jest.Mock
const mockParams = cargarParametros as jest.Mock
const mockVehiculo = cargarVehiculoPresupuesto as jest.Mock
const mockFicha = leerFicha as jest.Mock

const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz'
const T = { id: 1, nombre: '8,99', coeficientes: { '120': 0.01476 } }
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
  tarifaPremium: T,
  tarifaSinPremium: T,
  hoy: '2026-09-14',
})
const FILA = {
  id: 5,
  numero: 'P-2026-0001',
  vehiculo_id: 1088,
  interesado_id: 9,
  cliente_id: 3,
  nombre_cliente: 'Marta',
  telefono: '600123456',
  email: 'marta@example.com',
  opciones: OPCIONES_DEFECTO,
  calculo: CALCULO,
  tarifa_id: 1,
  tarifa_sin_premium_id: 1,
  version_parametros: {
    params: PARAMETROS_DEFECTO,
    tarifaPremium: T,
    tarifaSinPremium: T,
  },
  pdf_url: 'https://blob.example/x.pdf',
  token_publico: TOKEN,
  estado: 'enviado',
  valido_hasta: '2999-01-01',
  visto_at: null,
  aceptado_at: null,
  enviado_at: '2026-09-14T10:00:00.000Z',
  deal_id: null,
  creado_por: 'Seba',
  created_at: '2026-09-14T10:00:00.000Z',
  updated_at: '2026-09-14T10:00:00.000Z',
}
const PROHIBIDAS = [
  'id',
  'creado_por',
  'telefono',
  'email',
  'interesado_id',
  'cliente_id',
  'version_parametros',
  'pdf_url',
  'token_publico',
]

const req = {} as NextRequest
const params = (token: string) => ({ params: Promise.resolve({ token }) })

beforeEach(() => {
  jest.clearAllMocks()
  mockParams.mockResolvedValue({
    ...PARAMETROS_DEFECTO,
    whatsapp_empresa: '600 000 000',
  })
  mockVehiculo.mockResolvedValue({
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
  })
  mockFicha.mockResolvedValue({
    nombre_comercial: 'Tesla Model 3 RWD',
    url_qr: 'https://www.sevencars.es/coches/tesla-1088',
    url_imagen: 'https://img.example/1.jpg',
    combustible: 'Eléctrico',
    caja: 'Automático',
    motor_cv: 283,
    cubicaje: null,
    mantenimientos: null,
  })
})

describe('GET /api/public/presupuesto/[token]', () => {
  it('devuelve el presupuesto sin datos internos y sin caché', async () => {
    mockLeerPorToken.mockResolvedValue(FILA)
    const res = await GET(req, params(TOKEN))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const json = await res.json()
    for (const k of PROHIBIDAS) expect(Object.keys(json)).not.toContain(k)
    expect(JSON.stringify(json)).not.toContain('marta@example.com')
    expect(JSON.stringify(json)).not.toContain('600123456')
    expect(json).toMatchObject({
      numero: 'P-2026-0001',
      estado: 'enviado',
      validoHasta: '2999-01-01',
      vencido: false,
      fecha: '2026-09-14',
      cliente: { nombre: 'Marta' },
      vehiculo: {
        nombre: 'Tesla Model 3 RWD',
        matricula: '1234ABC',
        url_imagen: 'https://img.example/1.jpg',
      },
      reservaUrl: 'https://www.sevencars.es/coches/tesla-1088',
      whatsapp: { telefono: '34600000000' },
      pdfDisponible: true,
    })
    expect(json.calculo.columnas.premium.total).toBe(32965)
    expect(json.calculo).not.toHaveProperty('derivados')
    expect(json.calculo).not.toHaveProperty('entrada')
    expect(json.calculo.columnas.premium).not.toHaveProperty('tarifaNombre')
    expect(json.calculo.columnas.sin_premium).not.toHaveProperty('tarifaNombre')
    expect(JSON.stringify(json)).not.toContain('FINANCIA MÁS 70%')
    expect(json.calculo.garantia).toEqual({
      textoOficial: CALCULO.derivados.garantia.textoOficial,
    })
    expect(mockLeerPorToken).toHaveBeenCalledWith(TOKEN)
  })

  it('vencido por fecha y estado', async () => {
    mockLeerPorToken.mockResolvedValue({ ...FILA, valido_hasta: '2020-01-01' })
    expect((await (await GET(req, params(TOKEN))).json()).vencido).toBe(true)
    mockLeerPorToken.mockResolvedValue({ ...FILA, estado: 'vencido' })
    expect((await (await GET(req, params(TOKEN))).json()).vencido).toBe(true)
  })

  it('404 si no existe, si está anulado o si el token es raro', async () => {
    mockLeerPorToken.mockResolvedValue(null)
    expect((await GET(req, params(TOKEN))).status).toBe(404)
    mockLeerPorToken.mockResolvedValue({ ...FILA, estado: 'anulado' })
    expect((await GET(req, params(TOKEN))).status).toBe(404)
    const r = await GET(req, params("x' OR 1=1"))
    expect(r.status).toBe(404)
    expect(mockLeerPorToken).toHaveBeenCalledTimes(2)
  })
})

describe('POST /api/public/presupuesto/[token]/visto', () => {
  it('204 y marca visto', async () => {
    mockMarcarVisto.mockResolvedValue(true)
    const res = await VISTO(req, params(TOKEN))
    expect(res.status).toBe(204)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(mockMarcarVisto).toHaveBeenCalledWith(TOKEN)
  })

  it('404 si no existe', async () => {
    mockMarcarVisto.mockResolvedValue(false)
    expect((await VISTO(req, params(TOKEN))).status).toBe(404)
  })
})
