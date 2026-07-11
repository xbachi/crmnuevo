import { lockAndFindActiveVehicleInvoice } from '@/lib/invoiceVehicleGuard'

describe('bloqueo de factura activa por vehículo', () => {
  it('serializa por vehículo antes de buscar facturas retail o B2B', async () => {
    const existing = { id: 9, full_invoice_number: 'R-2026-024' }
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existing] })

    await expect(
      lockAndFindActiveVehicleInvoice({ query } as never, 42)
    ).resolves.toBe(existing)

    expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock')
    expect(query.mock.calls[0][1]).toEqual([20_260_711, 42])
    expect(query.mock.calls[1][0]).toContain("invoice_type IN ('VAT', 'REBU')")
    expect(query.mock.calls[1][0]).toContain(
      "status NOT IN ('VOIDED', 'RECTIFIED')"
    )
    expect(query.mock.calls[1][1]).toEqual([42])
  })

  it('devuelve null cuando el vehículo todavía no tiene factura activa', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] })
    await expect(
      lockAndFindActiveVehicleInvoice({ query } as never, 7)
    ).resolves.toBeNull()
  })
})
