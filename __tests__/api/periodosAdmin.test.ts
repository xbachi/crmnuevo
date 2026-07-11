/**
 * @jest-environment node
 *
 * POST /api/admin/periodos/cerrar y /reabrir — validaciones y snapshot.
 * pg mockeado (unit, sin DB).
 */

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { POST as cerrar } from '@/app/api/admin/periodos/cerrar/route'
import { POST as reabrir } from '@/app/api/admin/periodos/reabrir/route'

const mockQuery = pool.query as jest.Mock
const ADMIN_SECRET = 'test-admin-secret'

function makeRequest(path: string, body: Record<string, unknown>, secret = ADMIN_SECRET) {
  return new NextRequest(`http://localhost/api/admin/periodos/${path}`, {
    method: 'POST',
    headers: { 'x-admin-secret': secret, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.resetAllMocks()
  process.env.ADMIN_SECRET = ADMIN_SECRET
})

afterEach(() => {
  delete process.env.ADMIN_SECRET
})

describe('POST /api/admin/periodos/cerrar', () => {
  it('sin X-Admin-Secret válido → 401', async () => {
    const res = await cerrar(makeRequest('cerrar', { anio: 2026, mes: 4, confirm: true }, 'wrong'))
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('sin confirm: true → 400, sin tocar la DB', async () => {
    const res = await cerrar(makeRequest('cerrar', { anio: 2026, mes: 4 }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('CONFIRM_REQUERIDO')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('mes inválido → 400', async () => {
    const res = await cerrar(makeRequest('cerrar', { anio: 2026, mes: 13, confirm: true }))
    expect(res.status).toBe(400)
  })

  it('ya cerrado → 409', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ t: 'periodos_contables' }] }) // to_regclass
      .mockResolvedValueOnce({ rows: [{ estado: 'cerrado' }] }) // existing
    const res = await cerrar(makeRequest('cerrar', { anio: 2026, mes: 4, confirm: true }))
    expect(res.status).toBe(409)
  })

  it('cierra y guarda snapshot con totales del mes', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ t: 'periodos_contables' }] }) // to_regclass
      .mockResolvedValueOnce({ rows: [] }) // existing
      .mockResolvedValueOnce({ rows: [{ n: 3, suma: '45000.00' }] }) // emitidas
      .mockResolvedValueOnce({
        rows: [
          { categoria: 'coche-servicio', n: 5, suma: '1200.50' },
          { categoria: 'gestoria', n: 2, suma: '300.00' },
        ],
      }) // registro por categoría
      .mockResolvedValueOnce({ rows: [{ n: 4, suma: '900.00' }] }) // gastos
      .mockResolvedValueOnce({
        rows: [{ id: 1, anio: 2026, mes: 4, estado: 'cerrado' }],
      }) // upsert
    const res = await cerrar(
      makeRequest('cerrar', { anio: 2026, mes: 4, confirm: true, usuario: 'seb' })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.periodo.estado).toBe('cerrado')

    const upsert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO periodos_contables')
    )
    expect(upsert).toBeDefined()
    const snapshot = JSON.parse(upsert![1][2])
    expect(snapshot.facturas_emitidas).toEqual({ count: 3, suma: 45000 })
    expect(snapshot.facturas_registro).toEqual([
      { categoria: 'coche-servicio', count: 5, suma: 1200.5 },
      { categoria: 'gestoria', count: 2, suma: 300 },
    ])
    expect(snapshot.gastos).toEqual({ count: 4, suma: 900 })
    expect(upsert![1][3]).toBe('seb')
  })
})

describe('POST /api/admin/periodos/reabrir', () => {
  it('sin motivo → 400, sin tocar la DB', async () => {
    const res = await reabrir(makeRequest('reabrir', { anio: 2026, mes: 4 }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('MOTIVO_REQUERIDO')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('motivo vacío (espacios) → 400', async () => {
    const res = await reabrir(makeRequest('reabrir', { anio: 2026, mes: 4, motivo: '   ' }))
    expect(res.status).toBe(400)
  })

  it('período no cerrado → 409', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await reabrir(
      makeRequest('reabrir', { anio: 2026, mes: 4, motivo: 'factura tardía proveedor' })
    )
    expect(res.status).toBe(409)
  })

  it('reabre persistiendo motivo y usuario', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, anio: 2026, mes: 4, estado: 'abierto', motivo_reapertura: 'factura tardía proveedor' }],
    })
    const res = await reabrir(
      makeRequest('reabrir', { anio: 2026, mes: 4, motivo: 'factura tardía proveedor', usuario: 'seb' })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.periodo.motivo_reapertura).toBe('factura tardía proveedor')
    expect(mockQuery.mock.calls[0][1]).toEqual([2026, 4, 'seb', 'factura tardía proveedor'])
  })
})
