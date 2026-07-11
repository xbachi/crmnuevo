/**
 * @jest-environment node
 *
 * issueInvoice + cierre mensual: emitir con invoice_date en un período cerrado
 * debe fallar con InvoiceServiceError code 'PERIODO_CERRADO' ANTES de reservar
 * número (nunca se llega al INSERT ni a la secuencia).
 *
 * Mocks de pg y de todos los módulos con side effects (PDF, Blob, webhooks),
 * mismo patrón que invoiceDuplicateGuard.test.ts.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}))
jest.mock('@vercel/blob', () => ({ put: jest.fn(), del: jest.fn() }))
jest.mock('@/lib/contractGenerator', () => ({ generarFactura: jest.fn() }))
jest.mock('@/lib/gestoriaWebhook', () => ({ notifyGestoriaInvoice: jest.fn() }))
jest.mock('@/lib/costoBeneficio', () => ({ notifyCostoBeneficio: jest.fn() }))

import { pool } from '@/lib/direct-database'
import { issueInvoice, InvoiceServiceError } from '@/lib/invoiceService'

const mockQuery = pool.query as jest.Mock
const mockConnect = pool.connect as jest.Mock

const SALE_ROW = {
  id: 77,
  numero: 'D-0077',
  importeTotal: '12000',
  fechaVentaFirmada: null,
  cliente_nombre: 'Ana',
  cliente_apellidos: 'García',
  cliente_dni: '12345678Z',
  cliente_telefono: null,
  cliente_email: null,
  cliente_direccion: null,
  cliente_ciudad: null,
  cliente_provincia: null,
  vehiculo_id: 501,
  marca: 'Opel',
  modelo: 'Zafira',
  matricula: '6873KBW',
  bastidor: null,
  kms: 90000,
  vehiculo_anio: 2018,
  fechaMatriculacion: null,
  precioPublicacion: null,
}

function setupQueries({ cerrado }: { cerrado: boolean }) {
  mockQuery.mockReset()
  mockConnect.mockReset()
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('WHERE deal_id')) return { rows: [] } // sin factura previa
    if (sql.includes('FROM "Deal" d')) return { rows: [SALE_ROW] }
    if (sql.includes('to_regclass')) return { rows: [{ t: 'periodos_contables' }] }
    if (sql.includes('FROM periodos_contables'))
      return { rows: cerrado ? [{ '?column?': 1 }] : [] }
    if (sql.includes('FROM invoices')) return { rows: [] } // guard anti-duplicado
    throw new Error(`SQL inesperado en test: ${sql}`)
  })
  // Si el flujo llegara a reservar número pediría un client: eso es un fallo.
  mockConnect.mockImplementation(async () => {
    throw new Error('pool.connect no debería llamarse con el período cerrado')
  })
}

describe('issueInvoice — período cerrado', () => {
  it('invoice_date en mes cerrado → InvoiceServiceError PERIODO_CERRADO, sin reservar número', async () => {
    setupQueries({ cerrado: true })
    let caught: unknown
    try {
      await issueInvoice({
        dealId: 77,
        invoiceType: 'REBU',
        invoiceDate: new Date('2026-04-15T12:00:00Z'),
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(InvoiceServiceError)
    const e = caught as InvoiceServiceError
    expect(e.code).toBe('PERIODO_CERRADO')
    expect(e.message).toContain('2026-04')
    expect(e.details).toMatchObject({ anio: 2026, mes: 4 })
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('tabla periodos_contables inexistente → no bloquea el chequeo de período', async () => {
    setupQueries({ cerrado: false })
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE deal_id')) return { rows: [] }
      if (sql.includes('FROM "Deal" d')) return { rows: [SALE_ROW] }
      if (sql.includes('to_regclass')) return { rows: [{ t: null }] } // sin migración
      if (sql.includes('FROM invoices')) return { rows: [] }
      throw new Error(`SQL inesperado en test: ${sql}`)
    })
    // Pasa el guard de período y falla recién al reservar número (connect
    // mockeado a error) — lo que prueba que el cierre NO interceptó.
    await expect(
      issueInvoice({
        dealId: 77,
        invoiceType: 'REBU',
        invoiceDate: new Date('2026-04-15T12:00:00Z'),
      })
    ).rejects.toThrow('pool.connect no debería llamarse')
  })
})
