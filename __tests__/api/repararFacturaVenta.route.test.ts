/**
 * @jest-environment node
 *
 * POST /api/expedientes/reparar-factura-venta — dryRun por defecto (no escribe),
 * clasificación reparadas / sinPdfEnCrm / yaEstaban, y aplicación por el mismo
 * camino que la emisión (webhook n8n + webhook_outbox).
 */

jest.mock('@/lib/direct-database', () => ({
  pool: { query: jest.fn() },
}))
jest.mock('@/lib/auth-server', () => ({
  readSessionFromRequest: jest.fn(() => null),
}))

import { NextRequest } from 'next/server'
import { pool } from '@/lib/direct-database'
import { readSessionFromRequest } from '@/lib/auth-server'
import { POST } from '@/app/api/expedientes/reparar-factura-venta/route'

const mockQuery = pool.query as jest.Mock
const mockSession = readSessionFromRequest as jest.Mock

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/expedientes/reparar-factura-venta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Snapshot con dos carpetas: una CON factura de venta, otra sin ella. */
const SNAPSHOT_ROWS = [
  {
    carpeta: '74-Opel-Astra-8061KRN',
    matricula_norm: '8061KRN',
    archivos: [
      { nombre: 'Factura-Venta-F-2026-020.pdf' },
      { nombre: 'Contrato comprador.jpeg' },
    ],
  },
  {
    carpeta: '80-Kia-Xceed-0608NLF',
    matricula_norm: '0608NLF',
    archivos: [{ nombre: 'Contrato comprador.jpeg' }],
  },
  {
    carpeta: '81-Seat-Leon-1111AAA',
    matricula_norm: '1111AAA',
    archivos: [{ nombre: 'Factura-Compra-XXX.pdf' }],
  },
]

const INVOICE_YA_ESTABA = {
  full_invoice_number: 'F-2026-020',
  invoice_date: '2026-04-05',
  vehicle_plate: '8061KRN',
  vehicle_make: 'Opel',
  vehicle_model: 'Astra',
  invoice_type: 'VAT',
  status: 'ISSUED',
  pdf_url: 'https://blob.example/f-2026-020.pdf',
  pdf_storage_key: 'invoices/f-2026-020.pdf',
}

// IMPORTED/legacy: nunca tuvo PDF en el CRM → no reparable automáticamente.
const INVOICE_IMPORTED = {
  full_invoice_number: 'LEGACY-129',
  invoice_date: '2026-04-20',
  vehicle_plate: '0608NLF',
  vehicle_make: 'Kia',
  vehicle_model: 'Xceed',
  invoice_type: 'VAT',
  status: 'IMPORTED',
  pdf_url: null,
  pdf_storage_key: null,
}

// ISSUED con PDF pero sin factura de venta en la carpeta → la copia falló (bug).
const INVOICE_REPARABLE = {
  full_invoice_number: 'F-2026-030',
  invoice_date: '2026-05-11',
  vehicle_plate: '1111AAA',
  vehicle_make: 'Seat',
  vehicle_model: 'Leon',
  invoice_type: 'VAT',
  status: 'ISSUED',
  pdf_url: 'https://blob.example/f-2026-030.pdf',
  pdf_storage_key: 'invoices/f-2026-030.pdf',
}

/** to_regclass vehiculo_matriculas → to_regclass carpetas → snapshot → invoices */
function mockDb(invoices: Record<string, unknown>[]) {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ reg: null }] }) // sin historial de matrículas
    .mockResolvedValueOnce({ rows: [{ reg: 'expedientes_carpetas' }] })
    .mockResolvedValueOnce({ rows: SNAPSHOT_ROWS })
    .mockResolvedValueOnce({ rows: invoices })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockReturnValue({ user: 'seb', role: 'admin' })
  // Tablas opcionales fuera de la secuencia (vehiculo_matriculas): sin fila.
  mockQuery.mockResolvedValue({ rows: [] })
})

describe('POST /api/expedientes/reparar-factura-venta — auth', () => {
  it('401 sin sesión', async () => {
    mockSession.mockReturnValue(null)
    const res = await POST(makeRequest({ year: 2026, quarter: 2 }))
    expect(res.status).toBe(401)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('403 con sesión no admin', async () => {
    mockSession.mockReturnValue({ user: 'ana', role: 'asesor' })
    const res = await POST(makeRequest({ year: 2026, quarter: 2 }))
    expect(res.status).toBe(403)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('400 con quarter inválido', async () => {
    const res = await POST(makeRequest({ year: 2026, quarter: 9 }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/expedientes/reparar-factura-venta — dryRun (por defecto)', () => {
  it('no escribe nada: ni webhook ni outbox, y marca el nombre canónico', async () => {
    mockDb([INVOICE_YA_ESTABA, INVOICE_IMPORTED, INVOICE_REPARABLE])

    const res = await POST(makeRequest({ year: 2026, quarter: 2 })) // sin dryRun → true
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.dryRun).toBe(true)

    // Ningún efecto: sólo las 4 lecturas (alias, regclass, snapshot, invoices).
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockQuery).toHaveBeenCalledTimes(4)
    expect(
      mockQuery.mock.calls.some((c: unknown[]) => /INSERT INTO webhook_outbox/.test(String(c[0])))
    ).toBe(false)

    // Factura con PDF cuyo expediente no la tiene → se marca para copiar con el
    // nombre canónico, pero aplicado:false.
    expect(body.reparadas).toEqual([
      {
        numero: 'F-2026-030',
        matricula: '1111AAA',
        fecha: '2026-05-11',
        carpeta: '81-Seat-Leon-1111AAA',
        archivo: 'Factura-Venta-Seat-Leon-1111AAA.pdf',
        aplicado: false,
      },
    ])

    // IMPORTED sin PDF en el CRM → trabajo humano pendiente, no fallo silencioso.
    expect(body.sinPdfEnCrm).toHaveLength(1)
    expect(body.sinPdfEnCrm[0]).toMatchObject({
      numero: 'LEGACY-129',
      matricula: '0608NLF',
      fecha: '2026-04-20',
      status: 'IMPORTED',
    })
    expect(body.notaSinPdf).toContain('no se pueden reparar automáticamente')

    // Expediente que ya tiene la factura de venta → yaEstaban.
    expect(body.yaEstaban).toEqual([
      {
        numero: 'F-2026-020',
        matricula: '8061KRN',
        fecha: '2026-04-05',
        carpeta: '74-Opel-Astra-8061KRN',
      },
    ])
    expect(body.fallidas).toEqual([])
  })

  it('409 si no hay snapshot de OneDrive del trimestre (no repara a ciegas)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ reg: null }] }) // sin historial de matrículas
      .mockResolvedValueOnce({ rows: [{ reg: 'expedientes_carpetas' }] })
      .mockResolvedValueOnce({ rows: [] })

    const res = await POST(makeRequest({ year: 2026, quarter: 2 }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.verificable).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/expedientes/reparar-factura-venta — dryRun:false', () => {
  it('descarga el PDF y lo manda por el webhook de gestoría, con traza en outbox', async () => {
    mockDb([INVOICE_REPARABLE])
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 77 }] }) // insertOutboxPending
      .mockResolvedValueOnce({ rows: [] }) // markOutboxEnviado
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode('%PDF-fake').buffer,
      }) // descarga del blob
      .mockResolvedValueOnce({ ok: true, status: 200 }) // webhook n8n

    process.env.N8N_INVOICE_WEBHOOK_URL = 'https://n8n.example.com/webhook/invoice'
    const res = await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    delete process.env.N8N_INVOICE_WEBHOOK_URL

    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.reparadas[0]).toMatchObject({
      numero: 'F-2026-030',
      archivo: 'Factura-Venta-Seat-Leon-1111AAA.pdf',
      aplicado: true,
    })

    // 1º fetch: el PDF del blob. 2º fetch: el webhook de n8n con el pdf en base64.
    const [blobUrl] = (global.fetch as jest.Mock).mock.calls[0]
    expect(blobUrl).toBe('https://blob.example/f-2026-030.pdf')
    const [webhookUrl, init] = (global.fetch as jest.Mock).mock.calls[1]
    expect(webhookUrl).toBe('https://n8n.example.com/webhook/invoice')
    const payload = JSON.parse((init as { body: string }).body)
    expect(payload).toMatchObject({
      numeroFactura: 'F-2026-030',
      fechaISO: '2026-05-11',
      matricula: '1111AAA',
      tipo: 'VAT',
    })
    expect(Buffer.from(payload.pdfBase64, 'base64').toString()).toBe('%PDF-fake')

    // Traza en el outbox: pendiente → enviado.
    expect(mockQuery.mock.calls[4][0]).toMatch(/INSERT INTO webhook_outbox/)
    expect(mockQuery.mock.calls[5][0]).toMatch(/estado = 'enviado'/)
  })

  it('webhook caído → la factura cae en fallidas y el outbox queda con el error', async () => {
    mockDb([INVOICE_REPARABLE])
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 78 }] }) // insertOutboxPending
      .mockResolvedValueOnce({ rows: [] }) // markOutboxFallo
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode('%PDF-fake').buffer,
      })
      .mockResolvedValueOnce({ ok: false, status: 500 })

    process.env.N8N_INVOICE_WEBHOOK_URL = 'https://n8n.example.com/webhook/invoice'
    const res = await POST(makeRequest({ year: 2026, quarter: 2, dryRun: false }))
    delete process.env.N8N_INVOICE_WEBHOOK_URL

    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.reparadas).toEqual([])
    expect(body.fallidas[0]).toMatchObject({ numero: 'F-2026-030' })
    expect(mockQuery.mock.calls[5][0]).toMatch(/intentos = intentos \+ 1/)
  })
})
