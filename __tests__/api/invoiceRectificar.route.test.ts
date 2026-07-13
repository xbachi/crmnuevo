/**
 * @jest-environment node
 *
 * POST /api/invoices/[id]/rectificar — emisión de la rectificativa (serie FR)
 * que anula formalmente una factura mal emitida. pg + auth mockeados.
 *
 * Invariante que se protege acá: la original NO se borra ni cambia de importe;
 * conserva su número (cero huecos de numeración) y sólo pasa a RECTIFIED.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { connect: jest.fn(), query: jest.fn() },
}))
jest.mock('@/lib/auth-server', () => ({ readSessionFromRequest: jest.fn() }))
// El PDF de la FR (y el re-sellado de la original) son best-effort y viven
// fuera de la transacción: acá se mockean para aislar los invariantes fiscales.
jest.mock('@/lib/invoiceService', () => ({ generateAndAttachPdf: jest.fn() }))
jest.mock('@/lib/gestoriaWebhook', () => ({ notifyGestoriaInvoice: jest.fn() }))
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return { ...actual, after: jest.fn() }
})

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { generateAndAttachPdf } from '@/lib/invoiceService'
import { readSessionFromRequest } from '@/lib/auth-server'
import { POST } from '@/app/api/invoices/[id]/rectificar/route'

const mockedConnect = pool.connect as jest.Mock
const mockedSession = readSessionFromRequest as jest.Mock

const adminSession = { uid: 7, role: 'admin' as const, exp: 9999999999 }

const ORIGINAL_REBU = {
  id: 23,
  deal_id: 500,
  vehiculo_id: 90,
  b2b_venta_id: null,
  invoice_type: 'REBU',
  series: 'R-2026',
  number: 23,
  full_invoice_number: 'R-2026-023',
  invoice_date: '2026-05-12',
  status: 'ISSUED',
  total_amount: '9000.00',
  taxable_base: null,
  vat_rate: null,
  vat_amount: null,
  rectified_by_invoice_id: null,
}

interface FakeOpts {
  original?: Record<string, unknown> | null
  /** Fila devuelta por la búsqueda de rectificativa preexistente. */
  rectificativaExistente?: { id: number; full_invoice_number: string } | null
  /** Meses cerrados en periodos_contables. */
  periodoCerrado?: boolean
  /** Secuencia RECTIFYING activa. */
  seq?: Record<string, unknown> | null
}

function makeClient(opts: FakeOpts = {}) {
  const calls: { sql: string; params?: unknown[] }[] = []
  const original = opts.original === undefined ? ORIGINAL_REBU : opts.original
  const seq =
    opts.seq === undefined
      ? {
          id: 3,
          series: 'FR-2026',
          next_number: 1,
          number_format: '%03d',
          start_number: 1,
        }
      : opts.seq

  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params })

    if (sql.includes('FROM invoices WHERE id = $1 FOR UPDATE')) {
      return { rows: original ? [original] : [] }
    }
    if (sql.includes('WHERE rectifies_invoice_id = $1')) {
      return { rows: opts.rectificativaExistente ? [opts.rectificativaExistente] : [] }
    }
    if (sql.includes("to_regclass('public.periodos_contables')")) {
      return { rows: [{ t: 'periodos_contables' }] }
    }
    if (sql.includes('FROM periodos_contables')) {
      return { rows: opts.periodoCerrado ? [{ '?column?': 1 }] : [] }
    }
    if (sql.includes('FROM invoice_sequences')) {
      return { rows: seq ? [seq] : [] }
    }
    // resolveNextNumber: serie FR vacía → sin sysMax, sin quemados
    if (sql.includes('AS sys_max')) {
      return { rows: [{ sys_max: null, abs_max: null }] }
    }
    if (sql.includes('FROM invoice_deletion_logs')) {
      return { rows: [] }
    }
    if (sql.includes('INSERT INTO invoices')) {
      return {
        rows: [
          {
            id: 999,
            invoice_type: 'RECTIFYING',
            series: 'FR-2026',
            number: 1,
            full_invoice_number: 'FR-2026-001',
            invoice_date: '2026-06-01',
            status: 'PDF_PENDING',
            total_amount: '-9000.00',
          },
        ],
      }
    }
    if (sql.includes("SET status = 'RECTIFIED'")) {
      return {
        rows: [{ ...original, status: 'RECTIFIED', rectified_by_invoice_id: 999 }],
      }
    }
    if (sql.includes('FROM facturacion_registros')) {
      return { rows: [{ hash_actual: 'hash-previo' }] }
    }
    if (sql.includes("to_regclass('public.expedientes')")) {
      return { rows: [{ reg: 'expedientes' }] }
    }
    return { rows: [], rowCount: 1 }
  })

  return { client: { query, release: jest.fn() }, calls }
}

function req(body?: unknown) {
  return new NextRequest('http://localhost/api/invoices/23/rectificar', {
    method: 'POST',
    body: body != null ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json' },
  })
}

const params = { params: Promise.resolve({ id: '23' }) }

beforeEach(() => {
  jest.clearAllMocks()
  mockedSession.mockReturnValue(adminSession)
  ;(pool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 })
  ;(generateAndAttachPdf as jest.Mock).mockImplementation(async (inv) => ({
    invoice: { ...inv, status: inv.status === 'PDF_PENDING' ? 'ISSUED' : inv.status, pdf_url: 'https://blob/x.pdf' },
    pdf: new Uint8Array([1, 2, 3]),
  }))
})

describe('POST /api/invoices/[id]/rectificar', () => {
  it('403 si el usuario no es admin', async () => {
    mockedSession.mockReturnValue({ uid: 2, role: 'user', exp: 9999999999 })
    const res = await POST(req({ motivo: 'factura duplicada' }), params)
    expect(res.status).toBe(403)
    expect(mockedConnect).not.toHaveBeenCalled()
  })

  it('400 MOTIVO_REQUERIDO si no se manda motivo', async () => {
    const { client } = makeClient()
    mockedConnect.mockResolvedValue(client)
    const res = await POST(req({}), params)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('MOTIVO_REQUERIDO')
  })

  it('emite la FR con importe negativo, marca la original RECTIFIED y encadena los registros', async () => {
    const { client, calls } = makeClient()
    mockedConnect.mockResolvedValue(client)

    const res = await POST(req({ motivo: 'factura duplicada' }), params)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.rectificativa.full_invoice_number).toBe('FR-2026-001')
    expect(Number(body.rectificativa.total_amount)).toBe(-9000)
    expect(body.original.status).toBe('RECTIFIED')
    // La FR sale con PDF (best-effort, fuera de la tx).
    expect(body.pdf_pendiente).toBe(false)
    expect(body.rectificativa.pdf_url).toBe('https://blob/x.pdf')

    const sqls = calls.map((c) => c.sql)
    expect(sqls.some((s) => s.includes('BEGIN'))).toBe(true)
    expect(sqls.some((s) => s.includes('COMMIT'))).toBe(true)
    expect(sqls.some((s) => s.includes('ROLLBACK'))).toBe(false)

    // La rectificativa se inserta con importe negativo y apuntando a la original.
    const insert = calls.find((c) => c.sql.includes('INSERT INTO invoices'))!
    expect(insert.sql).toContain("'RECTIFYING'")
    expect(insert.sql).toContain('rectifies_invoice_id')
    expect(insert.params).toContain(-9000) // total_amount
    expect(insert.params![0]).toBe(23) // o.id = la original

    // La original NO se borra ni se le toca el número/importe: sólo el estado.
    expect(sqls.some((s) => s.includes('DELETE FROM invoices'))).toBe(false)
    const upd = calls.find((c) => c.sql.includes("SET status = 'RECTIFIED'"))!
    expect(upd.sql).not.toContain('number')
    expect(upd.sql).not.toContain('total_amount')
    expect(upd.params).toEqual([999, 23])

    // La secuencia FR sólo avanza su high-water mark (no se libera ni reusa
    // ningún número de la serie original).
    const seqUpd = calls.find((c) => c.sql.includes('UPDATE invoice_sequences'))!
    expect(seqUpd.params).toEqual([2, 3])

    // Cadena Verifactu-lite: alta de la FR + anulación de la original, ambas
    // dentro de la transacción.
    const registros = calls.filter((c) => c.sql.includes('INSERT INTO facturacion_registros'))
    expect(registros).toHaveLength(2)
    expect(registros[0].params).toContain('alta')
    expect(registros[0].params).toContain('FR-2026-001')
    expect(registros[0].params).toContain('-9000.00')
    expect(registros[1].params).toContain('anulacion')
    expect(registros[1].params).toContain('R-2026-023')

    // Expediente anulado + Deal revertido para poder re-facturar.
    const exp = calls.find((c) => c.sql.includes('UPDATE expedientes'))!
    expect(exp.sql).toContain("estado = 'anulado'")
    expect(exp.params).toEqual(['R-2026-023'])
    expect(sqls.some((s) => s.includes('UPDATE "Deal"'))).toBe(true)
  })

  it('rectificar dos veces → 409 con el número de la FR existente, sin crear una segunda', async () => {
    const { client, calls } = makeClient({
      original: { ...ORIGINAL_REBU, status: 'RECTIFIED', rectified_by_invoice_id: 999 },
    })
    mockedConnect.mockResolvedValue(client)

    const res = await POST(req({ motivo: 'otra vez' }), params)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('ALREADY_RECTIFIED')
    expect(calls.some((c) => c.sql.includes('INSERT INTO invoices'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('ROLLBACK'))).toBe(true)
  })

  it('409 ALREADY_RECTIFIED (con número) si la FR existe aunque la original no esté marcada', async () => {
    const { client, calls } = makeClient({
      rectificativaExistente: { id: 999, full_invoice_number: 'FR-2026-001' },
    })
    mockedConnect.mockResolvedValue(client)

    const res = await POST(req({ motivo: 'reintento' }), params)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('ALREADY_RECTIFIED')
    expect(body.rectificativaNumero).toBe('FR-2026-001')
    expect(calls.some((c) => c.sql.includes('INSERT INTO invoices'))).toBe(false)
  })

  it('no se puede rectificar una rectificativa', async () => {
    const { client, calls } = makeClient({
      original: {
        ...ORIGINAL_REBU,
        invoice_type: 'RECTIFYING',
        full_invoice_number: 'FR-2026-001',
        total_amount: '-9000.00',
      },
    })
    mockedConnect.mockResolvedValue(client)

    const res = await POST(req({ motivo: 'me equivoqué otra vez' }), params)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('NOT_RECTIFIABLE')
    expect(calls.some((c) => c.sql.includes('INSERT INTO invoices'))).toBe(false)
  })

  it('período contable cerrado → 409 PERIODO_CERRADO y rollback', async () => {
    const { client, calls } = makeClient({ periodoCerrado: true })
    mockedConnect.mockResolvedValue(client)

    const res = await POST(req({ motivo: 'factura duplicada' }), params)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('PERIODO_CERRADO')
    expect(calls.some((c) => c.sql.includes('INSERT INTO invoices'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('ROLLBACK'))).toBe(true)
  })

  it('404 si la factura no existe', async () => {
    const { client } = makeClient({ original: null })
    mockedConnect.mockResolvedValue(client)
    const res = await POST(req({ motivo: 'factura duplicada' }), params)
    expect(res.status).toBe(404)
  })

  it('sin serie FR configurada → 500 NO_SEQUENCE (migración pendiente)', async () => {
    const { client, calls } = makeClient({ seq: null })
    mockedConnect.mockResolvedValue(client)
    const res = await POST(req({ motivo: 'factura duplicada' }), params)
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('NO_SEQUENCE')
    expect(calls.some((c) => c.sql.includes('INSERT INTO invoices'))).toBe(false)
  })
})
