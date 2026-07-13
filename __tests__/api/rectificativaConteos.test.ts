/**
 * @jest-environment node
 *
 * Semántica de los conteos OPERATIVOS frente a una rectificación:
 * una venta duplicada no es una venta. Ni la factura original anulada
 * (status RECTIFIED) ni la rectificativa (invoice_type RECTIFYING) cuentan
 * como coche vendido en /comisiones ni como expediente pendiente en el
 * chequeo de gestoría.
 *
 * (El libro IVA hace lo contrario a propósito — incluye las dos y netean a
 * cero: ver __tests__/api/gestoriaLibro.test.ts.)
 */

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/googleSheets', () => ({ getGoogleSheetsAuth: jest.fn(async () => ({})) }))
jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({
      spreadsheets: { values: { get: jest.fn(async () => ({ data: { values: [] } })) } },
    })),
  },
}))
jest.mock('@/lib/auth-server', () => ({
  readSessionFromRequest: jest.fn(() => ({ uid: 1, role: 'admin', exp: 9999999999 })),
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { GET as comisionesGET } from '@/app/api/comisiones/route'
import { GET as chequeoGET } from '@/app/api/gestoria/chequeo-expedientes/route'

const mockQuery = pool.query as jest.Mock

/** La query de facturas de un route, con su SQL y sus parámetros. */
function invoicesCall(calls: [string, unknown[]?][]) {
  return calls.find(([sql]) => /FROM invoices/i.test(sql))!
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('/api/comisiones — ventas del mes', () => {
  it('no cuenta la factura RECTIFIED ni la RECTIFYING', async () => {
    const calls: [string, unknown[]?][] = []
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params])
      if (sql.includes("to_regclass('public.comision_config')")) return { rows: [{ reg: null }] }
      if (sql.includes("to_regclass('public.venta_condiciones_pago')"))
        return { rows: [{ reg: null }] }
      if (sql.includes('FROM invoices')) return { rows: [] }
      return { rows: [] }
    })

    const res = await comisionesGET(
      new NextRequest('http://localhost/api/comisiones?year=2026&month=6')
    )
    expect(res.status).toBe(200)

    const [sql, params] = invoicesCall(calls)
    // La rectificativa se excluye por tipo…
    expect(sql).toContain("invoice_type <> 'RECTIFYING'")
    // …y la original anulada por estado: RECTIFIED no está entre los activos.
    const estados = params![0] as string[]
    expect(estados).toEqual(['ISSUED', 'IMPORTED', 'PDF_PENDING'])
    expect(estados).not.toContain('RECTIFIED')
  })
})

describe('/api/gestoria/chequeo-expedientes — facturas activas del trimestre', () => {
  it('no exige expediente ni carpeta para la RECTIFIED ni para la RECTIFYING', async () => {
    const calls: [string, unknown[]?][] = []
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params])
      if (sql.includes('FROM invoices')) return { rows: [] }
      if (sql.includes('to_regclass')) return { rows: [{ reg: null }] }
      return { rows: [] }
    })

    process.env.ADMIN_SECRET = 'secreto-test'
    const res = await chequeoGET(
      new NextRequest('http://localhost/api/gestoria/chequeo-expedientes?year=2026&quarter=2', {
        headers: { 'x-admin-secret': 'secreto-test' },
      })
    )
    delete process.env.ADMIN_SECRET
    expect(res.status).toBe(200)

    const [sql, params] = invoicesCall(calls)
    expect(sql).toContain("invoice_type <> 'RECTIFYING'")
    const estados = params![0] as string[]
    expect(estados).not.toContain('RECTIFIED')
  })
})
