/**
 * @jest-environment node
 *
 * Lógica pura de las facturas rectificativas: importes negados (neteo exacto a
 * cero contra la original) y guardas de rectificabilidad.
 */

import {
  computeRectificativaAmounts,
  assertRectificable,
  normalizeMotivo,
  RectificarError,
  type OriginalLike,
} from '@/lib/invoiceRectificativa'

const vatOriginal: OriginalLike = {
  id: 1,
  invoice_type: 'VAT',
  status: 'ISSUED',
  total_amount: '12100.00',
  taxable_base: '10000.00',
  vat_rate: '21.00',
  vat_amount: '2100.00',
}

const rebuOriginal: OriginalLike = {
  id: 2,
  invoice_type: 'REBU',
  status: 'ISSUED',
  total_amount: '9000.00',
  taxable_base: null,
  vat_rate: null,
  vat_amount: null,
}

describe('computeRectificativaAmounts', () => {
  it('VAT: niega total, base e IVA (neteo exacto a cero) y conserva el tipo de IVA', () => {
    const a = computeRectificativaAmounts(vatOriginal)
    expect(a.total_amount).toBe(-12100)
    expect(a.taxable_base).toBe(-10000)
    expect(a.vat_amount).toBe(-2100)
    expect(a.vehicle_sale_price).toBe(-12100)
    // el tipo impositivo es un porcentaje, NO un importe: no se niega
    expect(a.vat_rate).toBe(21)

    // la suma con la original da exactamente cero
    expect(a.total_amount + Number(vatOriginal.total_amount)).toBe(0)
    expect(a.taxable_base! + Number(vatOriginal.taxable_base)).toBe(0)
    expect(a.vat_amount! + Number(vatOriginal.vat_amount)).toBe(0)
  })

  it('VAT legacy sin desglose guardado: deriva base/cuota del total y las niega', () => {
    const a = computeRectificativaAmounts({
      ...vatOriginal,
      status: 'IMPORTED',
      taxable_base: null,
      vat_amount: null,
      vat_rate: null,
    })
    expect(a.total_amount).toBe(-12100)
    expect(a.taxable_base).toBe(-10000) // 12100 / 1,21
    expect(a.vat_amount).toBe(-2100)
    expect(a.vat_rate).toBe(21)
  })

  it('REBU: total negativo y SIN desglose (invariante que usa el libro IVA)', () => {
    const a = computeRectificativaAmounts(rebuOriginal)
    expect(a.total_amount).toBe(-9000)
    expect(a.vehicle_sale_price).toBe(-9000)
    expect(a.taxable_base).toBeNull()
    expect(a.vat_amount).toBeNull()
    expect(a.vat_rate).toBeNull()
  })

  it('importe inválido → INVALID_AMOUNT', () => {
    expect(() =>
      computeRectificativaAmounts({ ...vatOriginal, total_amount: 'nan' })
    ).toThrow(RectificarError)
  })
})

describe('assertRectificable', () => {
  it('acepta ISSUED, PDF_PENDING e IMPORTED', () => {
    for (const status of ['ISSUED', 'PDF_PENDING', 'IMPORTED']) {
      expect(() => assertRectificable({ ...vatOriginal, status })).not.toThrow()
    }
  })

  it('no se puede rectificar una rectificativa', () => {
    try {
      assertRectificable({ ...vatOriginal, invoice_type: 'RECTIFYING', total_amount: '-12100' })
      throw new Error('debió lanzar')
    } catch (e) {
      expect(e).toBeInstanceOf(RectificarError)
      expect((e as RectificarError).code).toBe('NOT_RECTIFIABLE')
      expect((e as RectificarError).httpStatus).toBe(409)
    }
  })

  it('una factura ya rectificada → ALREADY_RECTIFIED (409)', () => {
    try {
      assertRectificable({ ...vatOriginal, status: 'RECTIFIED' })
      throw new Error('debió lanzar')
    } catch (e) {
      expect((e as RectificarError).code).toBe('ALREADY_RECTIFIED')
      expect((e as RectificarError).httpStatus).toBe(409)
    }
  })

  it('marca rectified_by_invoice_id presente → ALREADY_RECTIFIED aunque el status no se haya actualizado', () => {
    try {
      assertRectificable({ ...vatOriginal, rectified_by_invoice_id: 77 })
      throw new Error('debió lanzar')
    } catch (e) {
      expect((e as RectificarError).code).toBe('ALREADY_RECTIFIED')
      expect((e as RectificarError).details?.rectificativaId).toBe(77)
    }
  })

  it('VOIDED / ERROR → INVALID_STATUS (nunca llegaron a ser una factura viva)', () => {
    for (const status of ['VOIDED', 'ERROR']) {
      try {
        assertRectificable({ ...vatOriginal, status })
        throw new Error('debió lanzar')
      } catch (e) {
        expect((e as RectificarError).code).toBe('INVALID_STATUS')
      }
    }
  })
})

describe('normalizeMotivo', () => {
  it('recorta y acepta un motivo válido', () => {
    expect(normalizeMotivo('  factura duplicada  ')).toBe('factura duplicada')
  })

  it('vacío o demasiado corto → MOTIVO_REQUERIDO (400)', () => {
    for (const bad of ['', '  ', 'ab', undefined, null, 42]) {
      try {
        normalizeMotivo(bad)
        throw new Error('debió lanzar')
      } catch (e) {
        expect((e as RectificarError).code).toBe('MOTIVO_REQUERIDO')
        expect((e as RectificarError).httpStatus).toBe(400)
      }
    }
  })
})
