/**
 * @jest-environment node
 *
 * rectificarFactura: el PDF de la FR + el re-sellado de la original son
 * best-effort y van FUERA de la transacción. El archivado en OneDrive/gestoría
 * no puede estar en el camino crítico (deferNotifications + after()).
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}))
jest.mock('@/lib/invoiceService', () => ({ generateAndAttachPdf: jest.fn() }))
jest.mock('@/lib/gestoriaWebhook', () => ({ notifyGestoriaInvoice: jest.fn() }))
jest.mock('@/lib/facturacionRegistro', () => ({ appendRegistro: jest.fn() }))
jest.mock('@/lib/periodoLock', () => ({
  assertPeriodoAbierto: jest.fn(),
  PeriodoCerradoError: class extends Error {},
}))

import { pool } from '@/lib/direct-database'
import { generateAndAttachPdf } from '@/lib/invoiceService'
import { notifyGestoriaInvoice } from '@/lib/gestoriaWebhook'
import { rectificarFactura } from '@/lib/invoiceRectificativa'

const mockedConnect = pool.connect as jest.Mock
const mockedPoolQuery = pool.query as jest.Mock
const mockedPdf = generateAndAttachPdf as jest.Mock
const mockedGestoria = notifyGestoriaInvoice as jest.Mock

const ORIGINAL = {
  id: 23,
  deal_id: 10,
  invoice_type: 'REBU',
  status: 'ISSUED',
  full_invoice_number: 'R-2026-023',
  invoice_date: '2026-03-15',
  total_amount: '3373.00',
  taxable_base: null,
  vat_rate: null,
  vat_amount: null,
  vehicle_plate: '4321XYZ',
  vehicle_make: 'Seat',
  vehicle_model: 'Ibiza',
}
const ORIGINAL_RECTIFIED = { ...ORIGINAL, status: 'RECTIFIED', rectified_by_invoice_id: 90 }
const FR = {
  id: 90,
  invoice_type: 'RECTIFYING',
  status: 'PDF_PENDING',
  full_invoice_number: 'FR-2026-001',
  invoice_date: '2026-07-11',
  total_amount: '-3373.00',
  rectifies_invoice_id: 23,
  vehicle_plate: '4321XYZ',
  vehicle_make: 'Seat',
  vehicle_model: 'Ibiza',
  pdf_url: null,
}
const FR_ISSUED = { ...FR, status: 'ISSUED', pdf_url: 'https://blob/fr.pdf' }

function dispatcher(handlers: Array<[string, unknown]>) {
  return jest.fn(async (sql: string) => {
    for (const [match, result] of handlers) {
      if (sql.includes(match)) return result
    }
    return { rows: [], rowCount: 0 }
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockedConnect.mockResolvedValue({
    query: dispatcher([
      ['WHERE id = $1 FOR UPDATE', { rows: [ORIGINAL] }],
      ['WHERE rectifies_invoice_id = $1', { rows: [] }],
      ['FROM invoice_sequences', {
        rows: [
          { id: 3, series: 'FR', next_number: 1, number_format: '000', start_number: 1 },
        ],
      }],
      ['MAX(number) FILTER', { rows: [{ sys_max: null, abs_max: null }] }],
      ['INSERT INTO invoices (', { rows: [FR] }],
      ["SET status = 'RECTIFIED'", { rows: [ORIGINAL_RECTIFIED] }],
      ['to_regclass', { rows: [{ reg: null }] }],
    ]),
    release: jest.fn(),
  })
  mockedPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 })
  mockedPdf.mockImplementation(async (inv: { id: number }) =>
    inv.id === FR.id
      ? { invoice: FR_ISSUED, pdf: new Uint8Array([1, 2, 3]) }
      : {
          invoice: { ...ORIGINAL_RECTIFIED, pdf_url: 'https://blob/orig-anulada.pdf' },
          pdf: new Uint8Array([4, 5, 6]),
        }
  )
})

afterEach(() => jest.restoreAllMocks())

describe('rectificarFactura — PDF', () => {
  it('deja la rectificativa emitida CON PDF y re-sella la original como ANULADA', async () => {
    const res = await rectificarFactura({
      invoiceId: 23,
      motivo: 'Factura duplicada',
      deferNotifications: true,
    })

    expect(res.rectificativa.status).toBe('ISSUED')
    expect(res.rectificativa.pdf_url).toBe('https://blob/fr.pdf')
    // La original se regenera con el sello: la descarga del CRM sirve el blob.
    expect(mockedPdf).toHaveBeenCalledTimes(2)
    expect(res.original.pdf_url).toBe('https://blob/orig-anulada.pdf')
    expect(res.original.status).toBe('RECTIFIED')
  })

  it('el archivado en gestoría NO va en el camino crítico (after())', async () => {
    const res = await rectificarFactura({
      invoiceId: 23,
      motivo: 'Factura duplicada',
      deferNotifications: true,
    })

    expect(mockedGestoria).not.toHaveBeenCalled()
    expect(typeof res.runNotifications).toBe('function')

    await res.runNotifications!()
    expect(mockedGestoria).toHaveBeenCalledWith(
      expect.objectContaining({
        numeroFactura: 'FR-2026-001',
        tipo: 'RECTIFYING',
        pdfBase64: expect.any(String),
      })
    )
  })

  it('si el PDF falla, la rectificativa igual queda emitida (PDF_PENDING)', async () => {
    mockedPdf.mockRejectedValue(new Error('blob caído'))

    const res = await rectificarFactura({
      invoiceId: 23,
      motivo: 'Factura duplicada',
      deferNotifications: true,
    })

    expect(res.rectificativa.full_invoice_number).toBe('FR-2026-001')
    expect(res.rectificativa.status).toBe('PDF_PENDING')
    // Sin PDF no hay nada que archivar, pero tampoco lanza.
    await expect(res.runNotifications!()).resolves.toBeUndefined()
    expect(mockedGestoria).not.toHaveBeenCalled()
  })

  it('un webhook caído no rompe la rectificación', async () => {
    mockedGestoria.mockRejectedValue(new Error('n8n caído'))
    const res = await rectificarFactura({
      invoiceId: 23,
      motivo: 'Factura duplicada',
      deferNotifications: true,
    })
    await expect(res.runNotifications!()).resolves.toBeUndefined()
    expect(res.rectificativa.status).toBe('ISSUED')
  })
})
