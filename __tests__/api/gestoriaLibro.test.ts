/**
 * @jest-environment node
 *
 * GET /api/gestoria/libro — libro IVA/REBU. pg mockeado (unit, sin DB).
 * Casos clave: REBU sin precioCompra → margen null con motivo (nunca se
 * inventa margen con compra=0), VAT usa base/cuota reales de la tabla,
 * CSV con BOM UTF-8 y separador `;`.
 */

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { GET } from '@/app/api/gestoria/libro/route'

const mockQuery = pool.query as jest.Mock
const ADMIN_SECRET = 'test-admin-secret'

function makeRequest(qs: string, secret = ADMIN_SECRET) {
  return new NextRequest(`http://localhost/api/gestoria/libro${qs}`, {
    headers: { 'x-admin-secret': secret },
  })
}

const EMITIDAS = [
  {
    // VAT con desglose real guardado al emitir (computeAmounts)
    full_invoice_number: 'F-2026-0031',
    invoice_date: '2026-04-05',
    invoice_type: 'VAT',
    status: 'ISSUED',
    vehicle_plate: '1111AAA',
    vehiculo_id: 10,
    total_amount: '12100.00',
    taxable_base: '10000.00',
    vat_amount: '2100.00',
    precio_compra: '8000.00',
    precio_venta: '12100.00',
  },
  {
    // REBU con compra cargada → margen y cuota 21/121
    full_invoice_number: 'R-2026-0032',
    invoice_date: '2026-04-10',
    invoice_type: 'REBU',
    status: 'ISSUED',
    vehicle_plate: '2222BBB',
    vehiculo_id: 11,
    total_amount: '9000.00',
    taxable_base: null,
    vat_amount: null,
    precio_compra: '6580.00',
    precio_venta: '9000.00',
  },
  {
    // REBU SIN precioCompra → margen null con motivo, jamás margen inventado
    full_invoice_number: 'R-2026-0033',
    invoice_date: '2026-05-02',
    invoice_type: 'REBU',
    status: 'ISSUED',
    vehicle_plate: '3333CCC',
    vehiculo_id: 12,
    total_amount: '7500.00',
    taxable_base: null,
    vat_amount: null,
    precio_compra: null,
    precio_venta: '7500.00',
  },
]

function setupQueries() {
  mockQuery.mockReset()
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM invoices i')) return { rows: EMITIDAS }
    if (sql.includes('FROM facturas_registro'))
      return {
        rows: [
          {
            fecha_factura: '2026-04-20',
            proveedor: 'mecauto',
            numero_factura: 'FC26-201',
            categoria: 'coche-servicio',
            importe: '277.88',
          },
        ],
      }
    throw new Error(`SQL inesperado en test: ${sql}`)
  })
}

beforeEach(() => {
  process.env.ADMIN_SECRET = ADMIN_SECRET
})

afterEach(() => {
  delete process.env.ADMIN_SECRET
})

describe('GET /api/gestoria/libro', () => {
  it('sin X-Admin-Secret válido → 401', async () => {
    setupQueries()
    const res = await GET(makeRequest('?quarter=2&year=2026', 'wrong'))
    expect(res.status).toBe(401)
  })

  it('quarter inválido → 400', async () => {
    setupQueries()
    const res = await GET(makeRequest('?quarter=9&year=2026'))
    expect(res.status).toBe(400)
  })

  it('VAT usa base/cuota reales; REBU calcula margen 21/121; sin precioCompra → null con motivo', async () => {
    setupQueries()
    const res = await GET(makeRequest('?quarter=2&year=2026'))
    expect(res.status).toBe(200)
    const json = await res.json()

    const vat = json.emitidas.find((e: { numero: string }) => e.numero === 'F-2026-0031')
    expect(vat.base).toBe(10000)
    expect(vat.cuota).toBe(2100)
    expect(vat.base_derivada).toBe(false)

    const rebu = json.emitidas.find((e: { numero: string }) => e.numero === 'R-2026-0032')
    expect(rebu.margen).toBe(2420) // 9000 − 6580
    expect(rebu.cuota_rebu).toBe(420) // 2420 × 21/121
    expect(rebu.base).toBeNull()

    const sinCompra = json.emitidas.find((e: { numero: string }) => e.numero === 'R-2026-0033')
    expect(sinCompra.margen).toBeNull()
    expect(sinCompra.cuota_rebu).toBeNull()
    expect(sinCompra.nota).toBe('sin precio de compra cargado')

    // Recibidas: base/cuota null para que la gestoría complete
    expect(json.recibidas[0]).toMatchObject({
      proveedor: 'mecauto',
      total: 277.88,
      base: null,
      cuota: null,
    })

    expect(json.totales.emitidas_rebu.sin_margen).toBe(1)
    expect(json.totales.emitidas_vat).toMatchObject({ count: 1, base: 10000, cuota: 2100 })
  })

  it('format=csv → BOM UTF-8, separador ; y attachment libro-2026-T2.csv', async () => {
    setupQueries()
    const res = await GET(makeRequest('?quarter=2&year=2026&format=csv'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="libro-2026-T2.csv"'
    )
    // text() descarta el BOM al decodificar; se verifica sobre los bytes crudos
    const bytes = Buffer.from(await res.arrayBuffer())
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = bytes.toString('utf8')
    expect(text).toContain('numero;fecha;tipo;estado;matricula;total')
    expect(text).toContain('R-2026-0032;2026-04-10;REBU;ISSUED;2222BBB;9000,00')
    expect(text).toContain('sin precio de compra cargado')
    expect(text).toContain('FACTURAS RECIBIDAS')
    expect(text).toContain('TOTALES')
  })
})
