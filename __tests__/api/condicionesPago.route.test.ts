/**
 * @jest-environment node
 *
 * POST /api/deals/[id]/condiciones-pago — validación server-side dura:
 * mixto que no suma el precio → 400; financiado sin banco → 400; contado no
 * exige campos de financiación. pool mockeado; sesión mockeada vía apiAuth.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('@/lib/apiAuth', () => ({
  requireApiSession: jest.fn(() => ({
    session: { uid: 1, role: 'asesor', exp: 0 },
  })),
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { POST } from '@/app/api/deals/[id]/condiciones-pago/route'

const mockQuery = pool.query as jest.Mock

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/deals/7/condiciones-pago', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = Promise.resolve({ id: '7' })

/** Mocks base: tabla existe + deal con importeTotal 20.000 €. */
function mockTablaYDeal(importeTotal = '20000') {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ reg: 'venta_condiciones_pago' }] })
    .mockResolvedValueOnce({ rows: [{ importeTotal }] })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/deals/[id]/condiciones-pago', () => {
  it('contado no exige campos de financiación → 200 y upsert', async () => {
    mockTablaYDeal()
    mockQuery.mockResolvedValueOnce({
      rows: [{ deal_id: 7, forma_pago: 'contado', garantia_premium: false }],
    })

    const res = await POST(
      makeRequest({ formaPago: 'contado', garantiaPremium: false }),
      { params }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.condiciones.forma_pago).toBe('contado')
    // upsert llamado con financiación en null
    const [sql, values] = mockQuery.mock.calls[2]
    expect(sql).toContain('ON CONFLICT (deal_id) DO UPDATE')
    expect(values).toEqual([7, 'contado', null, null, null, null, null, false])
  })

  it('financiado sin banco → 400 y NO llega al upsert', async () => {
    mockTablaYDeal()

    const res = await POST(
      makeRequest({
        formaPago: 'financiado',
        interes: 7.5,
        cuotas: 48,
        montoFinanciado: 20000,
        garantiaPremium: true,
      }),
      { params }
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('banco')
    expect(mockQuery).toHaveBeenCalledTimes(2) // to_regclass + deal, sin upsert
  })

  it('mixto que no suma el precio de venta → 400 con la diferencia', async () => {
    mockTablaYDeal('20000')

    const res = await POST(
      makeRequest({
        formaPago: 'mixto',
        banco: 'BBVA',
        interes: 6,
        cuotas: 36,
        montoFinanciado: 12000,
        montoContado: 5000, // 17.000 vs 20.000 → faltan 3.000
        garantiaPremium: false,
      }),
      { params }
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('faltan')
    expect(body.error).toContain('3000.00')
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })

  it('mixto que suma (± 1 € de tolerancia) → 200', async () => {
    mockTablaYDeal('20000')
    mockQuery.mockResolvedValueOnce({
      rows: [{ deal_id: 7, forma_pago: 'mixto' }],
    })

    const res = await POST(
      makeRequest({
        formaPago: 'mixto',
        banco: 'Cetelem',
        interes: 8,
        cuotas: 60,
        montoFinanciado: 15000.5,
        montoContado: 5000, // 20.000,50 → dentro de la tolerancia de 1 €
        garantiaPremium: true,
      }),
      { params }
    )

    expect(res.status).toBe(200)
  })

  it('garantiaPremium ausente → 400 (elección explícita obligatoria)', async () => {
    mockTablaYDeal()

    const res = await POST(makeRequest({ formaPago: 'contado' }), { params })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('garantiaPremium')
  })

  it('cuotas no enteras o < 1 → 400', async () => {
    mockTablaYDeal()

    const res = await POST(
      makeRequest({
        formaPago: 'financiado',
        banco: 'Sabadell',
        interes: 5,
        cuotas: 0,
        montoFinanciado: 20000,
        garantiaPremium: false,
      }),
      { params }
    )

    expect(res.status).toBe(400)
  })

  it('tabla sin migrar → 503 con hint', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ reg: null }] })

    const res = await POST(
      makeRequest({ formaPago: 'contado', garantiaPremium: true }),
      { params }
    )
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.error).toContain('create-venta-condiciones-pago.sql')
  })

  it('deal inexistente → 404', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ reg: 'venta_condiciones_pago' }] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await POST(
      makeRequest({ formaPago: 'contado', garantiaPremium: true }),
      { params }
    )

    expect(res.status).toBe(404)
  })
})
