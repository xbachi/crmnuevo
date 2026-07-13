/**
 * Origen de la compra ↔ régimen de la factura (el error del VW Taigo 3835LWT).
 *
 * Comprado a un particular por 18.500 € (contrato: un particular no factura) y
 * vendido por 21.760 € con IVA general → 3.776,53 € de IVA sobre el TOTAL en vez
 * de 565,79 € sobre el margen (REBU). 3.210,74 € de más.
 */

import {
  deducirOrigen,
  evaluarRegimen,
  ivaRegimenGeneral,
  ivaRebuMargen,
  EVIDENCIA_VACIA,
  type EvidenciaCompra,
} from '@/lib/origenCompra'

const TAIGO_VENTA = 21760
const TAIGO_COMPRA = 18500

const evidencia = (p: Partial<EvidenciaCompra>): EvidenciaCompra => ({
  ...EVIDENCIA_VACIA,
  ...p,
})

describe('deducirOrigen', () => {
  it('contrato sin factura → particular (un particular no emite facturas)', () => {
    expect(deducirOrigen(evidencia({ contratoCompra: true }))).toBe(
      'particular'
    )
  })

  it('factura de compra → empresa', () => {
    expect(deducirOrigen(evidencia({ facturaCompra: true }))).toBe('empresa')
  })

  it('factura Y contrato → empresa: la factura manda (hay IVA soportado deducible)', () => {
    expect(
      deducirOrigen(evidencia({ facturaCompra: true, contratoCompra: true }))
    ).toBe('empresa')
  })

  it('sin evidencia → desconocido (no se inventa certeza)', () => {
    expect(deducirOrigen(EVIDENCIA_VACIA)).toBe('desconocido')
  })

  it('depósito manda: el coche no se compró', () => {
    expect(
      deducirOrigen(evidencia({ esDeposito: true, contratoCompra: true }))
    ).toBe('deposito')
  })
})

describe('cálculo del IVA (importes reales del Taigo)', () => {
  it('régimen general: IVA sobre el precio total', () => {
    expect(ivaRegimenGeneral(TAIGO_VENTA)).toBe(3776.53)
  })

  it('REBU: IVA sobre el margen (21/121 × (venta − compra))', () => {
    expect(ivaRebuMargen(TAIGO_VENTA, TAIGO_COMPRA)).toBe(565.79)
  })

  it('margen negativo (venta a pérdida) → cuota REBU 0, nunca negativa', () => {
    expect(ivaRebuMargen(10000, 12000)).toBe(0)
  })

  it('sin precio de compra cargado no se puede calcular el margen', () => {
    expect(ivaRebuMargen(TAIGO_VENTA, null)).toBeNull()
    expect(ivaRebuMargen(TAIGO_VENTA, 0)).toBeNull()
  })
})

describe('evaluarRegimen', () => {
  it('particular + VAT → BLOQUEA con la diferencia real de IVA', () => {
    const aviso = evaluarRegimen({
      invoiceType: 'VAT',
      total: TAIGO_VENTA,
      evidencia: evidencia({
        contratoCompra: true,
        precioCompra: TAIGO_COMPRA,
      }),
    })
    expect(aviso).toMatchObject({
      code: 'REGIMEN_INCOHERENTE',
      severidad: 'bloqueante',
      origen: 'particular',
      ivaGeneral: 3776.53,
      ivaRebu: 565.79,
      diferencia: 3210.74,
    })
    expect(aviso!.message).toContain('particular')
    expect(aviso!.message).toContain('3.210,74')
  })

  it('particular sin precio de compra: bloquea igual, sin inventar la diferencia', () => {
    const aviso = evaluarRegimen({
      invoiceType: 'VAT',
      total: TAIGO_VENTA,
      evidencia: evidencia({ contratoCompra: true, precioCompra: null }),
    })
    expect(aviso).toMatchObject({
      code: 'REGIMEN_INCOHERENTE',
      severidad: 'bloqueante',
      ivaRebu: null,
      diferencia: null,
    })
    expect(aviso!.message).toContain('no tiene precio de compra cargado')
  })

  it('particular + REBU → nada que decir (es lo correcto)', () => {
    expect(
      evaluarRegimen({
        invoiceType: 'REBU',
        total: TAIGO_VENTA,
        evidencia: evidencia({
          contratoCompra: true,
          precioCompra: TAIGO_COMPRA,
        }),
      })
    ).toBeNull()
  })

  it('empresa (factura de compra) + VAT → sin avisos', () => {
    expect(
      evaluarRegimen({
        invoiceType: 'VAT',
        total: TAIGO_VENTA,
        evidencia: evidencia({
          facturaCompra: true,
          precioCompra: TAIGO_COMPRA,
        }),
      })
    ).toBeNull()
  })

  it('depósito + VAT → sin avisos (no hay compra que contrastar)', () => {
    expect(
      evaluarRegimen({
        invoiceType: 'VAT',
        total: TAIGO_VENTA,
        evidencia: evidencia({ esDeposito: true }),
      })
    ).toBeNull()
  })

  it('sin evidencia (Hyundai Kona 6935KYC) + VAT → avisa pero NO bloquea', () => {
    const aviso = evaluarRegimen({
      invoiceType: 'VAT',
      total: 15000,
      evidencia: EVIDENCIA_VACIA,
    })
    expect(aviso).toMatchObject({
      code: 'ORIGEN_NO_VERIFICADO',
      severidad: 'aviso',
      origen: 'desconocido',
    })
    expect(aviso!.message).toContain('No se pudo verificar el origen')
  })
})
