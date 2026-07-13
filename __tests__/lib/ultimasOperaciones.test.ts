/**
 * "Últimas operaciones" (home) miraba sólo la tabla Deal: una venta B2B nunca
 * aparecía. Ahora reusa la vista unificada retail + B2B de /ventas.
 */

// El pool se construye al importar direct-database (antes de que corran las
// consts del test), así que el fake vive dentro de la factory del mock.
jest.mock('pg', () => {
  const client = { query: jest.fn(), release: jest.fn() }
  const pool = {
    connect: jest.fn(async () => client),
    query: jest.fn(),
    on: jest.fn(),
    end: jest.fn(),
    __client: client,
  }
  return { Pool: jest.fn(() => pool) }
})

import { Pool } from 'pg'
import { getUltimasOperaciones } from '@/lib/direct-database'

const mockPool = new Pool() as unknown as {
  __client: { query: jest.Mock; release: jest.Mock }
}
const mockClient = mockPool.__client

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getUltimasOperaciones', () => {
  it('devuelve retail y B2B en la misma lista, con key e importe únicos', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          payload: {
            rows: [
              {
                tipo: 'b2b',
                id: 3,
                numero: 'B2B-2026-0003',
                fecha: '2026-06-01',
                estado: 'facturado',
                importe: '6000.00',
                cliente: 'Empresa SL',
                cliente_id: 2,
                marca: 'Volkswagen',
                modelo: 'Eos',
                matricula: '8700GKW',
                factura_numero: 'R-2026-040',
                facturada: true,
                anulada: false,
                cuenta_venta: true,
              },
              {
                tipo: 'retail',
                id: 149,
                numero: 'D-149',
                fecha: '2026-05-20',
                estado: 'vendido',
                importe: '3373.00',
                cliente: 'Juan Pérez',
                cliente_id: 7,
                marca: 'Opel',
                modelo: 'Zafira',
                matricula: '6873KBW',
                factura_numero: null,
                facturada: false,
                anulada: false,
                cuenta_venta: true,
              },
            ],
          },
        },
      ],
    })

    const ops = await getUltimasOperaciones(5)

    expect(ops).toHaveLength(2)
    expect(ops.map((o) => o.tipo)).toEqual(['b2b', 'retail'])
    expect(ops[0]).toMatchObject({
      id: 'b2b-3',
      referencia: 'B2B-2026-0003',
      cliente: 'Empresa SL',
      vehiculo: 'Volkswagen Eos',
      estado: 'facturado',
      precio: 6000,
      href: '/clientes-b2b/2',
    })
    expect(ops[1]).toMatchObject({ id: 'retail-149', href: '/deals/149' })
    expect(mockClient.release).toHaveBeenCalled()
  })

  it('la query consulta las dos fuentes (Deal + venta_b2b)', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ payload: { rows: [] } }] })

    await getUltimasOperaciones(5)

    const [sql, params] = mockClient.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('FROM "Deal" d')
    expect(sql).toContain('FROM venta_b2b vb')
    expect(params).toContain(5) // pageSize = limit
  })
})
