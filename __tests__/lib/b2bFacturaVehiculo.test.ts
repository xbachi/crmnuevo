/**
 * Facturar una venta B2B tiene que dejar el coche VENDIDO (el retail lo hace
 * al pasar el Deal a 'facturado'; el B2B no tocaba el vehículo y el coche
 * seguía en stock). El hook es best-effort: nunca puede tumbar una emisión
 * cuyo número fiscal ya está reservado.
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}))
jest.mock('@vercel/blob', () => ({ put: jest.fn(), del: jest.fn() }))
jest.mock('@/lib/contractGenerator', () => ({ generarFactura: jest.fn() }))
jest.mock('@/lib/facturacionRegistro', () => ({ appendRegistro: jest.fn() }))
jest.mock('@/lib/expedientes', () => ({ crearExpedienteAlEmitir: jest.fn() }))
jest.mock('@/lib/b2b-database', () => ({
  getVentaB2BById: jest.fn(),
  marcarVehiculoDeVentaB2BVendido: jest.fn(),
  liberarVehiculoDeVentaB2B: jest.fn(),
}))

import { pool } from '@/lib/direct-database'
import { put } from '@vercel/blob'
import { generarFactura } from '@/lib/contractGenerator'
import {
  getVentaB2BById,
  marcarVehiculoDeVentaB2BVendido,
} from '@/lib/b2b-database'
import { issueInvoiceForB2B } from '@/lib/b2b-invoice-service'

const mockedPoolQuery = pool.query as jest.Mock
const mockedConnect = pool.connect as jest.Mock
const mockedMarcar = marcarVehiculoDeVentaB2BVendido as jest.Mock

const VEHICULO_ID = 601

function dispatcher(handlers: Array<[string, unknown]>) {
  return jest.fn(async (sql: string) => {
    for (const [match, result] of handlers) {
      if (sql.includes(match)) return result
    }
    return { rows: [], rowCount: 0 }
  })
}

const venta = {
  id: 3,
  numero: 'B2B-2026-0003',
  vehiculo_id: VEHICULO_ID,
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
}

const inserted = {
  id: 99,
  b2b_venta_id: 3,
  vehiculo_id: VEHICULO_ID,
  full_invoice_number: 'R-2026-040',
  invoice_date: '2026-06-01',
  status: 'PDF_PENDING',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getVentaB2BById as jest.Mock).mockResolvedValue(venta)
  ;(generarFactura as jest.Mock).mockResolvedValue(new Uint8Array([1, 2, 3]))
  ;(put as jest.Mock).mockResolvedValue({
    url: 'https://blob/f.pdf',
    pathname: 'f.pdf',
  })
  mockedConnect.mockResolvedValue({
    query: dispatcher([
      [
        'FROM invoice_sequences',
        { rows: [{ id: 1, series: 'R', next_number: 40, number_format: '000' }] },
      ],
      ['MAX(number)', { rows: [{ max_num: 39 }] }],
      ['INSERT INTO invoices (', { rows: [inserted] }],
    ]),
    release: jest.fn(),
  })
})

describe('issueInvoiceForB2B — el coche queda VENDIDO', () => {
  it('marca el vehículo de la venta al emitir la factura', async () => {
    mockedPoolQuery.mockImplementation(
      dispatcher([
        ['b2b_venta_id = $1 AND status', { rows: [] }], // sin factura previa
        ['vehiculo_id = $1', { rows: [] }], // sin duplicado
        ['UPDATE invoices', { rows: [{ ...inserted, status: 'ISSUED' }] }],
      ])
    )

    const res = await issueInvoiceForB2B({ ventaB2BId: 3, invoiceType: 'REBU' })

    expect(res.alreadyExisted).toBe(false)
    expect(mockedMarcar).toHaveBeenCalledTimes(1)
    expect(mockedMarcar).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ vehiculoId: VEHICULO_ID })
    )
  })

  it('re-facturar (idempotente) no vuelve a tocar el vehículo', async () => {
    mockedPoolQuery.mockImplementation(
      dispatcher([
        [
          'b2b_venta_id = $1 AND status',
          { rows: [{ ...inserted, status: 'ISSUED' }] },
        ],
      ])
    )

    const res = await issueInvoiceForB2B({ ventaB2BId: 3, invoiceType: 'REBU' })

    expect(res.alreadyExisted).toBe(true)
    expect(mockedConnect).not.toHaveBeenCalled()
    expect(mockedMarcar).not.toHaveBeenCalled()
  })
})
