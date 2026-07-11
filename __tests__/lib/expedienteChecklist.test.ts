/**
 * Reglas puras del expediente: checklist requerida por tipo de operación,
 * estado derivado (regla dura: un expediente incompleto NUNCA se considera
 * finalizado) e inferencia del tipo de operación al emitir.
 */

import {
  checklistRequerida,
  checklistInicial,
  evaluarEstado,
  faltanRequeridos,
  inferirTipoOperacion,
  esDepositoVehiculoTipo,
  type ChecklistItem,
} from '@/lib/expedienteChecklist'

const claves = (tipo: Parameters<typeof checklistRequerida>[0]) =>
  checklistRequerida(tipo).map((i) => [i.clave, i.requerido])

describe('checklistRequerida', () => {
  it('retail-vat: factura-venta + contrato-venta + factura-compra, todos requeridos', () => {
    expect(claves('retail-vat')).toEqual([
      ['factura-venta', true],
      ['contrato-venta', true],
      ['factura-compra', true],
    ])
  })

  it('retail-rebu: exige CONTRATO de compra (comprado a particular), no factura', () => {
    expect(claves('retail-rebu')).toEqual([
      ['factura-venta', true],
      ['contrato-venta', true],
      ['contrato-compra', true],
    ])
  })

  it('b2b: factura-compra requerida, contrato-compra opcional', () => {
    expect(claves('b2b')).toEqual([
      ['factura-venta', true],
      ['contrato-venta', true],
      ['factura-compra', true],
      ['contrato-compra', false],
    ])
  })

  it('deposito: exige contrato de depósito además de factura y contrato de venta', () => {
    expect(claves('deposito')).toEqual([
      ['factura-venta', true],
      ['contrato-venta', true],
      ['contrato-deposito', true],
    ])
  })

  it('checklistInicial arranca con todo presente=false', () => {
    expect(checklistInicial('retail-vat').every((i) => i.presente === false)).toBe(true)
  })
})

describe('evaluarEstado — un expediente incompleto NUNCA está finalizado', () => {
  const conFaltante: ChecklistItem[] = [
    { clave: 'factura-venta', label: 'Factura de venta', requerido: true, presente: true },
    { clave: 'contrato-venta', label: 'Contrato de venta', requerido: true, presente: false },
  ]
  const completa: ChecklistItem[] = conFaltante.map((i) => ({ ...i, presente: true }))

  it('degrada enviado → incompleto si falta un requerido', () => {
    expect(evaluarEstado(conFaltante, 'enviado')).toBe('incompleto')
  })

  it('degrada confirmado → incompleto si falta un requerido', () => {
    expect(evaluarEstado(conFaltante, 'confirmado')).toBe('incompleto')
  })

  it('promueve incompleto → completo cuando todos los requeridos están', () => {
    expect(evaluarEstado(completa, 'incompleto')).toBe('completo')
  })

  it('conserva enviado/confirmado cuando la checklist sigue completa', () => {
    expect(evaluarEstado(completa, 'enviado')).toBe('enviado')
    expect(evaluarEstado(completa, 'confirmado')).toBe('confirmado')
  })

  it('un opcional ausente no vuelve incompleto el expediente', () => {
    const conOpcional: ChecklistItem[] = [
      ...completa,
      { clave: 'contrato-compra', label: 'Contrato de compra', requerido: false, presente: false },
    ]
    expect(evaluarEstado(conOpcional, 'incompleto')).toBe('completo')
    expect(faltanRequeridos(conOpcional)).toEqual([])
  })
})

describe('inferirTipoOperacion', () => {
  it('depósito manda sobre todo lo demás', () => {
    expect(inferirTipoOperacion({ invoiceType: 'REBU', esDeposito: true })).toBe('deposito')
    expect(inferirTipoOperacion({ esB2B: true, esDeposito: true })).toBe('deposito')
  })

  it('B2B manda sobre el tipo de factura', () => {
    expect(inferirTipoOperacion({ invoiceType: 'REBU', esB2B: true })).toBe('b2b')
  })

  it('REBU → retail-rebu, VAT/desconocido → retail-vat', () => {
    expect(inferirTipoOperacion({ invoiceType: 'REBU' })).toBe('retail-rebu')
    expect(inferirTipoOperacion({ invoiceType: 'VAT' })).toBe('retail-vat')
    expect(inferirTipoOperacion({})).toBe('retail-vat')
  })
})

describe('esDepositoVehiculoTipo', () => {
  it('reconoce las variantes reales de Vehiculo.tipo', () => {
    expect(esDepositoVehiculoTipo('Deposito Venta')).toBe(true)
    expect(esDepositoVehiculoTipo('Depósito')).toBe(true)
    expect(esDepositoVehiculoTipo('D')).toBe(true)
    expect(esDepositoVehiculoTipo('Compra')).toBe(false)
    expect(esDepositoVehiculoTipo('Coche R')).toBe(false)
    expect(esDepositoVehiculoTipo(null)).toBe(false)
  })
})
