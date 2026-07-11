/** @jest-environment node */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))

import { pool } from '@/lib/direct-database'
import {
  getInvoiceByDealAndType,
  getInvoiceByIdempotencyKey,
} from '@/lib/invoiceRepository'

const mockPoolQuery = pool.query as jest.Mock

describe('invoiceRepository con cliente transaccional', () => {
  beforeEach(() => mockPoolQuery.mockReset())

  it('usa el cliente recibido y no intenta reservar otra conexión del pool', async () => {
    const invoice = { id: 7 }
    const clientQuery = jest.fn().mockResolvedValue({ rows: [invoice] })
    const client = { query: clientQuery }

    await expect(
      getInvoiceByIdempotencyKey('retry-key', client as never)
    ).resolves.toBe(invoice)
    await expect(
      getInvoiceByDealAndType(12, 'VAT', client as never)
    ).resolves.toBe(invoice)

    expect(clientQuery).toHaveBeenCalledTimes(2)
    expect(mockPoolQuery).not.toHaveBeenCalled()
  })
})
