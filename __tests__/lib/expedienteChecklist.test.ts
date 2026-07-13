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
  itemFalta,
  inferirTipoOperacion,
  esDepositoVehiculoTipo,
  GRUPO_JUSTIFICANTE_COMPRA,
  type ChecklistItem,
} from '@/lib/expedienteChecklist'

const claves = (tipo: Parameters<typeof checklistRequerida>[0]) =>
  checklistRequerida(tipo).map((i) => [i.clave, i.requerido])

describe('checklistRequerida', () => {
  it('retail-vat: el justificante de compra es factura O contrato (comprar a un particular no da factura)', () => {
    expect(claves('retail-vat')).toEqual([
      ['factura-venta', true],
      ['contrato-venta', false],
      ['factura-compra', true],
      ['contrato-compra', true],
    ])
    // los dos justificantes van en el mismo grupo "al menos uno"
    expect(
      checklistRequerida('retail-vat')
        .filter((i) => i.grupo === GRUPO_JUSTIFICANTE_COMPRA)
        .map((i) => i.clave)
    ).toEqual(['factura-compra', 'contrato-compra'])
  })

  it('retail-rebu: mismo grupo — un REBU puede venir de un dealer que SÍ factura', () => {
    expect(claves('retail-rebu')).toEqual([
      ['factura-venta', true],
      ['contrato-venta', true],
      ['factura-compra', true],
      ['contrato-compra', true],
    ])
  })

  it('b2b: mismo grupo de justificante de compra; contrato-venta opcional', () => {
    expect(claves('b2b')).toEqual([
      ['factura-venta', true],
      ['contrato-venta', false],
      ['factura-compra', true],
      ['contrato-compra', true],
    ])
  })

  it('deposito: NO exige justificante de compra (el coche no se compró)', () => {
    expect(claves('deposito').map(([c]) => c)).not.toContain('factura-compra')
    expect(claves('deposito').map(([c]) => c)).not.toContain('contrato-compra')
  })

  it('deposito: el contrato de depósito NO es requerido (la gestoría no lo pide)', () => {
    expect(claves('deposito')).toEqual([
      ['factura-venta', true],
      ['contrato-venta', true],
      ['contrato-deposito', false],
    ])
  })

  it('checklistInicial arranca con todo presente=false', () => {
    expect(
      checklistInicial('retail-vat').every((i) => i.presente === false)
    ).toBe(true)
  })
})

describe('evaluarEstado — un expediente incompleto NUNCA está finalizado', () => {
  const conFaltante: ChecklistItem[] = [
    {
      clave: 'factura-venta',
      label: 'Factura de venta',
      requerido: true,
      presente: true,
    },
    {
      clave: 'contrato-venta',
      label: 'Contrato de venta',
      requerido: true,
      presente: false,
    },
  ]
  const completa: ChecklistItem[] = conFaltante.map((i) => ({
    ...i,
    presente: true,
  }))

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
      {
        clave: 'contrato-compra',
        label: 'Contrato de compra',
        requerido: false,
        presente: false,
      },
    ]
    expect(evaluarEstado(conOpcional, 'incompleto')).toBe('completo')
    expect(faltanRequeridos(conOpcional)).toEqual([])
  })
})

describe('inferirTipoOperacion', () => {
  it('depósito manda sobre todo lo demás', () => {
    expect(
      inferirTipoOperacion({ invoiceType: 'REBU', esDeposito: true })
    ).toBe('deposito')
    expect(inferirTipoOperacion({ esB2B: true, esDeposito: true })).toBe(
      'deposito'
    )
  })

  it('B2B manda sobre el tipo de factura', () => {
    expect(inferirTipoOperacion({ invoiceType: 'REBU', esB2B: true })).toBe(
      'b2b'
    )
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

describe('justificante de compra — grupo "al menos uno" (bug del VW Taigo 3835LWT)', () => {
  const conJustificante = (docs: {
    factura?: boolean
    contrato?: boolean
  }): ChecklistItem[] =>
    checklistRequerida('retail-vat').map((def) => ({
      ...def,
      presente:
        def.clave === 'factura-venta' ||
        (def.clave === 'factura-compra' && docs.factura === true) ||
        (def.clave === 'contrato-compra' && docs.contrato === true),
    }))

  it('coche de PARTICULAR vendido con IVA: el contrato basta, NO falta la factura de compra', () => {
    const checklist = conJustificante({ contrato: true })
    expect(faltanRequeridos(checklist)).toEqual([])
    expect(evaluarEstado(checklist, 'incompleto')).toBe('completo')
    // la factura de compra no existe y no se pinta como faltante
    const facturaCompra = checklist.find((i) => i.clave === 'factura-compra')!
    expect(itemFalta(checklist, facturaCompra)).toBe(false)
  })

  it('coche de EMPRESA: la factura de compra basta, el contrato no hace falta', () => {
    const checklist = conJustificante({ factura: true })
    expect(faltanRequeridos(checklist)).toEqual([])
    const contrato = checklist.find((i) => i.clave === 'contrato-compra')!
    expect(itemFalta(checklist, contrato)).toBe(false)
  })

  it('SIN ningún justificante (Hyundai Kona 6935KYC): falta, y una sola vez', () => {
    const checklist = conJustificante({})
    expect(faltanRequeridos(checklist)).toEqual([GRUPO_JUSTIFICANTE_COMPRA])
    expect(evaluarEstado(checklist, 'confirmado')).toBe('incompleto')
    for (const clave of ['factura-compra', 'contrato-compra']) {
      expect(
        itemFalta(checklist, checklist.find((i) => i.clave === clave)!)
      ).toBe(true)
    }
  })
})
