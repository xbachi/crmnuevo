/**
 * @jest-environment node
 *
 * POST /api/deals — los campos del wizard (fechas de reserva, resto a pagar,
 * financiación) tienen que llegar a createDeal; antes se descartaban.
 * direct-database va mockeado (unit, sin DB).
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({
  getDeals: jest.fn(),
  createDeal: jest.fn(),
}))

import { POST } from '@/app/api/deals/route'
import { createDeal } from '@/lib/direct-database'

const mockCreate = createDeal as unknown as jest.Mock

function makeReq(body: Record<string, unknown>): NextRequest {
  return {
    url: 'http://localhost/api/deals',
    json: async () => body,
  } as unknown as NextRequest
}

beforeEach(() => {
  mockCreate.mockReset().mockImplementation(async (data) => ({
    id: 1,
    numero: 'RES-2026-000001',
    ...data,
  }))
})

describe('POST /api/deals — campos del wizard', () => {
  it('pasa fechas de reserva, restoAPagar y financiación a createDeal', async () => {
    const res = await POST(
      makeReq({
        clienteId: '3',
        vehiculoId: '7',
        importeTotal: 12000,
        importeSena: 300,
        restoAPagar: 11700,
        financiacion: true,
        entidadFinanciera: 'Santander',
        fechaReservaDesde: '2026-09-04',
        fechaReservaExpira: '2026-09-11T00:00:00.000Z',
        observaciones: 'ok',
      })
    )
    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const args = mockCreate.mock.calls[0][0]
    expect(args.clienteId).toBe(3)
    expect(args.vehiculoId).toBe(7)
    expect(args.restoAPagar).toBe(11700)
    expect(args.financiacion).toBe(true)
    expect(args.entidadFinanciera).toBe('Santander')
    expect(args.fechaReservaDesde).toBeInstanceOf(Date)
    expect(args.fechaReservaExpira).toBeInstanceOf(Date)
    expect(args.fechaReservaExpira.toISOString()).toBe(
      '2026-09-11T00:00:00.000Z'
    )
  })

  it('restoAPagar como string numérico → Number', async () => {
    await POST(
      makeReq({ clienteId: 3, vehiculoId: 7, restoAPagar: '11700.50' })
    )
    expect(mockCreate.mock.calls[0][0].restoAPagar).toBe(11700.5)
  })

  it('fecha inválida o vacía → null; restoAPagar no numérico → null', async () => {
    const res = await POST(
      makeReq({
        clienteId: 3,
        vehiculoId: 7,
        fechaReservaExpira: 'no-es-una-fecha',
        fechaReservaDesde: '',
        restoAPagar: 'abc',
      })
    )
    expect(res.status).toBe(201)
    const args = mockCreate.mock.calls[0][0]
    expect(args.fechaReservaExpira).toBeNull()
    expect(args.fechaReservaDesde).toBeNull()
    expect(args.restoAPagar).toBeNull()
    expect(args.financiacion).toBe(false)
    expect(args.entidadFinanciera).toBeNull()
  })

  it('sin clienteId → 400 y no llama a createDeal', async () => {
    const res = await POST(makeReq({ vehiculoId: 7 }))
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
