/**
 * @jest-environment node
 *
 * POST /api/vehiculos/gasto — dedup por nº canónico y abonos.
 * pg y el resync a Sheets van mockeados (unit, sin DB).
 */
import type { NextRequest } from 'next/server'

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/costoBeneficio', () => ({
  resyncVehiculoRowToCB: jest.fn().mockResolvedValue({ action: 'noop', detail: 'test' }),
}))

import { POST } from '@/app/api/vehiculos/gasto/route'
import { pool } from '@/lib/direct-database'
import { resyncVehiculoRowToCB } from '@/lib/costoBeneficio'

const mockQuery = pool.query as unknown as jest.Mock
const mockResync = resyncVehiculoRowToCB as unknown as jest.Mock

const SECRET = 'test-secret'
process.env.N8N_INVOICE_WEBHOOK_SECRET = SECRET

function makeReq(body: Record<string, unknown>): NextRequest {
  return {
    url: 'http://localhost/api/vehiculos/gasto',
    headers: { get: (k: string) => (k.toLowerCase() === 'x-webhook-secret' ? SECRET : null) },
    json: async () => body,
  } as unknown as NextRequest
}

const DUP_ROW = {
  id: 123,
  numero_factura: '6935KYC-mecauto-factura-mecauto-6935KYC-Fra-FC26179',
  importe: '277.88',
  matricula: '6935KYC',
  tipo: 'mecauto',
  created_at: '2026-04-01T10:00:00.000Z',
}

/** Mock de pool.query que despacha por el SQL. */
function setupQueries({ dupRow }: { dupRow?: typeof DUP_ROW } = {}) {
  mockQuery.mockReset()
  mockResync.mockClear()
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM "Vehiculo"')) return { rows: [{ id: 392, matricula: '6935KYC' }] }
    if (sql.includes('numero_canonico = $2')) return { rows: dupRow ? [dupRow] : [] }
    if (sql.includes('INSERT INTO gasto_facturas')) return { rows: [] }
    if (sql.includes('SUM(importe)')) return { rows: [{ total: '277.88' }] }
    if (sql.includes('UPDATE "Vehiculo"')) return { rows: [] }
    throw new Error(`SQL inesperado en test: ${sql}`)
  })
}

const insertCalls = () => mockQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO gasto_facturas'))

const BODY_BASE = {
  matricula: '6935KYC',
  tipo: 'mecauto',
  importe: 277.88,
  // mismo nº real (FC26-179) que DUP_ROW pero con OTRO filename
  numeroFactura: '6935KYC-mecauto-factura-mecauto-FC26-179-HIUNDAY-KONA-6935KYC',
  proveedor: 'mecauto',
}

describe('POST /api/vehiculos/gasto — dedup por numero_canonico', () => {
  it('misma factura con otro filename → 409 duplicado, sin INSERT y sin resync', async () => {
    setupQueries({ dupRow: DUP_ROW })
    const res = await POST(makeReq(BODY_BASE))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.duplicado).toBe(true)
    expect(json.numeroCanonico).toBe('FC26-179')
    expect(json.existente).toMatchObject({ id: 123, importe: 277.88, matricula: '6935KYC' })
    expect(insertCalls()).toHaveLength(0)
    expect(mockResync).not.toHaveBeenCalled()
  })

  it('allowDuplicado: true → inserta (con numero_canonico) sin chequear duplicado', async () => {
    setupQueries({ dupRow: DUP_ROW })
    const res = await POST(makeReq({ ...BODY_BASE, allowDuplicado: true }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    const inserts = insertCalls()
    expect(inserts).toHaveLength(1)
    expect(inserts[0][1][4]).toBe('FC26-179') // param numero_canonico
  })

  it('sin duplicado existente → inserta y guarda numero_canonico', async () => {
    setupQueries()
    const res = await POST(makeReq(BODY_BASE))
    expect(res.status).toBe(200)
    const inserts = insertCalls()
    expect(inserts).toHaveLength(1)
    expect(inserts[0][1][4]).toBe('FC26-179')
    expect(mockResync).toHaveBeenCalledWith(392, 'CB 2026')
  })

  it('filename sin nº extraíble (canónico null) → no chequea duplicado e inserta con null', async () => {
    setupQueries()
    const res = await POST(makeReq({ ...BODY_BASE, numeroFactura: '5131MBM-mecauto-factura-mecauto' }))
    expect(res.status).toBe(200)
    const inserts = insertCalls()
    expect(inserts).toHaveLength(1)
    expect(inserts[0][1][4]).toBeNull()
    // ninguna query de duplicado
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('numero_canonico = $2'))).toBe(false)
  })
})

describe('POST /api/vehiculos/gasto — abonos (importe negativo)', () => {
  it('importe negativo sin esAbono → 422 y no toca la DB', async () => {
    setupQueries()
    const res = await POST(makeReq({ ...BODY_BASE, importe: -50 }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toContain('esAbono')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('importe negativo con esAbono: true → inserta el negativo', async () => {
    setupQueries()
    const res = await POST(makeReq({ ...BODY_BASE, importe: -50, esAbono: true }))
    expect(res.status).toBe(200)
    const inserts = insertCalls()
    expect(inserts).toHaveLength(1)
    expect(inserts[0][1][5]).toBe(-50) // param importe
  })

  it('abono fuera de rango en valor absoluto → 422 (guarda de rango con abs)', async () => {
    setupQueries()
    const res = await POST(makeReq({ ...BODY_BASE, importe: -9000, esAbono: true }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('importe fuera de rango')
  })
})
