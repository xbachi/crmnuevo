/**
 * @jest-environment node
 *
 * GET /api/admin/stock-aging — alertas, orden y resumen. pg mockeado.
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))

import { GET } from '@/app/api/admin/stock-aging/route'
import { pool } from '@/lib/direct-database'

const mockQuery = pool.query as unknown as jest.Mock

const SECRET = 'test-admin-secret'
process.env.ADMIN_SECRET = SECRET

function makeReq(secret: string | null = SECRET): NextRequest {
  return {
    url: 'http://localhost/api/admin/stock-aging',
    headers: {
      get: (k: string) => (k.toLowerCase() === 'x-admin-secret' ? secret : null),
    },
  } as unknown as NextRequest
}

const base = {
  id: 1,
  referencia: '100',
  matricula: '1111AAA',
  marca: 'Seat',
  modelo: 'Leon',
  estado: 'PUBLICADO',
  diasEnStock: 10,
  precioCompra: 10000,
  gastosTransporte: null,
  gastosTasas: null,
  gastosMecanica: null,
  gastosPintura: null,
  gastosLimpieza: null,
  gastosOtros: null,
  gastosCNGarantia: null,
  precioPublicacion: 12000,
  precioVenta: null,
}

describe('GET /api/admin/stock-aging', () => {
  it('401 sin X-Admin-Secret', async () => {
    const res = await GET(makeReq(null))
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('arma alertas correctas por fixture', async () => {
    mockQuery.mockReset().mockResolvedValue({
      rows: [
        // margen negativo: coste 10000+3000 > precioVenta 11000
        { ...base, id: 1, diasEnStock: 95, gastosMecanica: 3000, precioVenta: 11000, precioPublicacion: null },
        // aging-60 (61-90), margen ok
        { ...base, id: 2, diasEnStock: 61 },
        // sin precio de compra pero con gastos → sin-precio-compra + gastos-sin-coste-base
        { ...base, id: 3, diasEnStock: 5, precioCompra: null, gastosPintura: 400, precioPublicacion: null },
        // limpio
        { ...base, id: 4, diasEnStock: 30 },
      ],
    })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    const porId = Object.fromEntries(
      json.vehiculos.map((v: { id: number }) => [v.id, v])
    )

    expect(porId[1].alertas).toEqual(['margen-negativo', 'aging-90'])
    expect(porId[1].costeTotal).toBe(13000)
    expect(porId[1].margenEstimado).toBe(-2000)

    expect(porId[2].alertas).toEqual(['aging-60'])
    expect(porId[2].margenEstimado).toBe(2000) // 12000 - 10000

    expect(porId[3].alertas).toEqual([
      'sin-precio-compra',
      'gastos-sin-coste-base',
    ])
    expect(porId[3].margenEstimado).toBeNull() // sin precio previsto

    expect(porId[4].alertas).toEqual([])

    expect(json.resumen).toMatchObject({
      totalEnStock: 4,
      conAlertas: 3,
      margenNegativo: 1,
      aging60: 1,
      aging90: 1,
      sinPrecioCompra: 1,
      gastosSinCosteBase: 1,
    })
  })

  it('la query excluye vendidos y ordena por días desc', async () => {
    mockQuery.mockReset().mockResolvedValue({ rows: [] })
    await GET(makeReq())
    const sql = String(mockQuery.mock.calls[0][0])
    expect(sql).toMatch(/<> 'VENDIDO'/)
    expect(sql).toMatch(/ORDER BY "diasEnStock" DESC/)
  })
})
