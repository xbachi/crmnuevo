/**
 * @jest-environment node
 *
 * POST /api/admin/convertir-regimen — conversión de régimen (VAT↔REBU) EN EL
 * LUGAR, conservando el mismo número, sin rectificativa. pg + PDF + hooks
 * mockeados.
 *
 * Invariantes protegidos:
 *  - el `total_amount` NUNCA cambia (si cambiara → TOTAL_CAMBIARIA);
 *  - NO se inserta ni altera `facturacion_registros` (la cadena Verifactu-lite
 *    hashea el total, no la cuota, así que el eslabón sigue válido);
 *  - VAT→REBU exige precio de compra (SIN_PRECIO_COMPRA);
 *  - idempotente si ya está en el régimen destino.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { connect: jest.fn(), query: jest.fn() },
}))
// PDF + hooks best-effort fuera de la transacción: se mockean para aislar los
// invariantes fiscales.
jest.mock('@/lib/invoiceService', () => ({ generateAndAttachPdf: jest.fn() }))
jest.mock('@/lib/gestoriaWebhook', () => ({ notifyGestoriaInvoice: jest.fn() }))
jest.mock('@/lib/costoBeneficio', () => ({ resyncVehiculoRowToCB: jest.fn() }))
jest.mock('@/lib/expedientes', () => ({ recalcularExpediente: jest.fn() }))
// Módulo puro de importes: real por defecto, pero mockeable para forzar el
// guard del total (TOTAL_CAMBIARIA).
jest.mock('@/lib/invoiceConvertAmounts', () => {
  const actual = jest.requireActual('@/lib/invoiceConvertAmounts')
  return { ...actual, computeConvertedAmounts: jest.fn(actual.computeConvertedAmounts) }
})
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return { ...actual, after: jest.fn() }
})

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { generateAndAttachPdf } from '@/lib/invoiceService'
import { computeConvertedAmounts } from '@/lib/invoiceConvertAmounts'
import { POST } from '@/app/api/admin/convertir-regimen/route'

const mockedConnect = pool.connect as jest.Mock
const mockedPoolQuery = pool.query as jest.Mock
const mockedPdf = generateAndAttachPdf as jest.Mock
const mockedCompute = computeConvertedAmounts as jest.Mock

const SECRET = 'test-secret'

// F-2026-4233 (VW Taigo 3835LWT, deal 139, vehiculo 385) emitida con IVA.
const TAIGO_VAT = {
  id: 76,
  deal_id: 139,
  vehiculo_id: 385,
  b2b_venta_id: null,
  invoice_type: 'VAT',
  series: 'F-2026',
  number: 4233,
  full_invoice_number: 'F-2026-4233',
  invoice_date: '2026-06-20',
  status: 'ISSUED',
  vehicle_plate: '3835LWT',
  vehicle_make: 'Volkswagen',
  vehicle_model: 'Taigo',
  total_amount: '21760.00',
  taxable_base: '17983.47',
  vat_rate: '21',
  vat_amount: '3776.53',
  rebu_margin: null,
  rebu_taxable_base: null,
  rebu_vat_amount: null,
  rectifies_invoice_id: null,
  rectified_by_invoice_id: null,
  pdf_url: 'https://blob/old.pdf',
  pdf_storage_key: 'facturas/factura-F-2026-4233.pdf',
}

interface FakeOpts {
  invoice?: Record<string, unknown> | null
  precioCompra?: number | null
  /** filas devueltas por SELECT * FROM facturacion_registros. */
  registros?: unknown[]
}

function makeClient(opts: FakeOpts = {}) {
  const calls: { sql: string; params?: unknown[] }[] = []
  const invoice = opts.invoice === undefined ? TAIGO_VAT : opts.invoice

  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params })
    if (sql.includes('FROM invoices WHERE id = $1 FOR UPDATE')) {
      return { rows: invoice ? [invoice] : [] }
    }
    if (sql.includes('FROM "Vehiculo" WHERE id = $1')) {
      return { rows: [{ precioCompra: opts.precioCompra ?? null }] }
    }
    if (sql.includes('UPDATE invoices') && sql.includes('SET invoice_type')) {
      const [
        invoice_type,
        taxable_base,
        vat_rate,
        vat_amount,
        rebu_margin,
        rebu_taxable_base,
        rebu_vat_amount,
      ] = params as unknown[]
      return {
        rows: [
          {
            ...invoice,
            invoice_type,
            taxable_base,
            vat_rate,
            vat_amount,
            rebu_margin,
            rebu_taxable_base,
            rebu_vat_amount,
            status: 'ISSUED',
          },
        ],
      }
    }
    return { rows: [], rowCount: 1 }
  })

  return { client: { query, release: jest.fn() }, calls }
}

function req(body?: unknown, secret: string = SECRET) {
  return new NextRequest('http://localhost/api/admin/convertir-regimen', {
    method: 'POST',
    body: body != null ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json', 'x-admin-secret': secret },
  })
}

const num = (v: unknown) => (v == null ? null : Number(v))

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ADMIN_SECRET = SECRET
  mockedCompute.mockImplementation(
    jest.requireActual('@/lib/invoiceConvertAmounts').computeConvertedAmounts
  )
  // pool.query (post-commit, fuera del cliente de la transacción).
  mockedPoolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM facturacion_registros')) return { rows: [] }
    if (sql.includes("SET status = 'PDF_PENDING'")) {
      return { rows: [{ ...TAIGO_VAT, invoice_type: 'REBU', status: 'PDF_PENDING' }] }
    }
    return { rows: [], rowCount: 0 }
  })
  // PDF OK por defecto: devuelve la factura con pdf_url nuevo.
  mockedPdf.mockImplementation(async (inv) => ({
    invoice: { ...inv, pdf_url: 'https://blob/new.pdf' },
    pdf: new Uint8Array([1, 2, 3]),
  }))
})

describe('POST /api/admin/convertir-regimen', () => {
  it('401 sin secreto', async () => {
    const res = await POST(req({ invoiceId: 76, target: 'REBU', confirm: true }, 'malo'))
    expect(res.status).toBe(401)
    expect(mockedConnect).not.toHaveBeenCalled()
  })

  it('400 sin confirm:true', async () => {
    const { client } = makeClient()
    mockedConnect.mockResolvedValue(client)
    const res = await POST(req({ invoiceId: 76, target: 'REBU' }))
    expect(res.status).toBe(400)
  })

  it('VAT→REBU (Taigo): recalcula margen/base/cuota, total intacto, vat_* a NULL', async () => {
    const { client, calls } = makeClient({ precioCompra: 18500 })
    mockedConnect.mockResolvedValue(client)

    const res = await POST(req({ invoiceId: 76, target: 'REBU', confirm: true }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.sinCambios).toBe(false)
    expect(body.invoice.invoice_type).toBe('REBU')
    // total EXACTAMENTE igual.
    expect(Number(body.invoice.total)).toBe(21760)
    // margen 3260 · base 2694.21 · cuota 565.79.
    expect(num(body.invoice.rebu_margin)).toBe(3260)
    expect(num(body.invoice.rebu_taxable_base)).toBe(2694.21)
    expect(num(body.invoice.rebu_vat_amount)).toBe(565.79)
    // vat_* limpiado.
    expect(body.invoice.taxable_base).toBeNull()
    expect(body.invoice.vat_amount).toBeNull()
    // 3776.53 − 565.79 = 3210.74 (el sobrecoste de IVA que se corrige).
    expect(body.diferenciaIvaAntesDespues).toBe(3210.74)
    expect(body.cadenaOk).toBe(true)
    expect(body.pdfPendiente).toBe(false)

    const sqls = calls.map((c) => c.sql)
    expect(sqls.some((s) => s.includes('BEGIN'))).toBe(true)
    expect(sqls.some((s) => s.includes('COMMIT'))).toBe(true)
    expect(sqls.some((s) => s.includes('ROLLBACK'))).toBe(false)

    // UPDATE con el nuevo desglose (número/serie/total no aparecen en el SET).
    const upd = calls.find(
      (c) => c.sql.includes('UPDATE invoices') && c.sql.includes('SET invoice_type')
    )!
    expect(upd.sql).not.toContain('total_amount')
    expect(upd.sql).not.toContain('full_invoice_number')
    expect(upd.params).toEqual(['REBU', null, null, null, 3260, 2694.21, 565.79, 76])
  })

  it('NO inserta en facturacion_registros y la cadena sigue verificada', async () => {
    const { client, calls } = makeClient({ precioCompra: 18500 })
    mockedConnect.mockResolvedValue(client)

    const res = await POST(req({ invoiceId: 76, target: 'REBU', confirm: true }))
    const body = await res.json()

    expect(body.cadenaOk).toBe(true)
    // ni el cliente de la tx ni el pool insertan en la cadena.
    const clientInserts = calls.some((c) => c.sql.includes('INSERT INTO facturacion_registros'))
    const poolInserts = mockedPoolQuery.mock.calls.some((c) =>
      String(c[0]).includes('INSERT INTO facturacion_registros')
    )
    expect(clientInserts).toBe(false)
    expect(poolInserts).toBe(false)
    // sí se LEE la cadena para verificarla (read-only).
    expect(
      mockedPoolQuery.mock.calls.some((c) => String(c[0]).includes('FROM facturacion_registros'))
    ).toBe(true)
  })

  it('TOTAL_CAMBIARIA si el recálculo devolviera otro total → 409 y rollback', async () => {
    const { client, calls } = makeClient({ precioCompra: 18500 })
    mockedConnect.mockResolvedValue(client)
    mockedCompute.mockReturnValue({
      taxable_base: null,
      vat_rate: null,
      vat_amount: null,
      rebu_margin: 3260,
      rebu_taxable_base: 2694.21,
      rebu_vat_amount: 565.79,
      total_amount: 99999, // ≠ 21760 → invariante roto
      marginNoPositivo: false,
    })

    const res = await POST(req({ invoiceId: 76, target: 'REBU', confirm: true }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('TOTAL_CAMBIARIA')
    expect(calls.some((c) => c.sql.includes('ROLLBACK'))).toBe(true)
    // nunca llegó al UPDATE.
    expect(
      calls.some((c) => c.sql.includes('UPDATE invoices') && c.sql.includes('SET invoice_type'))
    ).toBe(false)
  })

  it('SIN_PRECIO_COMPRA si el vehículo no tiene precio de compra', async () => {
    const { client, calls } = makeClient({ precioCompra: null })
    mockedConnect.mockResolvedValue(client)

    const res = await POST(req({ invoiceId: 76, target: 'REBU', confirm: true }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('SIN_PRECIO_COMPRA')
    expect(calls.some((c) => c.sql.includes('ROLLBACK'))).toBe(true)
    expect(
      calls.some((c) => c.sql.includes('UPDATE invoices') && c.sql.includes('SET invoice_type'))
    ).toBe(false)
  })

  it('NO_CONVERTIBLE si la factura ya fue rectificada (RECTIFIED)', async () => {
    const { client, calls } = makeClient({
      invoice: { ...TAIGO_VAT, status: 'RECTIFIED', rectified_by_invoice_id: 999 },
    })
    mockedConnect.mockResolvedValue(client)

    const res = await POST(req({ invoiceId: 76, target: 'REBU', confirm: true }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('NO_CONVERTIBLE')
    expect(
      calls.some((c) => c.sql.includes('UPDATE invoices') && c.sql.includes('SET invoice_type'))
    ).toBe(false)
  })

  it('NO_CONVERTIBLE si es una rectificativa (RECTIFYING)', async () => {
    const { client } = makeClient({
      invoice: { ...TAIGO_VAT, invoice_type: 'RECTIFYING', total_amount: '-21760.00' },
    })
    mockedConnect.mockResolvedValue(client)
    const res = await POST(req({ invoiceId: 76, target: 'VAT', confirm: true }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('NO_CONVERTIBLE')
  })

  it('idempotente: convertir a REBU una ya-REBU → sinCambios, sin escrituras', async () => {
    const { client, calls } = makeClient({
      invoice: {
        ...TAIGO_VAT,
        invoice_type: 'REBU',
        taxable_base: null,
        vat_rate: null,
        vat_amount: null,
        rebu_margin: '3260.00',
      },
    })
    mockedConnect.mockResolvedValue(client)

    const res = await POST(req({ invoiceId: 76, target: 'REBU', confirm: true }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.sinCambios).toBe(true)
    expect(body.invoice.invoice_type).toBe('REBU')
    // no UPDATE, no COMMIT (rollback limpio), no PDF.
    expect(
      calls.some((c) => c.sql.includes('UPDATE invoices') && c.sql.includes('SET invoice_type'))
    ).toBe(false)
    expect(calls.some((c) => c.sql.includes('COMMIT'))).toBe(false)
    expect(mockedPdf).not.toHaveBeenCalled()
  })

  it('REBU→VAT: base = round2(T/1.21), cuota = T − base', async () => {
    const { client, calls } = makeClient({
      invoice: {
        ...TAIGO_VAT,
        invoice_type: 'REBU',
        taxable_base: null,
        vat_rate: null,
        vat_amount: null,
        rebu_margin: '3260.00',
        rebu_taxable_base: '2694.21',
        rebu_vat_amount: '565.79',
      },
    })
    mockedConnect.mockResolvedValue(client)

    const res = await POST(req({ invoiceId: 76, target: 'VAT', confirm: true }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.invoice.invoice_type).toBe('VAT')
    expect(Number(body.invoice.total)).toBe(21760)
    // 21760 / 1.21 = 17983.47 ; cuota = 3776.53.
    expect(num(body.invoice.taxable_base)).toBe(17983.47)
    expect(num(body.invoice.vat_amount)).toBe(3776.53)
    expect(body.invoice.rebu_margin).toBeNull()

    const upd = calls.find(
      (c) => c.sql.includes('UPDATE invoices') && c.sql.includes('SET invoice_type')
    )!
    expect(upd.params).toEqual(['VAT', 17983.47, 21, 3776.53, null, null, null, 76])
  })

  it('PDF falla → conversión commiteada igual, status PDF_PENDING', async () => {
    const { client, calls } = makeClient({ precioCompra: 18500 })
    mockedConnect.mockResolvedValue(client)
    mockedPdf.mockRejectedValue(new Error('blob down'))

    const res = await POST(req({ invoiceId: 76, target: 'REBU', confirm: true }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.pdfPendiente).toBe(true)
    expect(body.invoice.status).toBe('PDF_PENDING')
    // la conversión SÍ commiteó (la fila ya es REBU).
    expect(calls.some((c) => c.sql.includes('COMMIT'))).toBe(true)
    // se marcó PDF_PENDING fuera de la transacción.
    expect(
      mockedPoolQuery.mock.calls.some((c) => String(c[0]).includes("SET status = 'PDF_PENDING'"))
    ).toBe(true)
  })
})
