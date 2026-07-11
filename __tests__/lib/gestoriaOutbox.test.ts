jest.mock('@/lib/direct-database', () => ({
  pool: { connect: jest.fn(), query: jest.fn() },
}))

import { pool } from '@/lib/direct-database'
import {
  nextOutboxAttempt,
  persistIssuedInvoiceAndEnqueue,
} from '@/lib/gestoriaOutbox'

describe('reintentos de la cola de gestoría', () => {
  const now = new Date('2026-07-11T10:00:00.000Z')

  it('aplica backoff exponencial', () => {
    expect(nextOutboxAttempt(1, now).toISOString()).toBe(
      '2026-07-11T10:01:00.000Z'
    )
    expect(nextOutboxAttempt(4, now).toISOString()).toBe(
      '2026-07-11T10:08:00.000Z'
    )
  })

  it('limita el backoff a seis horas', () => {
    expect(nextOutboxAttempt(20, now).toISOString()).toBe(
      '2026-07-11T16:00:00.000Z'
    )
  })

  it('confirma factura y evento outbox en la misma transacción', async () => {
    const release = jest.fn()
    const query = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 12, status: 'ISSUED' }] })
      .mockResolvedValueOnce({ rows: [{ id: '44' }] })
      .mockResolvedValueOnce({})
    ;(pool.connect as jest.Mock).mockResolvedValueOnce({ query, release })

    await expect(
      persistIssuedInvoiceAndEnqueue(12, 'https://blob/pdf', 'invoice.pdf')
    ).resolves.toMatchObject({ outboxId: '44', invoice: { id: 12 } })

    expect(query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0])).toEqual(
      ['BEGIN', 'UPDATE', 'INSERT', 'COMMIT']
    )
    expect(release).toHaveBeenCalledTimes(1)
  })
})
