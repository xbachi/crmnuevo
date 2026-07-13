/**
 * Guarda de régimen en la EMISIÓN (caso VW Taigo 3835LWT).
 *
 * Un coche comprado a un particular (contrato de compraventa, sin factura) que
 * se factura con IVA general paga IVA sobre el precio TOTAL en vez de sobre el
 * margen. La validación corre ANTES de reservar número (un bloqueo no puede
 * quemar un número fiscal) y es forzable con allowRegimen.
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
import { issueInvoice } from '@/lib/invoiceService'

const mockedPoolQuery = pool.query as jest.Mock
const mockedConnect = pool.connect as jest.Mock
const mockedPut = put as jest.Mock
const mockedGenerarFactura = generarFactura as jest.Mock

const TAIGO_VEHICULO_ID = 383
const TAIGO_DEAL_ID = 200
const TAIGO_VENTA = 21760
const TAIGO_COMPRA = 18500

function dispatcher(handlers: Array<[string, unknown]>) {
  return jest.fn(async (sql: string) => {
    for (const [match, result] of handlers) {
      if (sql.includes(match)) return result
    }
    return { rows: [], rowCount: 0 }
  })
}

const dealTaigo = {
  rows: [
    {
      id: TAIGO_DEAL_ID,
      numero: 'D-200',
      importeTotal: String(TAIGO_VENTA),
      fechaVentaFirmada: null,
      cliente_nombre: 'Cliente',
      cliente_apellidos: 'Particular',
      cliente_dni: '11111111A',
      cliente_telefono: null,
      cliente_email: null,
      cliente_direccion: null,
      cliente_ciudad: null,
      cliente_provincia: null,
      vehiculo_id: TAIGO_VEHICULO_ID,
      marca: 'Volkswagen',
      modelo: 'Taigo',
      matricula: '3835LWT',
      bastidor: 'VIN-TAIGO',
      kms: 30000,
      vehiculo_anio: 2022,
      fechaMatriculacion: null,
      precioPublicacion: TAIGO_VENTA,
    },
  ],
}

/** Queries comunes a todos los escenarios (sin factura previa, período abierto). */
const comunes = (carpeta: { nombre: string }[]): Array<[string, unknown]> => [
  ['deal_id = $1 AND invoice_type = $2', { rows: [] }],
  ['FROM "Deal" d', dealTaigo],
  ['periodos_contables', { rows: [{ t: null }] }], // tabla ausente → período abierto
  ['vehiculo_id = $1', { rows: [] }], // sin factura duplicada del coche
  // --- evidencia de compra (origenCompra) ---
  [
    'FROM "Vehiculo"',
    { rows: [{ tipo: 'Compra', precioCompra: TAIGO_COMPRA }] },
  ],
  ["to_regclass('public.vehiculo_matriculas')", { rows: [{ reg: null }] }], // sin alias
  [
    "to_regclass('public.expedientes_carpetas')",
    { rows: [{ reg: 'expedientes_carpetas' }] },
  ],
  ['FROM expedientes_carpetas', { rows: [{ archivos: carpeta }] }],
]

/** Cliente de tx que emite R/F-2026-001 sin tocar la DB real. */
function mockIssuedInvoice(fullNumber: string) {
  const inserted = {
    id: 77,
    deal_id: TAIGO_DEAL_ID,
    full_invoice_number: fullNumber,
    status: 'PDF_PENDING',
    invoice_type: 'VAT',
    total_amount: String(TAIGO_VENTA),
  }
  mockedGenerarFactura.mockResolvedValue(new Uint8Array([1, 2, 3]))
  mockedPut.mockResolvedValue({ url: 'https://blob/x.pdf', pathname: 'x.pdf' })
  mockedConnect.mockResolvedValue({
    query: dispatcher([
      [
        'FROM invoice_sequences',
        {
          rows: [
            {
              id: 1,
              series: 'F',
              next_number: 1,
              number_format: '0000',
              start_number: 1,
            },
          ],
        },
      ],
      ['MAX(number) FILTER', { rows: [{ sys_max: null, abs_max: 0 }] }],
      ['INSERT INTO invoices (', { rows: [inserted] }],
    ]),
    release: jest.fn(),
  })
  return { ...inserted, status: 'ISSUED' }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('issueInvoice — coche comprado a un PARTICULAR (contrato, sin factura)', () => {
  it('emitir VAT → REGIMEN_INCOHERENTE con la diferencia de IVA, sin consumir número', async () => {
    mockedPoolQuery.mockImplementation(
      dispatcher(comunes([{ nombre: 'CONTRATO COMPRA VENTA.pdf' }]))
    )

    await expect(
      issueInvoice({ dealId: TAIGO_DEAL_ID, invoiceType: 'VAT' })
    ).rejects.toMatchObject({
      code: 'REGIMEN_INCOHERENTE',
      message: expect.stringContaining('particular'),
      details: expect.objectContaining({
        origen: 'particular',
        ivaGeneral: 3776.53,
        ivaRebu: 565.79,
        diferencia: 3210.74,
        precioCompra: TAIGO_COMPRA,
      }),
    })
    // La validación va ANTES de reservar número: no se abre la transacción.
    expect(mockedConnect).not.toHaveBeenCalled()
  })

  it('con allowRegimen:true emite igual (decisión fiscal consciente) y deja traza', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const final = mockIssuedInvoice('F-2026-4233')
    mockedPoolQuery.mockImplementation(
      dispatcher([
        ...comunes([{ nombre: 'CONTRATO COMPRA VENTA.pdf' }]),
        ['SET pdf_url = $1', { rows: [final] }],
      ])
    )

    const result = await issueInvoice({
      dealId: TAIGO_DEAL_ID,
      invoiceType: 'VAT',
      allowRegimen: true,
    })

    expect(result.invoice.full_invoice_number).toBe('F-2026-4233')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('regimen override')
    )
    warnSpy.mockRestore()
  })

  it('emitir REBU no se valida ni consulta la evidencia', async () => {
    const final = mockIssuedInvoice('R-2026-050')
    const query = dispatcher([
      ...comunes([{ nombre: 'CONTRATO COMPRA VENTA.pdf' }]),
      ['SET pdf_url = $1', { rows: [final] }],
    ])
    mockedPoolQuery.mockImplementation(query)

    await issueInvoice({ dealId: TAIGO_DEAL_ID, invoiceType: 'REBU' })

    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('FROM facturas_registro')
      )
    ).toBe(false)
  })
})

describe('issueInvoice — coche comprado a una EMPRESA (factura de compra)', () => {
  it('emitir VAT no bloquea ni avisa', async () => {
    const final = mockIssuedInvoice('F-2026-4300')
    mockedPoolQuery.mockImplementation(
      dispatcher([
        ...comunes([{ nombre: 'Factura compra Ayvens.pdf' }]),
        ['SET pdf_url = $1', { rows: [final] }],
      ])
    )

    const result = await issueInvoice({
      dealId: TAIGO_DEAL_ID,
      invoiceType: 'VAT',
    })

    expect(result.invoice.full_invoice_number).toBe('F-2026-4300')
    expect(result.avisoRegimen).toBeNull()
  })

  it('la factura de compra registrada en facturas_registro también prueba el origen', async () => {
    const final = mockIssuedInvoice('F-2026-4301')
    mockedPoolQuery.mockImplementation(
      dispatcher([
        ['deal_id = $1 AND invoice_type = $2', { rows: [] }],
        ['FROM "Deal" d', dealTaigo],
        ['periodos_contables', { rows: [{ t: null }] }],
        ['vehiculo_id = $1', { rows: [] }],
        [
          'FROM "Vehiculo"',
          { rows: [{ tipo: 'Compra', precioCompra: TAIGO_COMPRA }] },
        ],
        [
          "to_regclass('public.vehiculo_matriculas')",
          { rows: [{ reg: null }] },
        ],
        [
          'FROM facturas_registro',
          {
            rows: [
              {
                hash_contenido: 'abc',
                categoria: 'coche-compra',
                matricula: '3835LWT',
              },
            ],
          },
        ],
        [
          "to_regclass('public.expedientes_carpetas')",
          { rows: [{ reg: null }] },
        ],
        ['SET pdf_url = $1', { rows: [final] }],
      ])
    )

    const result = await issueInvoice({
      dealId: TAIGO_DEAL_ID,
      invoiceType: 'VAT',
    })
    expect(result.avisoRegimen).toBeNull()
  })
})

describe('issueInvoice — SIN evidencia de compra (Hyundai Kona 6935KYC)', () => {
  it('avisa que no se pudo verificar el origen pero NO bloquea', async () => {
    const final = mockIssuedInvoice('F-2026-4310')
    mockedPoolQuery.mockImplementation(
      dispatcher([
        ...comunes([{ nombre: 'permiso-circulacion.pdf' }]), // nada de compra
        ['SET pdf_url = $1', { rows: [final] }],
      ])
    )

    const result = await issueInvoice({
      dealId: TAIGO_DEAL_ID,
      invoiceType: 'VAT',
    })

    expect(result.invoice.full_invoice_number).toBe('F-2026-4310')
    expect(result.avisoRegimen).toMatchObject({
      code: 'ORIGEN_NO_VERIFICADO',
      severidad: 'aviso',
    })
  })
})
