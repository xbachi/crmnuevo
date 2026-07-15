/**
 * Cálculo puro del re-desglose de importes al convertir el RÉGIMEN de una
 * factura de venta ya emitida (VAT ↔ REBU) EN EL LUGAR, conservando número.
 *
 * Invariante dura: el `total_amount` NO cambia nunca. Una conversión de régimen
 * sólo re-reparte el mismo total entre base/IVA (VAT) o margen/cuota (REBU); el
 * eslabón de la cadena Verifactu-lite hashea el total, no la cuota, así que el
 * total intacto mantiene la cadena válida. Quien consuma esto DEBE verificar que
 * el `total_amount` devuelto sigue siendo igual al viejo (guard TOTAL_CAMBIARIA).
 *
 * Extraído a un módulo puro (como invoiceAmounts.ts) para testearlo sin pg ni
 * red, y para que el guard del total pueda forzarse con un mock.
 *
 * Contable (misma convención que invoiceAmounts / contractGenerator):
 *  - VAT : el total YA incluye el IVA → base = total / 1,21 ; cuota = total − base.
 *  - REBU: la cuota va SOLO sobre el margen (precio − compra):
 *          margen = total − precioCompra ; cuota = margen · 21/121.
 */

import { INVOICE_CONFIG } from '@/config/invoiceConfig'

export type RegimenTarget = 'REBU' | 'VAT'

export interface ConvertAmountsInput {
  /** total_amount actual de la factura — NO se toca. */
  total: number
  target: RegimenTarget
  /** Precio de compra del vehículo. Obligatorio y > 0 para VAT→REBU (el caller
   *  ya lo validó); ignorado en REBU→VAT. */
  precioCompra?: number | null
}

export interface ConvertedAmounts {
  taxable_base: number | null
  vat_rate: number | null
  vat_amount: number | null
  rebu_margin: number | null
  rebu_taxable_base: number | null
  rebu_vat_amount: number | null
  /** Debe ser EXACTAMENTE igual a input.total (invariante). */
  total_amount: number
  /** margen ≤ 0 (coche vendido a pérdida): REBU con cuota 0. Sólo VAT→REBU. */
  marginNoPositivo: boolean
}

/** Redondeo a 2 decimales con normalización del -0 (JSON/DB no deben ver -0). */
export function round2(n: number): number {
  const r = Number(n.toFixed(2))
  return Object.is(r, -0) ? 0 : r
}

export function computeConvertedAmounts(
  input: ConvertAmountsInput
): ConvertedAmounts {
  const rate = INVOICE_CONFIG.vat.standardRate // 21
  const total = input.total

  if (input.target === 'VAT') {
    const taxableBase = round2(total / (1 + rate / 100))
    const vatAmount = round2(total - taxableBase)
    return {
      taxable_base: taxableBase,
      vat_rate: rate,
      vat_amount: vatAmount,
      rebu_margin: null,
      rebu_taxable_base: null,
      rebu_vat_amount: null,
      total_amount: total,
      marginNoPositivo: false,
    }
  }

  // VAT → REBU. El caller garantiza precioCompra > 0.
  const precioCompra = input.precioCompra ?? 0
  const margin = round2(total - precioCompra)

  if (margin <= 0) {
    // Coche vendido a pérdida (o a coste): margen 0/negativo → cuota REBU 0.
    return {
      taxable_base: null,
      vat_rate: null,
      vat_amount: null,
      rebu_margin: margin,
      rebu_taxable_base: margin,
      rebu_vat_amount: 0,
      total_amount: total,
      marginNoPositivo: true,
    }
  }

  const rebuTaxableBase = round2(margin / (1 + rate / 100))
  const rebuVatAmount = round2((margin * rate) / (100 + rate))
  return {
    taxable_base: null,
    vat_rate: null,
    vat_amount: null,
    rebu_margin: margin,
    rebu_taxable_base: rebuTaxableBase,
    rebu_vat_amount: rebuVatAmount,
    total_amount: total,
    marginNoPositivo: false,
  }
}
