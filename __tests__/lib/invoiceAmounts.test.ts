import { computeAmounts } from '@/lib/invoiceAmounts'

describe('computeAmounts — desglose de importes de factura', () => {
  describe('VAT (IVA 21%, el total ya lo incluye)', () => {
    it('desglosa base + IVA sobre un total redondo', () => {
      const a = computeAmounts(12100, 'VAT')
      expect(a.taxable_base).toBe(10000)
      expect(a.vat_amount).toBe(2100)
      expect(a.vat_rate).toBe(21)
      expect(a.total_amount).toBe(12100)
      expect(a.vehicle_sale_price).toBe(12100)
    })

    it('base + IVA reconstruyen exactamente el total (redondeo a 2 decimales)', () => {
      const a = computeAmounts(1000, 'VAT')
      expect(a.taxable_base).toBe(826.45)
      expect(a.vat_amount).toBe(173.55)
      expect((a.taxable_base as number) + (a.vat_amount as number)).toBe(1000)
    })

    it('total 0 → base 0, IVA 0', () => {
      const a = computeAmounts(0, 'VAT')
      expect(a.taxable_base).toBe(0)
      expect(a.vat_amount).toBe(0)
      expect(a.total_amount).toBe(0)
    })

    it('los campos REBU quedan en null', () => {
      const a = computeAmounts(12100, 'VAT')
      expect(a.rebu_margin).toBeNull()
      expect(a.rebu_taxable_base).toBeNull()
      expect(a.rebu_vat_amount).toBeNull()
    })
  })

  describe('REBU (sin desglose de IVA en la factura)', () => {
    it('conserva el total y no desglosa IVA', () => {
      const a = computeAmounts(15000, 'REBU')
      expect(a.total_amount).toBe(15000)
      expect(a.vehicle_sale_price).toBe(15000)
      expect(a.taxable_base).toBeNull()
      expect(a.vat_rate).toBeNull()
      expect(a.vat_amount).toBeNull()
    })

    it('vehicle_sale_price y total_amount siempre coinciden con el total', () => {
      for (const total of [0, 150, 9999.99, 25000]) {
        const a = computeAmounts(total, 'REBU')
        expect(a.vehicle_sale_price).toBe(total)
        expect(a.total_amount).toBe(total)
      }
    })
  })
})
