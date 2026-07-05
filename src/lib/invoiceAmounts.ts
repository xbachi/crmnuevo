/**
 * Cálculo puro del desglose de importes de una factura (IVA / REBU).
 *
 * Extraído de invoiceService.ts para poder testearlo sin arrastrar las
 * dependencias de red/DB (pg, @vercel/blob, generador de PDF). El
 * comportamiento es idéntico: es la misma función, sólo movida aquí.
 *
 * Reglas contables (mismas que el generador de PDF, contractGenerator.ts):
 *  - VAT: el total YA incluye el 21% de IVA → base imponible = total / 1,21.
 *  - REBU: el total no lleva desglose de IVA en la factura.
 */

import { INVOICE_CONFIG } from '@/config/invoiceConfig'
import type { InvoiceType } from '@/lib/invoiceRepository'

export interface Amounts {
  vehicle_sale_price: number
  taxable_base: number | null
  vat_rate: number | null
  vat_amount: number | null
  total_amount: number
  rebu_margin: number | null
  rebu_taxable_base: number | null
  rebu_vat_amount: number | null
}

export function computeAmounts(total: number, type: InvoiceType): Amounts {
  if (type === 'VAT') {
    const rate = INVOICE_CONFIG.vat.standardRate
    const taxableBase = Number((total / (1 + rate / 100)).toFixed(2))
    const vatAmount = Number((total - taxableBase).toFixed(2))
    return {
      vehicle_sale_price: total,
      taxable_base: taxableBase,
      vat_rate: rate,
      vat_amount: vatAmount,
      total_amount: total,
      rebu_margin: null,
      rebu_taxable_base: null,
      rebu_vat_amount: null,
    }
  }
  // REBU: se conservan los totales; margen/base/iva son campos contables que el
  // gestor puede querer luego, pero la factura en sí no los muestra.
  return {
    vehicle_sale_price: total,
    taxable_base: null,
    vat_rate: null,
    vat_amount: null,
    total_amount: total,
    rebu_margin: null,
    rebu_taxable_base: null,
    rebu_vat_amount: null,
  }
}
