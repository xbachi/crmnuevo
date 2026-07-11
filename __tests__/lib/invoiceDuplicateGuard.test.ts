/**
 * C-01 fix: the same vehicle must never accumulate two active sale invoices
 * from two different sales — that's exactly what produced R-2026-023/024
 * (Opel Zafira 6873KBW, deal 143 vs deal 144) and R-2026-025/026 (VW Eos
 * 8700GKW, retail deal 149 vs B2B venta 3).
 *
 * Mocks pg + all side-effecting modules (PDF, Blob, gestoría webhook, CB
 * sync) so issueInvoice/issueInvoiceForB2B run as pure unit tests.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}))
jest.mock('@vercel/blob', () => ({ put: jest.fn(), del: jest.fn() }))
jest.mock('@/lib/contractGenerator', () => ({ generarFactura: jest.fn() }))
jest.mock('@/lib/gestoriaWebhook', () => ({ notifyGestoriaInvoice: jest.fn() }))
jest.mock('@/lib/costoBeneficio', () => ({ notifyCostoBeneficio: jest.fn() }))
jest.mock('@/lib/b2b-database', () => ({ getVentaB2BById: jest.fn() }))

import { pool } from '@/lib/direct-database'
import { put } from '@vercel/blob'
import { generarFactura } from '@/lib/contractGenerator'
import { getVentaB2BById } from '@/lib/b2b-database'
import { issueInvoice } from '@/lib/invoiceService'
import { issueInvoiceForB2B } from '@/lib/b2b-invoice-service'
import { findActiveSaleInvoiceForVehicle } from '@/lib/invoiceRepository'

const mockedPoolQuery = pool.query as jest.Mock
const mockedConnect = pool.connect as jest.Mock
const mockedPut = put as jest.Mock
const mockedGenerarFactura = generarFactura as jest.Mock
const mockedGetVentaB2BById = getVentaB2BById as jest.Mock

// Generic SQL dispatcher: first matching substring wins; unmatched queries
// return an empty result set (fine for BEGIN/COMMIT/UPDATE/INSERT-log calls
// whose return value the code under test doesn't inspect).
function dispatcher(handlers: Array<[string, unknown]>) {
  return jest.fn(async (sql: string) => {
    for (const [match, result] of handlers) {
      if (sql.includes(match)) return result
    }
    return { rows: [], rowCount: 0 }
  })
}

const ZAFIRA_VEHICULO_ID = 501
const EOS_VEHICULO_ID = 601

beforeEach(() => {
  jest.clearAllMocks()
})

describe('findActiveSaleInvoiceForVehicle — repository', () => {
  it('returns the conflicting invoice, excluding the caller\'s own deal', async () => {
    mockedPoolQuery.mockResolvedValue({
      rows: [
        {
          id: 1,
          full_invoice_number: 'R-2026-023',
          status: 'ISSUED',
          deal_id: 143,
          b2b_venta_id: null,
        },
      ],
    })
    const result = await findActiveSaleInvoiceForVehicle(ZAFIRA_VEHICULO_ID, {
      excludeDealId: 144,
    })
    expect(result).toEqual(
      expect.objectContaining({ full_invoice_number: 'R-2026-023', origin: 'retail' })
    )
    const [, params] = mockedPoolQuery.mock.calls[0]
    expect(params).toEqual([ZAFIRA_VEHICULO_ID, 144, -1])
  })
})

describe('issueInvoice — anti-duplicate-vehicle guard (retail vs retail)', () => {
  it('rejects with VEHICLE_ALREADY_INVOICED when the same car (Zafira 6873KBW) is already invoiced on another deal', async () => {
    mockedPoolQuery.mockImplementation(
      dispatcher([
        // 1. no existing invoice for (deal 144, REBU)
        ['deal_id = $1 AND invoice_type = $2', { rows: [] }],
        // 2. loadSale(144) → Zafira
        [
          'FROM "Deal" d',
          {
            rows: [
              {
                id: 144,
                numero: 'D-144',
                importeTotal: '3373.00',
                fechaVentaFirmada: null,
                cliente_nombre: 'Cliente',
                cliente_apellidos: 'Dos',
                cliente_dni: '11111111A',
                cliente_telefono: null,
                cliente_email: null,
                cliente_direccion: null,
                cliente_ciudad: null,
                cliente_provincia: null,
                vehiculo_id: ZAFIRA_VEHICULO_ID,
                marca: 'Opel',
                modelo: 'Zafira',
                matricula: '6873KBW',
                bastidor: 'VIN-ZAFIRA',
                kms: 90000,
                vehiculo_anio: 2015,
                fechaMatriculacion: null,
                precioPublicacion: 3373,
              },
            ],
          },
        ],
        // 3. guard: deal 143 already has an active invoice for this vehicle
        [
          'vehiculo_id = $1',
          {
            rows: [
              {
                id: 1,
                full_invoice_number: 'R-2026-023',
                status: 'ISSUED',
                deal_id: 143,
                b2b_venta_id: null,
              },
            ],
          },
        ],
      ])
    )

    await expect(issueInvoice({ dealId: 144, invoiceType: 'REBU' })).rejects.toMatchObject({
      code: 'VEHICLE_ALREADY_INVOICED',
      details: expect.objectContaining({
        fullInvoiceNumber: 'R-2026-023',
        origin: 'retail',
      }),
    })
    expect(mockedConnect).not.toHaveBeenCalled() // never reaches number reservation
  })
})

describe('issueInvoiceForB2B — anti-duplicate-vehicle guard (cross retail ↔ B2B)', () => {
  it('rejects when the car (VW Eos 8700GKW) already has an active RETAIL invoice', async () => {
    mockedGetVentaB2BById.mockResolvedValue({
      id: 3,
      numero: 'B2B-3',
      vehiculo_id: EOS_VEHICULO_ID,
      vehiculo_marca: 'Volkswagen',
      vehiculo_modelo: 'Eos',
      vehiculo_matricula: '8700GKW',
      vehiculo_bastidor: 'VIN-EOS',
      vehiculo_kms: 80000,
      vehiculo_anio: 2012,
      vehiculo_fecha_matriculacion: null,
      fecha_venta: new Date('2026-06-01'),
      precio_venta: '6000.00',
      cliente_razon_social: 'Empresa SL',
      cliente_cif_nif: 'B12345678',
    })
    mockedPoolQuery.mockImplementation(
      dispatcher([
        ['b2b_venta_id = $1 AND status', { rows: [] }], // no existing B2B invoice yet
        [
          'vehiculo_id = $1',
          {
            rows: [
              {
                id: 2,
                full_invoice_number: 'R-2026-025',
                status: 'ISSUED',
                deal_id: 149,
                b2b_venta_id: null,
              },
            ],
          },
        ],
      ])
    )

    await expect(
      issueInvoiceForB2B({ ventaB2BId: 3, invoiceType: 'REBU' })
    ).rejects.toMatchObject({
      code: 'VEHICLE_ALREADY_INVOICED',
      details: expect.objectContaining({ fullInvoiceNumber: 'R-2026-025', origin: 'retail' }),
    })
    expect(mockedConnect).not.toHaveBeenCalled()
  })
})

describe('issueInvoice — allowDuplicate:true overrides the guard', () => {
  it('proceeds, issues the invoice, and reports duplicateOverride:true', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockedGenerarFactura.mockResolvedValue(new Uint8Array([1, 2, 3]))
    mockedPut.mockResolvedValue({ url: 'https://blob/fake.pdf', pathname: 'fake.pdf' })

    const insertedInvoice = {
      id: 99,
      deal_id: 144,
      full_invoice_number: 'R-2026-031',
      status: 'PDF_PENDING',
    }
    const finalInvoice = { ...insertedInvoice, status: 'ISSUED', pdf_url: 'https://blob/fake.pdf' }

    const client = {
      query: dispatcher([
        ['FROM invoice_sequences', {
          rows: [{ id: 1, series: 'R', next_number: 26, number_format: '000', start_number: 23 }],
        }],
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
                importeTotal: '3373.00',
                fechaVentaFirmada: null,
                cliente_nombre: 'Cliente',
                cliente_apellidos: 'Dos',
                cliente_dni: '11111111A',
                cliente_telefono: null,
                cliente_email: null,
                cliente_direccion: null,
                cliente_ciudad: null,
                cliente_provincia: null,
                vehiculo_id: ZAFIRA_VEHICULO_ID,
                marca: 'Opel',
                modelo: 'Zafira',
                matricula: '6873KBW',
                bastidor: 'VIN-ZAFIRA',
                kms: 90000,
                vehiculo_anio: 2015,
                fechaMatriculacion: null,
                precioPublicacion: 3373,
              },
            ],
          },
        ],
        [
          'vehiculo_id = $1',
          {
            rows: [
              {
                id: 1,
                full_invoice_number: 'R-2026-023',
                status: 'ISSUED',
                deal_id: 143,
                b2b_venta_id: null,
              },
            ],
          },
        ],
        ['SET pdf_url = $1', { rows: [finalInvoice] }],
      ])
    )

    const result = await issueInvoice({
      dealId: 144,
      invoiceType: 'REBU',
      allowDuplicate: true,
    })

    expect(result.duplicateOverride).toBe(true)
    expect(result.invoice.full_invoice_number).toBe('R-2026-031')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('duplicate-vehicle override'))
    warnSpy.mockRestore()
  })
})
