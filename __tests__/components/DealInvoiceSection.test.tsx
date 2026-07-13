import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import DealInvoiceSection from '@/components/invoicing/DealInvoiceSection'

/**
 * El dueño reportó que tras emitir no veía ningún estado "generada" y que podía
 * volver a apretar "Emitir IVA" (de ahí facturas duplicadas). Acá se protege:
 *  - si el deal YA tiene factura activa → botones deshabilitados permanentes,
 *  - tras emitir → estado visible + descarga del PDF al instante,
 *  - 409 VEHICLE_ALREADY_INVOICED → mensaje del servidor tal cual + override.
 */

jest.mock('@/components/Toast', () => ({
  useToast: () => ({
    showToast: jest.fn(),
    ToastContainer: () => null,
  }),
}))
jest.mock('@/lib/pdf/download', () => ({ downloadPdf: jest.fn() }))

const ISSUED_INVOICE = {
  id: 99,
  invoice_type: 'REBU',
  series: 'R-2026',
  number: 31,
  full_invoice_number: 'R-2026-031',
  invoice_date: '2026-07-01',
  total_amount: '9000.00',
  status: 'ISSUED',
  pdf_url: 'https://blob/f.pdf',
}

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const result = handler(String(url), init) as {
      ok?: boolean
      status?: number
      body: unknown
    }
    return {
      ok: result.ok ?? true,
      status: result.status ?? 200,
      json: async () => result.body,
    }
  }) as unknown as typeof fetch
}

beforeEach(() => {
  jest.clearAllMocks()
  window.confirm = jest.fn(() => true)
})

describe('DealInvoiceSection — deal ya facturado', () => {
  it('deshabilita Emitir IVA / Emitir REBU de forma permanente', async () => {
    mockFetch(() => ({ body: { rows: [ISSUED_INVOICE] } }))
    render(<DealInvoiceSection saleId={150} />)

    const emitirIva = await screen.findByRole('button', { name: 'Emitir IVA' })
    const emitirRebu = screen.getByRole('button', { name: 'Emitir REBU' })
    expect(emitirIva).toBeDisabled()
    expect(emitirRebu).toBeDisabled()
    expect(screen.getByText(/ya está facturada/i)).toBeInTheDocument()
    expect(screen.getByText(/rectificativa/i)).toBeInTheDocument()
    // El PDF se puede descargar enseguida.
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled()
  })

  it('una factura RECTIFIED no bloquea: se puede volver a emitir', async () => {
    mockFetch(() => ({
      body: { rows: [{ ...ISSUED_INVOICE, status: 'RECTIFIED' }] },
    }))
    render(<DealInvoiceSection saleId={150} />)

    const emitirIva = await screen.findByRole('button', { name: 'Emitir IVA' })
    expect(emitirIva).toBeEnabled()
  })
})

describe('DealInvoiceSection — emisión', () => {
  it('tras emitir muestra la factura generada y el botón de descarga', async () => {
    mockFetch((url) => {
      if (url.includes('/invoice/issue')) {
        return { status: 201, body: { invoice: ISSUED_INVOICE, alreadyExisted: false } }
      }
      return { body: { rows: [] } } // el listado todavía no la trae
    })
    render(<DealInvoiceSection saleId={150} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Emitir REBU' }))

    await waitFor(() =>
      expect(screen.getByText(/Factura R-2026-031 generada correctamente/i)).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emitir REBU' })).toBeDisabled()
  })

  it('409 VEHICLE_ALREADY_INVOICED: muestra el mensaje del servidor y permite forzar', async () => {
    const issueCalls: Array<Record<string, unknown>> = []
    mockFetch((url, init) => {
      if (url.includes('/invoice/issue')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        issueCalls.push(body)
        if (!body.allowDuplicate) {
          return {
            ok: false,
            status: 409,
            body: {
              code: 'VEHICLE_ALREADY_INVOICED',
              error:
                'Este coche ya está facturado en R-2026-023 (deal 143). Emitir otra factura del mismo coche es una duplicación fiscal.',
            },
          }
        }
        return { status: 201, body: { invoice: ISSUED_INVOICE, alreadyExisted: false } }
      }
      return { body: { rows: [] } }
    })
    render(<DealInvoiceSection saleId={150} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Emitir REBU' }))

    // El error del servidor se muestra tal cual, no un genérico.
    await waitFor(() =>
      expect(
        screen.getByText(/Este coche ya está facturado en R-2026-023 \(deal 143\)/i)
      ).toBeInTheDocument()
    )
    expect(screen.getByText(/riesgo de duplicación fiscal/i)).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Emitir igualmente \(duplicación fiscal\)/i })
    )

    await waitFor(() => expect(issueCalls).toHaveLength(2))
    expect(issueCalls[1]).toEqual(
      expect.objectContaining({ invoiceType: 'REBU', allowDuplicate: true })
    )
  })
})
