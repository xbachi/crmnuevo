/**
 * @jest-environment node
 *
 * GET /api/ventas/unificadas — la lista de Ventas devuelve retail + B2B en una
 * sola respuesta, ordenadas por fecha, con el tipo de cada fila y los totales
 * agregados sobre las dos vías.
 */

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/auth-server', () => ({
  readSessionFromRequest: jest.fn(() => ({ uid: 1, role: 'admin', exp: 9999999999 })),
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { GET } from '@/app/api/ventas/unificadas/route'

const mockQuery = pool.query as jest.Mock

const payload = (over: Record<string, unknown> = {}) => ({
  rows: [
    {
      tipo: 'b2b',
      id: 1,
      numero: 'B2B-2026-0001',
      fecha: '2026-06-30',
      estado: 'facturado',
      importe: '8700.00',
      cliente: 'NGscuderia SL',
      cliente_id: 7,
      marca: 'VW',
      modelo: 'Eos',
      matricula: '8700GKW',
      factura_numero: 'R-2026-026',
      facturada: true,
      anulada: false,
      cuenta_venta: true,
    },
    {
      tipo: 'retail',
      id: 149,
      numero: 'D-149',
      fecha: '2026-06-20',
      estado: 'vendido',
      importe: '12100.00',
      cliente: 'Juan Pérez',
      cliente_id: 12,
      marca: 'Seat',
      modelo: 'León',
      matricula: '1234ABC',
      factura_numero: null,
      facturada: false,
      anulada: false,
      cuenta_venta: true,
    },
  ],
  total: 2,
  contadores: { todas: 2, retail: 1, b2b: 1, facturado: 1, vendido: 1, anulado: 0 },
  totales: {
    mesVentas: 2,
    mesImporte: '20800.00',
    mesB2B: 1,
    trimestreVentas: 2,
    trimestreImporte: '20800.00',
    trimestreB2B: 1,
    sinFacturar: 1,
  },
  ...over,
})

const req = (qs = '') =>
  new NextRequest(`http://localhost/api/ventas/unificadas${qs}`)

beforeEach(() => {
  jest.clearAllMocks()
  mockQuery.mockResolvedValue({ rows: [{ payload: payload() }] })
})

describe('GET /api/ventas/unificadas', () => {
  it('devuelve retail y B2B en la misma lista, ordenadas por fecha, con su tipo', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.ventas).toHaveLength(2)
    expect(body.ventas.map((v: { tipo: string }) => v.tipo)).toEqual([
      'b2b',
      'retail',
    ])
    // el orden por fecha desc lo hace SQL y la respuesta lo respeta
    expect(body.ventas[0].fecha > body.ventas[1].fecha).toBe(true)

    // cada fila enlaza a su ficha real
    expect(body.ventas[0].href).toBe('/clientes-b2b/7')
    expect(body.ventas[1].href).toBe('/deals/149')

    // una sola query (no dos fetch + merge)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0][0]).toContain('UNION ALL')
  })

  it('los totales del mes/trimestre incluyen las dos vías', async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(body.totales).toMatchObject({
      mesVentas: 2,
      mesImporte: 20800,
      mesB2B: 1,
      trimestreVentas: 2,
      trimestreB2B: 1,
      sinFacturar: 1,
    })
    expect(body.contadores).toMatchObject({ retail: 1, b2b: 1 })
  })

  it('la venta sin factura llega marcada como no facturada', async () => {
    const res = await GET(req())
    const body = await res.json()
    const retail = body.ventas.find((v: { tipo: string }) => v.tipo === 'retail')
    expect(retail.facturada).toBe(false)
    expect(retail.facturaNumero).toBeNull()
    expect(retail.anulada).toBe(false)
  })

  it('el filtro por tipo llega a la query como parámetro', async () => {
    await GET(req('?tipo=b2b'))
    const params = mockQuery.mock.calls[0][1] as unknown[]
    expect(params[2]).toBe('b2b')

    mockQuery.mockClear()
    await GET(req('?tipo=retail&estado=facturado&q=eos'))
    const p2 = mockQuery.mock.calls[0][1] as unknown[]
    expect(p2[2]).toBe('retail')
    expect(p2[3]).toBe('facturado')
    expect(p2[4]).toBe('eos')
  })

  it('la factura RECTIFIED no entra como activa (no infla los conteos)', async () => {
    await GET(req())
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]]
    expect(params[0]).toEqual(['ISSUED', 'IMPORTED', 'PDF_PENDING'])
    expect(params[0]).not.toContain('RECTIFIED')
    expect(params[1]).toEqual(['RECTIFIED', 'VOIDED'])
    expect(sql).toContain("i.invoice_type <> 'RECTIFYING'")
  })

  it('una venta anulada llega marcada y sin contar', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          payload: payload({
            rows: [
              {
                tipo: 'retail',
                id: 149,
                numero: 'D-149',
                fecha: '2026-06-30',
                estado: 'facturado',
                importe: '8700.00',
                cliente: 'Juan Pérez',
                cliente_id: 12,
                marca: 'VW',
                modelo: 'Eos',
                matricula: '8700GKW',
                factura_numero: null,
                facturada: false,
                anulada: true,
                cuenta_venta: false,
              },
            ],
            totales: {
              mesVentas: 0,
              mesImporte: 0,
              mesB2B: 0,
              trimestreVentas: 0,
              trimestreImporte: 0,
              trimestreB2B: 0,
              sinFacturar: 0,
            },
          }),
        },
      ],
    })

    const body = await (await GET(req())).json()
    expect(body.ventas[0].anulada).toBe(true)
    expect(body.ventas[0].cuentaVenta).toBe(false)
    expect(body.totales.mesVentas).toBe(0)
    expect(body.totales.trimestreVentas).toBe(0)
  })

  it('paginación: page/pageSize viajan a SQL y vuelve totalPages', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ payload: payload({ total: 57 }) }],
    })
    const body = await (await GET(req('?page=2&pageSize=25'))).json()
    const params = mockQuery.mock.calls[0][1] as unknown[]
    expect(params[7]).toBe(25)
    expect(params[8]).toBe(25)
    expect(body.total).toBe(57)
    expect(body.totalPages).toBe(3)
  })

  it('401 sin sesión', async () => {
    const authServer = jest.requireMock('@/lib/auth-server')
    authServer.readSessionFromRequest.mockReturnValueOnce(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
  })
})
