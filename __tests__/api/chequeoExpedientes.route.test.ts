/**
 * @jest-environment node
 *
 * GET /api/gestoria/chequeo-expedientes — auth DUAL (X-Admin-Secret O sesión)
 * y wiring de fuentes (invoices + snapshot opcional + hoja CB mockeada).
 */

const mockValuesGet = jest.fn()

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('@/lib/googleSheets', () => ({
  getGoogleSheetsAuth: jest.fn(async () => ({})),
}))
jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({
      spreadsheets: { values: { get: (...args: unknown[]) => mockValuesGet(...args) } },
    })),
  },
}))
jest.mock('@/lib/auth-server', () => ({
  readSessionFromRequest: jest.fn(() => null),
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { readSessionFromRequest } from '@/lib/auth-server'
import { GET } from '@/app/api/gestoria/chequeo-expedientes/route'

const mockQuery = pool.query as jest.Mock
const mockSession = readSessionFromRequest as jest.Mock
const ADMIN_SECRET = 'test-admin-secret'

function makeRequest(qs: string, secret?: string) {
  return new NextRequest(`http://localhost/api/gestoria/chequeo-expedientes${qs}`, {
    headers: secret ? { 'x-admin-secret': secret } : {},
  })
}

/** Mockea la secuencia de queries del route: invoices → to_regclass carpetas →
 *  [snapshot] → to_regclass expedientes → [tipos] → to_regclass facturas_registro
 *  → [hashes de facturas_registro]. */
function mockDbFeliz() {
  mockQuery
    .mockResolvedValueOnce({
      rows: [
        {
          full_invoice_number: 'F-2026-020',
          invoice_date: '2026-04-05',
          vehicle_plate: '8061KRN',
        },
      ],
    })
    .mockResolvedValueOnce({ rows: [{ reg: 'expedientes_carpetas' }] })
    .mockResolvedValueOnce({
      rows: [
        {
          mes: 'abril',
          carpeta: '74-Opel-Astra-8061KRN',
          matricula_norm: '8061KRN',
          archivos: [
            { nombre: 'Factura-Venta-F-2026-020.pdf' },
            { nombre: 'Factura-Compra-XXXX.pdf' },
            { nombre: 'Contrato comprador.jpeg' },
          ],
          scanned_at: '2026-07-11 21:15:00+00',
        },
      ],
    })
    .mockResolvedValueOnce({ rows: [{ reg: 'expedientes' }] })
    .mockResolvedValueOnce({
      rows: [{ matricula: '8061KRN', tipo_operacion: 'retail-vat' }],
    })
    .mockResolvedValueOnce({ rows: [{ reg: 'facturas_registro' }] })
    .mockResolvedValueOnce({ rows: [] }) // facturas_registro (hashes)
}

const CB_ROWS = [
  ['ABRIL'],
  ['05/04/2026', 'ABRIL', '#74', 'Opel Astra', '8061 KRN'],
  ['', '', '', 'TOTAL ABRIL'],
]

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ADMIN_SECRET = ADMIN_SECRET
  mockValuesGet.mockResolvedValue({ data: { values: CB_ROWS } })
})

afterEach(() => {
  delete process.env.ADMIN_SECRET
})

describe('GET /api/gestoria/chequeo-expedientes — auth dual', () => {
  it('401 sin secret ni sesión', async () => {
    const res = await GET(makeRequest('?quarter=2&year=2026'))
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('401 con secret incorrecto y sin sesión', async () => {
    const res = await GET(makeRequest('?quarter=2&year=2026', 'wrong'))
    expect(res.status).toBe(401)
  })

  it('pasa con X-Admin-Secret válido (sin sesión)', async () => {
    mockDbFeliz()
    const res = await GET(makeRequest('?quarter=2&year=2026', ADMIN_SECRET))
    expect(res.status).toBe(200)
  })

  it('pasa con sesión válida (sin secret)', async () => {
    mockSession.mockReturnValueOnce({ user: 'seb', role: 'admin' })
    mockDbFeliz()
    const res = await GET(makeRequest('?quarter=2&year=2026'))
    expect(res.status).toBe(200)
  })

  it('400 con quarter inválido', async () => {
    const res = await GET(makeRequest('?quarter=9&year=2026', ADMIN_SECRET))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/gestoria/chequeo-expedientes — resultado', () => {
  it('todo cuadra → ok:true con las tres fuentes verificables', async () => {
    mockDbFeliz()
    const res = await GET(makeRequest('?quarter=2&year=2026', ADMIN_SECRET))
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.resumen).toMatchObject({ ok: true, bloqueantes: [] })
    const abril = body.meses.find((m: { mes: string }) => m.mes === 'ABRIL')
    expect(abril.facturas.count).toBe(1)
    expect(abril.carpetas).toMatchObject({ verificable: true, count: 1 })
    expect(abril.cbBanda).toMatchObject({
      verificable: true,
      count: 1,
      matriculas: ['8061KRN'],
    })
    expect(abril.ok).toBe(true)
    expect(body.expedientesDocs[0]).toMatchObject({
      tipoOperacion: 'retail-vat',
      faltantes: [],
    })
  })

  it('sin tabla de snapshot → carpetas verificable:false y nota, no bloquea', async () => {
    mockValuesGet.mockResolvedValueOnce({ data: { values: [] } }) // CB vacía
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // invoices
      .mockResolvedValueOnce({ rows: [{ reg: null }] }) // to_regclass carpetas
      .mockResolvedValueOnce({ rows: [{ reg: null }] }) // to_regclass expedientes
      .mockResolvedValueOnce({ rows: [{ reg: null }] }) // to_regclass facturas_registro
    const res = await GET(makeRequest('?quarter=2&year=2026', ADMIN_SECRET))
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.meses[0].carpetas.verificable).toBe(false)
    expect(body.resumen.notas.join(' ')).toContain('sin snapshot')
  })

  it('el hash de facturas_registro identifica una "factura.pdf" sin nombre útil', async () => {
    const md5 = 'c'.repeat(32)
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            full_invoice_number: 'F-2026-020',
            invoice_date: '2026-04-05',
            vehicle_plate: '8061KRN',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ reg: 'expedientes_carpetas' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            mes: 'abril',
            carpeta: '74-Opel-Astra-8061KRN',
            matricula_norm: '8061KRN',
            archivos: [
              { nombre: 'Factura-Venta-F-2026-020.pdf', bytes: 10, hash: 'd'.repeat(32) },
              { nombre: 'factura.pdf', bytes: 20, hash: md5 }, // nombre inútil
              { nombre: 'Contrato comprador.jpeg', bytes: 30, hash: null },
            ],
            scanned_at: '2026-07-13 21:15:00+00',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ reg: 'expedientes' }] })
      .mockResolvedValueOnce({ rows: [{ matricula: '8061KRN', tipo_operacion: 'retail-vat' }] })
      .mockResolvedValueOnce({ rows: [{ reg: 'facturas_registro' }] })
      .mockResolvedValueOnce({
        rows: [{ hash_contenido: md5, categoria: 'coche-compra', matricula: '8061KRN' }],
      })

    const res = await GET(makeRequest('?quarter=2&year=2026', ADMIN_SECRET))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.expedientesDocs[0]).toMatchObject({
      docs: { facturaVenta: true, facturaCompra: true, contratoVenta: true },
      faltantes: [],
      ambiguos: [],
    })
  })

  it('hoja CB ilegible → cbBanda verificable:false, no revienta', async () => {
    mockValuesGet.mockRejectedValueOnce(new Error('no sheet'))
    mockDbFeliz()
    const res = await GET(makeRequest('?quarter=2&year=2026', ADMIN_SECRET))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.meses[0].cbBanda.verificable).toBe(false)
  })
})
