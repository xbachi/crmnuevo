/** @jest-environment node */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))

import { pool } from '@/lib/direct-database'
import { getEmittedInvoices } from '@/lib/facturasQuery'

describe('consulta unificada de facturas emitidas', () => {
  it('conserva facturas B2B y huérfanas mediante LEFT JOIN', async () => {
    const rows = [
      { id: 1, deal_id: null, b2b_venta_id: 3, origin: 'b2b' },
      { id: 2, deal_id: null, b2b_venta_id: null, origin: 'orphan' },
    ]
    const query = pool.query as jest.Mock
    query.mockResolvedValueOnce({ rows })

    await expect(getEmittedInvoices(2026)).resolves.toBe(rows)
    expect(query.mock.calls[0][0]).toContain('LEFT JOIN "Deal"')
    expect(query.mock.calls[0][0]).toContain('LEFT JOIN venta_b2b')
    expect(query.mock.calls[0][0]).toContain(
      'COALESCE(i.vehiculo_id, d."vehiculoId", vb.vehiculo_id)'
    )
  })
})
