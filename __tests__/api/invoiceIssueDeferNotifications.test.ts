/**
 * @jest-environment node
 *
 * POST /api/sales/[saleId]/invoice/issue tardaba >1 min: el archivado en
 * OneDrive (n8n, PDF en base64 → rclone) y la escritura en la hoja de
 * costo/beneficio (Google Sheets) se hacían EN SERIE y AWAITEADAS antes de
 * responder, aunque la factura ya existía y ya tenía número fiscal.
 *
 * Ahora el service las devuelve como `runNotifications` y el route las agenda
 * con `after()` de next/server: la respuesta sale sin esperarlas.
 */

jest.mock('@/lib/invoiceService', () => {
  const actual = jest.requireActual('@/lib/invoiceService')
  return { ...actual, issueInvoice: jest.fn() }
})
jest.mock('@/lib/auth-server', () => ({ readSessionFromRequest: jest.fn() }))
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return { ...actual, after: jest.fn() }
})

import { NextRequest, after } from 'next/server'
import { readSessionFromRequest } from '@/lib/auth-server'
import { issueInvoice } from '@/lib/invoiceService'
import { POST } from '@/app/api/sales/[saleId]/invoice/issue/route'

const mockedIssue = issueInvoice as jest.Mock
const mockedSession = readSessionFromRequest as jest.Mock
const mockedAfter = after as unknown as jest.Mock

const INVOICE = {
  id: 99,
  deal_id: 150,
  full_invoice_number: 'R-2026-031',
  status: 'ISSUED',
  pdf_url: 'https://blob/factura.pdf',
}

function request(body: unknown = { invoiceType: 'REBU' }) {
  return new NextRequest('http://localhost/api/sales/150/invoice/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-1' },
    body: JSON.stringify(body),
  })
}
const params = Promise.resolve({ saleId: '150' })

beforeEach(() => {
  jest.clearAllMocks()
  mockedSession.mockReturnValue({ uid: 7, role: 'admin', exp: 9999999999 })
})

describe('POST /invoice/issue — notificaciones fuera del camino crítico', () => {
  it('responde sin esperar las notificaciones lentas y las agenda con after()', async () => {
    let notificationsDone = false
    const slowNotifications = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 3000))
      notificationsDone = true
    })
    mockedIssue.mockResolvedValue({
      invoice: INVOICE,
      alreadyExisted: false,
      runNotifications: slowNotifications,
    })

    const started = Date.now()
    const res = await POST(request(), { params })
    const elapsed = Date.now() - started
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.invoice.full_invoice_number).toBe('R-2026-031')
    // La respuesta no espera los 3s del webhook + Sheets.
    expect(elapsed).toBeLessThan(1000)
    expect(slowNotifications).not.toHaveBeenCalled()
    expect(notificationsDone).toBe(false)

    // …pero quedan agendadas para después de enviar la respuesta.
    expect(mockedIssue).toHaveBeenCalledWith(
      expect.objectContaining({ deferNotifications: true })
    )
    expect(mockedAfter).toHaveBeenCalledWith(slowNotifications)

    // Y cuando Next las ejecuta, corren de verdad.
    await mockedAfter.mock.calls[0][0]()
    expect(notificationsDone).toBe(true)
  })

  it('no filtra la función runNotifications en el JSON de la respuesta', async () => {
    mockedIssue.mockResolvedValue({
      invoice: INVOICE,
      alreadyExisted: false,
      runNotifications: jest.fn(),
    })
    const data = await (await POST(request(), { params })).json()
    expect(data.runNotifications).toBeUndefined()
  })

  it('devuelve 409 VEHICLE_ALREADY_INVOICED con el detalle de la factura previa', async () => {
    const { InvoiceServiceError } = jest.requireActual('@/lib/invoiceService')
    mockedIssue.mockRejectedValue(
      new InvoiceServiceError(
        'VEHICLE_ALREADY_INVOICED',
        'Este coche ya está facturado en R-2026-023 (deal 143). Emitir otra factura del mismo coche es una duplicación fiscal.',
        { fullInvoiceNumber: 'R-2026-023', dealId: 143 }
      )
    )

    const res = await POST(request(), { params })
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.code).toBe('VEHICLE_ALREADY_INVOICED')
    expect(data.error).toContain('R-2026-023')
    expect(data.error).toContain('deal 143')
    expect(data.existing).toEqual(
      expect.objectContaining({ fullInvoiceNumber: 'R-2026-023', dealId: 143 })
    )
    expect(mockedAfter).not.toHaveBeenCalled()
  })

  it('reenvía allowDuplicate:true al service cuando la UI fuerza la emisión', async () => {
    mockedIssue.mockResolvedValue({
      invoice: INVOICE,
      alreadyExisted: false,
      duplicateOverride: true,
    })
    const res = await POST(
      request({ invoiceType: 'REBU', allowDuplicate: true }),
      { params }
    )
    expect(res.status).toBe(201)
    expect(mockedIssue).toHaveBeenCalledWith(
      expect.objectContaining({ allowDuplicate: true })
    )
  })
})
