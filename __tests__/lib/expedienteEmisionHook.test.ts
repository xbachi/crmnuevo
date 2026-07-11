/**
 * El hook de expediente al emitir es best-effort: si crearExpedienteAlEmitir
 * revienta (tabla sin migrar, DB caída, etc.) la emisión de la factura NO
 * se rompe — el número ya está reservado y el PDF se genera igual.
 *
 * Mismo esquema de mocks que invoiceDuplicateGuard.test.ts (pg + módulos con
 * efectos), más el mock de @/lib/expedientes rechazando.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}))
jest.mock('@vercel/blob', () => ({ put: jest.fn(), del: jest.fn() }))
jest.mock('@/lib/contractGenerator', () => ({ generarFactura: jest.fn() }))
jest.mock('@/lib/gestoriaWebhook', () => ({ notifyGestoriaInvoice: jest.fn() }))
jest.mock('@/lib/costoBeneficio', () => ({ notifyCostoBeneficio: jest.fn() }))
jest.mock('@/lib/expedientes', () => ({
  crearExpedienteAlEmitir: jest.fn(),
}))

import { pool } from '@/lib/direct-database'
import { put } from '@vercel/blob'
import { generarFactura } from '@/lib/contractGenerator'
import { crearExpedienteAlEmitir } from '@/lib/expedientes'
import { issueInvoice } from '@/lib/invoiceService'

const mockedPoolQuery = pool.query as jest.Mock
const mockedConnect = pool.connect as jest.Mock
const mockedCrearExpediente = crearExpedienteAlEmitir as jest.Mock

function dispatcher(handlers: Array<[string, unknown]>) {
  return jest.fn(async (sql: string) => {
    for (const [match, result] of handlers) {
      if (sql.includes(match)) return result
    }
    return { rows: [], rowCount: 0 }
  })
}

describe('issueInvoice — hook de expediente best-effort', () => {
  it('emite la factura igual aunque el INSERT del expediente falle', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedCrearExpediente.mockRejectedValue(
      new Error('relation "expedientes" does not exist')
    )
    ;(generarFactura as jest.Mock).mockResolvedValue(new Uint8Array([1, 2, 3]))
    ;(put as jest.Mock).mockResolvedValue({
      url: 'https://blob/fake.pdf',
      pathname: 'fake.pdf',
    })

    const insertedInvoice = {
      id: 99,
      deal_id: 144,
      full_invoice_number: 'F-2026-031',
      status: 'PDF_PENDING',
    }
    const finalInvoice = { ...insertedInvoice, status: 'ISSUED' }

    const client = {
      query: dispatcher([
        [
          'FROM invoice_sequences',
          { rows: [{ id: 1, series: 'F', next_number: 31, number_format: '000', start_number: 1 }] },
        ],
        ['MAX(number) FILTER', { rows: [{ sys_max: null, abs_max: 0 }] }],
        ['INSERT INTO invoices (', { rows: [insertedInvoice] }],
      ]),
      release: jest.fn(),
    }
    mockedConnect.mockResolvedValue(client)

    mockedPoolQuery.mockImplementation(
      dispatcher([
        ['deal_id = $1 AND invoice_type = $2', { rows: [] }],
        [
          'FROM "Deal" d',
          {
            rows: [
              {
                id: 144,
                numero: 'D-144',
                importeTotal: '9000.00',
                fechaVentaFirmada: null,
                cliente_nombre: 'Cliente',
                cliente_apellidos: 'Uno',
                cliente_dni: '11111111A',
                vehiculo_id: 501,
                marca: 'Seat',
                modelo: 'Leon',
                matricula: '1234ABC',
                bastidor: 'VIN-1',
                kms: 50000,
                vehiculo_anio: 2019,
                fechaMatriculacion: null,
                precioPublicacion: 9000,
              },
            ],
          },
        ],
        ['vehiculo_id = $1', { rows: [] }], // sin factura duplicada
        ['SET pdf_url = $1', { rows: [finalInvoice] }],
      ])
    )

    const result = await issueInvoice({ dealId: 144, invoiceType: 'VAT' })

    expect(mockedCrearExpediente).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        numeroFactura: 'F-2026-031',
        dealId: 144,
        vehiculoId: 501,
        matricula: '1234ABC',
        invoiceType: 'VAT',
      })
    )
    // La emisión terminó bien a pesar del fallo del expediente.
    expect(result.alreadyExisted).toBe(false)
    expect(result.invoice.full_invoice_number).toBe('F-2026-031')
    expect(result.invoice.status).toBe('ISSUED')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('expediente creation failed'),
      expect.any(Error)
    )
    errorSpy.mockRestore()
  })
})
