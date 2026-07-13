/**
 * issueInvoice({ deferNotifications: true }) NO debe esperar al webhook de
 * gestoría ni a la hoja de costo/beneficio: el PDF y el blob sí van inline
 * (el usuario descarga la factura enseguida), las notificaciones no.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}))
jest.mock('@vercel/blob', () => ({ put: jest.fn(), del: jest.fn() }))
jest.mock('@/lib/contractGenerator', () => ({ generarFactura: jest.fn() }))
jest.mock('@/lib/gestoriaWebhook', () => ({ notifyGestoriaInvoice: jest.fn() }))
jest.mock('@/lib/costoBeneficio', () => ({ notifyCostoBeneficio: jest.fn() }))

import { pool } from '@/lib/direct-database'
import { put } from '@vercel/blob'
import { generarFactura } from '@/lib/contractGenerator'
import { notifyGestoriaInvoice } from '@/lib/gestoriaWebhook'
import { notifyCostoBeneficio } from '@/lib/costoBeneficio'
import { issueInvoice } from '@/lib/invoiceService'

const mockedPoolQuery = pool.query as jest.Mock
const mockedConnect = pool.connect as jest.Mock
const mockedGestoria = notifyGestoriaInvoice as jest.Mock
const mockedCostoBeneficio = notifyCostoBeneficio as jest.Mock

function dispatcher(handlers: Array<[string, unknown]>) {
  return jest.fn(async (sql: string) => {
    for (const [match, result] of handlers) {
      if (sql.includes(match)) return result
    }
    return { rows: [], rowCount: 0 }
  })
}

const INSERTED = {
  id: 99,
  deal_id: 150,
  full_invoice_number: 'R-2026-031',
  status: 'PDF_PENDING',
}
const ISSUED = { ...INSERTED, status: 'ISSUED', pdf_url: 'https://blob/f.pdf' }

const SALE_ROW = {
  id: 150,
  numero: 'D-150',
  importeTotal: '9000.00',
  fechaVentaFirmada: null,
  cliente_nombre: 'Cliente',
  cliente_apellidos: 'Uno',
  cliente_dni: '11111111A',
  cliente_telefono: null,
  cliente_email: null,
  cliente_direccion: null,
  cliente_ciudad: null,
  cliente_provincia: null,
  vehiculo_id: 700,
  marca: 'Opel',
  modelo: 'Corsa',
  matricula: '1234ABC',
  bastidor: 'VIN-1',
  kms: 50000,
  vehiculo_anio: 2018,
  fechaMatriculacion: null,
  precioPublicacion: 9000,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  ;(generarFactura as jest.Mock).mockResolvedValue(new Uint8Array([1, 2, 3]))
  ;(put as jest.Mock).mockResolvedValue({
    url: 'https://blob/f.pdf',
    pathname: 'f.pdf',
  })
  mockedConnect.mockResolvedValue({
    query: dispatcher([
      [
        'FROM invoice_sequences',
        {
          rows: [
            { id: 1, series: 'R', next_number: 31, number_format: '000', start_number: 23 },
          ],
        },
      ],
      ['MAX(number) FILTER', { rows: [{ sys_max: 30, abs_max: 30 }] }],
      ['INSERT INTO invoices (', { rows: [INSERTED] }],
    ]),
    release: jest.fn(),
  })
  mockedPoolQuery.mockImplementation(
    dispatcher([
      ['deal_id = $1 AND invoice_type = $2', { rows: [] }],
      ['FROM "Deal" d', { rows: [SALE_ROW] }],
      ['vehiculo_id = $1', { rows: [] }], // sin conflicto de vehículo
      ['SET pdf_url = $1', { rows: [ISSUED] }],
    ])
  )
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('issueInvoice — deferNotifications', () => {
  it('devuelve la factura ISSUED sin esperar las notificaciones lentas', async () => {
    let webhookDone = false
    let sheetsDone = false
    mockedGestoria.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 2000))
      webhookDone = true
    })
    mockedCostoBeneficio.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 2000))
      sheetsDone = true
    })

    const started = Date.now()
    const result = await issueInvoice({
      dealId: 150,
      invoiceType: 'REBU',
      deferNotifications: true,
    })
    const elapsed = Date.now() - started

    expect(result.invoice.status).toBe('ISSUED')
    expect(result.invoice.pdf_url).toBe('https://blob/f.pdf') // PDF + blob, inline
    expect(elapsed).toBeLessThan(1000) // no espera los 4s de las notificaciones
    expect(mockedGestoria).not.toHaveBeenCalled()
    expect(mockedCostoBeneficio).not.toHaveBeenCalled()
    expect(webhookDone).toBe(false)
    expect(sheetsDone).toBe(false)

    // El caller (route handler, con after()) las ejecuta después de responder.
    expect(typeof result.runNotifications).toBe('function')
    await result.runNotifications!()
    expect(webhookDone).toBe(true)
    expect(sheetsDone).toBe(true)
    expect(mockedGestoria).toHaveBeenCalledWith(
      expect.objectContaining({ numeroFactura: 'R-2026-031', pdfBase64: expect.any(String) })
    )
  })

  it('runNotifications nunca lanza: un webhook caído no rompe la emisión', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedGestoria.mockRejectedValue(new Error('n8n caído'))

    const result = await issueInvoice({
      dealId: 150,
      invoiceType: 'REBU',
      deferNotifications: true,
    })
    await expect(result.runNotifications!()).resolves.toBeUndefined()
    expect(result.invoice.status).toBe('ISSUED')
  })

  it('sin deferNotifications mantiene el comportamiento inline (B2B/manual-issue)', async () => {
    mockedGestoria.mockResolvedValue(undefined)
    mockedCostoBeneficio.mockResolvedValue(undefined)

    const result = await issueInvoice({ dealId: 150, invoiceType: 'REBU' })

    expect(result.runNotifications).toBeUndefined()
    expect(mockedGestoria).toHaveBeenCalledTimes(1)
    expect(mockedCostoBeneficio).toHaveBeenCalledTimes(1)
  })
})
