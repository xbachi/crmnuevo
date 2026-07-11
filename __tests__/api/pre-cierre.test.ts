/**
 * @jest-environment node
 *
 * GET /api/admin/pre-cierre — pre-close checklist. Exercises one red case
 * and the all-green case, mocking pg query results in call order (matches
 * the sequence issued by the route: sinLog, sinExpediente, outbox, sinFecha,
 * sinImporte, colCheck, [gastos]).
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { GET } from '@/app/api/admin/pre-cierre/route'

const mockQuery = pool.query as jest.Mock
const ADMIN_SECRET = 'test-admin-secret'

function makeRequest(qs: string, secret: string | undefined = ADMIN_SECRET) {
  return new NextRequest(`http://localhost/api/admin/pre-cierre${qs}`, {
    headers: secret ? { 'x-admin-secret': secret } : {},
  })
}

describe('GET /api/admin/pre-cierre', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.ADMIN_SECRET = ADMIN_SECRET
  })

  afterEach(() => {
    delete process.env.ADMIN_SECRET
  })

  it('rejects requests without a valid X-Admin-Secret', async () => {
    const res = await GET(makeRequest('?quarter=1&year=2026', 'wrong'))
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('rejects an invalid quarter', async () => {
    const res = await GET(makeRequest('?quarter=5&year=2026'))
    expect(res.status).toBe(400)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('reports red items with evidence when there are gaps', async () => {
    mockQuery
      // facturasSinAutomationLog — 1 factura sin log
      .mockResolvedValueOnce({
        rows: [{ full_invoice_number: 'F-2026-0010', invoice_date: '2026-01-05', vehicle_plate: '1111AAA' }],
      })
      // facturasSinExpediente — misma factura, expediente no confirmado
      .mockResolvedValueOnce({
        rows: [{ full_invoice_number: 'F-2026-0010', invoice_date: '2026-01-05', vehicle_plate: '1111AAA' }],
      })
      // outboxPendientes — una fila agotada
      .mockResolvedValueOnce({
        rows: [{ id: 7, numero_factura: 'F-2026-0010', estado: 'agotado', intentos: 5, ultimo_error: 'timeout' }],
      })
      // registroSinFecha
      .mockResolvedValueOnce({ rows: [{ id: 1, proveedor: 'Movistar', numero_factura: null, nombre_archivo: 'x.pdf' }] })
      // registroSinImporte
      .mockResolvedValueOnce({ rows: [{ id: 2, proveedor: 'Nagini', numero_factura: 'N-1', nombre_archivo: 'y.pdf' }] })
      // colCheck — numero_canonico no existe
      .mockResolvedValueOnce({ rows: [] })

    const res = await GET(makeRequest('?quarter=1&year=2026'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(false)
    expect(body.resumen.bloqueantes.sort()).toEqual(
      [
        'facturasSinAutomationLog',
        'facturasSinExpediente',
        'outboxPendientes',
        'registroSinFecha',
        'registroSinImporte',
      ].sort()
    )
    expect(body.facturasSinAutomationLog).toMatchObject({ ok: false, count: 1 })
    expect(body.facturasSinExpediente).toMatchObject({ ok: false, count: 1 })
    expect(body.outboxPendientes).toMatchObject({ ok: false, count: 1 })
    expect(body.registroSinFecha).toMatchObject({ ok: false, count: 1 })
    expect(body.registroSinImporte).toMatchObject({ ok: false, count: 1 })
    // numero_canonico column absent → informativo, never blocking, marked not verifiable
    expect(body.gastoSinNumeroCanonico).toMatchObject({ ok: true, informativo: true, verificable: false })
  })

  it('reports all green when nothing is missing, and surfaces numero_canonico counts when the column exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // facturasSinAutomationLog
      .mockResolvedValueOnce({ rows: [] }) // facturasSinExpediente
      .mockResolvedValueOnce({ rows: [] }) // outboxPendientes
      .mockResolvedValueOnce({ rows: [] }) // registroSinFecha
      .mockResolvedValueOnce({ rows: [] }) // registroSinImporte
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // colCheck — numero_canonico existe
      .mockResolvedValueOnce({ rows: [] }) // gasto_facturas sin numero_canonico — ninguno

    const res = await GET(makeRequest('?quarter=2&year=2026'))
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.resumen).toEqual({ ok: true, bloqueantes: [] })
    expect(body.facturasSinAutomationLog).toMatchObject({ ok: true, count: 0 })
    expect(body.facturasSinExpediente).toMatchObject({ ok: true, count: 0 })
    expect(body.outboxPendientes).toMatchObject({ ok: true, count: 0 })
    expect(body.registroSinFecha).toMatchObject({ ok: true, count: 0 })
    expect(body.registroSinImporte).toMatchObject({ ok: true, count: 0 })
    expect(body.gastoSinNumeroCanonico).toMatchObject({ ok: true, informativo: true, verificable: true, count: 0 })
  })

  it('never lets gastoSinNumeroCanonico gaps become a bloqueante even when non-zero', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // colCheck exists
      .mockResolvedValueOnce({ rows: [{ id: 9, tipo: 'mecauto', numero_factura: 'M-1', vehiculo_id: 3 }] })

    const res = await GET(makeRequest('?quarter=3&year=2026'))
    const body = await res.json()

    expect(body.ok).toBe(true) // still ok — informativo doesn't block
    expect(body.resumen.bloqueantes).toEqual([])
    expect(body.gastoSinNumeroCanonico).toMatchObject({ ok: false, informativo: true, count: 1 })
  })
})
