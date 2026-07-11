/**
 * @jest-environment node
 *
 * C-02 fix: an ISSUED invoice must never be hard-deleted (that's what freed
 * F-2026-4236 and R-2026-027 for reuse and produced two documents sharing the
 * same fiscal number). DELETE is now only for PDF_PENDING/ERROR rows that
 * never went out; ISSUED invoices go through /anular (VOID, keeps row+number).
 *
 * Mocks pg + auth so this runs as a pure unit test (no DB, no cookies).
 */

jest.mock('@/lib/direct-database', () => ({ pool: { connect: jest.fn(), query: jest.fn() } }))
jest.mock('@vercel/blob', () => ({ del: jest.fn(), put: jest.fn() }))
jest.mock('@/lib/auth-server', () => ({ readSessionFromRequest: jest.fn() }))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { readSessionFromRequest } from '@/lib/auth-server'
import { DELETE } from '@/app/api/invoices/[id]/route'
import { POST as anularPOST } from '@/app/api/invoices/[id]/anular/route'

const mockedConnect = pool.connect as jest.Mock
const mockedSession = readSessionFromRequest as jest.Mock

function makeClient(invoiceRow: Record<string, unknown> | null) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('SELECT * FROM invoices WHERE id = $1 FOR UPDATE')) {
      return { rows: invoiceRow ? [invoiceRow] : [] }
    }
    return { rows: [], rowCount: 1 }
  })
  return { query, release: jest.fn() }
}

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/invoices/1', {
    method,
    body: body != null ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json' },
  })
}

const adminSession = { uid: 1, role: 'admin' as const, exp: 9999999999 }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('DELETE /api/invoices/[id] — ISSUED is not deletable', () => {
  it('403s when the caller is not an admin', async () => {
    mockedSession.mockReturnValue(null)
    const res = await DELETE(req('DELETE'), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(403)
    expect(mockedConnect).not.toHaveBeenCalled()
  })

  it('409s with ISSUED_NOT_DELETABLE for an ISSUED invoice, and rolls back', async () => {
    mockedSession.mockReturnValue(adminSession)
    const client = makeClient({
      id: 24,
      status: 'ISSUED',
      full_invoice_number: 'R-2026-024',
      pdf_storage_key: 'factura-R-2026-024.pdf',
      deal_id: 144,
      series: 'R',
      number: 24,
      invoice_type: 'REBU',
      total_amount: '3373.00',
    })
    mockedConnect.mockResolvedValue(client)

    const res = await DELETE(req('DELETE'), { params: Promise.resolve({ id: '24' }) })
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.code).toBe('ISSUED_NOT_DELETABLE')
    const calls = client.query.mock.calls.map((c) => String(c[0]))
    expect(calls.some((sql) => sql.trim().startsWith('ROLLBACK'))).toBe(true)
    // Never reaches the deletion log insert or the row delete.
    expect(calls.some((sql) => sql.includes('DELETE FROM invoices'))).toBe(false)
  })

  it('allows deleting a PDF_PENDING invoice (never actually issued)', async () => {
    mockedSession.mockReturnValue(adminSession)
    const client = makeClient({
      id: 30,
      status: 'PDF_PENDING',
      full_invoice_number: 'R-2026-030',
      pdf_storage_key: null,
      deal_id: 150,
      series: 'R',
      number: 30,
      invoice_type: 'REBU',
      total_amount: '5000.00',
    })
    mockedConnect.mockResolvedValue(client)

    const res = await DELETE(req('DELETE'), { params: Promise.resolve({ id: '30' }) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.deleted).toBe(true)
    const calls = client.query.mock.calls.map((c) => String(c[0]))
    expect(calls.some((sql) => sql.includes('INSERT INTO invoice_deletion_logs'))).toBe(true)
    expect(calls.some((sql) => sql.includes('DELETE FROM invoices'))).toBe(true)
    expect(calls.some((sql) => sql.trim().startsWith('COMMIT'))).toBe(true)
  })
})

describe('POST /api/invoices/[id]/anular — VOID keeps the row and the number', () => {
  it('403s when the caller is not an admin', async () => {
    mockedSession.mockReturnValue({ uid: 2, role: 'asesor', exp: 9999999999 })
    const res = await anularPOST(req('POST', {}), { params: Promise.resolve({ id: '23' }) })
    expect(res.status).toBe(403)
    expect(mockedConnect).not.toHaveBeenCalled()
  })

  it('voids an ISSUED invoice, logs the audit trail, and reverts the Deal', async () => {
    mockedSession.mockReturnValue(adminSession)
    const client = makeClient({
      id: 23,
      status: 'ISSUED',
      full_invoice_number: 'R-2026-023',
      deal_id: 143,
      series: 'R',
      number: 23,
      invoice_type: 'REBU',
      total_amount: '3373.00',
    })
    mockedConnect.mockResolvedValue(client)

    const res = await anularPOST(req('POST', { reason: 'Duplicada del mismo vehículo' }), {
      params: Promise.resolve({ id: '23' }),
    })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.voided).toBe(true)
    expect(json.full_invoice_number).toBe('R-2026-023')

    const calls = client.query.mock.calls.map((c) => String(c[0]))
    expect(calls.some((sql) => sql.includes("SET status = 'VOIDED'"))).toBe(true)
    expect(calls.some((sql) => sql.includes('invoice_audit_logs'))).toBe(true)
    expect(calls.some((sql) => sql.includes('UPDATE "Deal"'))).toBe(true)
    expect(calls.some((sql) => sql.includes('DELETE FROM invoices'))).toBe(false)
    expect(calls.some((sql) => sql.trim().startsWith('COMMIT'))).toBe(true)
  })

  it('409s when the invoice is already VOIDED', async () => {
    mockedSession.mockReturnValue(adminSession)
    const client = makeClient({
      id: 23,
      status: 'VOIDED',
      full_invoice_number: 'R-2026-023',
      deal_id: 143,
    })
    mockedConnect.mockResolvedValue(client)

    const res = await anularPOST(req('POST', {}), { params: Promise.resolve({ id: '23' }) })
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.code).toBe('ALREADY_VOIDED')
  })
})
