/**
 * Convención canónica de nombres: {Tipo-Doc}-{Marca}-{Modelo}-{Matricula}.{ext}
 */

import {
  extensionDe,
  matriculaCanonica,
  nombreCanonico,
  nombreFacturaVenta,
  planNombresCarpeta,
  segmento,
} from '@/lib/nombreCanonico'

describe('nombreCanonico — casos reales', () => {
  it('factura de venta del Opel Astra', () => {
    expect(
      nombreCanonico(
        'facturaVenta',
        { marca: 'Opel', modelo: 'Astra', matricula: '8061KRN' },
        'factura-venta (1).pdf'
      )
    ).toBe('Factura-Venta-Opel-Astra-8061KRN.pdf')
  })

  it('contrato de compra del Peugeot 206', () => {
    expect(
      nombreCanonico(
        'contratoCompra',
        { marca: 'peugeot', modelo: '206', matricula: '1222 BBL' },
        'Contrrato compra-sandero.jpeg'
      )
    ).toBe('Contrato-Compra-Peugeot-206-1222BBL.jpeg')
  })

  it('factura de compra del Kia Xceed ("FRA.pdf")', () => {
    expect(
      nombreCanonico(
        'facturaCompra',
        { marca: 'KIA', modelo: 'XCEED', matricula: '0608nlf' },
        'FRA.pdf'
      )
    ).toBe('Factura-Compra-Kia-Xceed-0608NLF.pdf')
  })

  it('sin marca ni modelo: omite el segmento, sin guiones dobles', () => {
    expect(
      nombreCanonico('facturaVenta', { marca: null, modelo: null, matricula: '8061KRN' }, 'x.pdf')
    ).toBe('Factura-Venta-8061KRN.pdf')
    expect(
      nombreCanonico('facturaVenta', { marca: 'Opel', modelo: '', matricula: '8061KRN' }, 'x.pdf')
    ).toBe('Factura-Venta-Opel-8061KRN.pdf')
  })

  it('acentos y espacios: sin tildes, con guiones, Title-Case', () => {
    expect(segmento('citroën c4 picasso')).toBe('Citroen-C4-Picasso')
    expect(
      nombreCanonico(
        'contratoDeposito',
        { marca: 'Citroën', modelo: 'C4 Picasso', matricula: '1234-abc' },
        'Contrato depósito.PDF'
      )
    ).toBe('Contrato-Deposito-Citroen-C4-Picasso-1234ABC.pdf')
  })

  it('extensión: en minúsculas, y un punto interno no es extensión', () => {
    expect(extensionDe('Sevencars Motors SL ESW-MP-19.pdf')).toBe('.pdf')
    expect(extensionDe('foto.JPEG')).toBe('.jpeg')
    expect(extensionDe('Sevencars Motors S.L')).toBe('')
    expect(extensionDe('sin-extension')).toBe('')
  })

  it('matrícula normalizada', () => {
    expect(matriculaCanonica(' 8061-krn ')).toBe('8061KRN')
    expect(matriculaCanonica(null)).toBe('')
  })
})

describe('planNombresCarpeta', () => {
  const coche = { marca: 'Opel', modelo: 'Astra', matricula: '8061KRN' }

  it('multipágina: -pag2 determinista por nombre original, nunca (1)', () => {
    const plan = planNombresCarpeta(
      [
        { nombre: 'contrato-p2.jpeg', doc: 'contratoCompra', hash: 'bbb' },
        { nombre: 'contrato-p1.jpeg', doc: 'contratoCompra', hash: 'aaa' },
      ],
      coche
    )
    expect(plan.renombrar).toEqual([
      { de: 'contrato-p1.jpeg', a: 'Contrato-Compra-Opel-Astra-8061KRN.jpeg' },
      { de: 'contrato-p2.jpeg', a: 'Contrato-Compra-Opel-Astra-8061KRN-pag2.jpeg' },
    ])
    expect(plan.duplicados).toEqual([])
  })

  it('mismo hash dentro del mismo documento = duplicado (no es una página más)', () => {
    const plan = planNombresCarpeta(
      [
        { nombre: 'factura.pdf', doc: 'facturaCompra', hash: 'abc' },
        { nombre: 'FRA.pdf', doc: 'facturaCompra', hash: 'ABC' },
      ],
      coche
    )
    // Ordena por nombre original: "FRA.pdf" < "factura.pdf" (mayúsculas primero).
    expect(plan.renombrar).toEqual([
      { de: 'FRA.pdf', a: 'Factura-Compra-Opel-Astra-8061KRN.pdf' },
    ])
    expect(plan.duplicados).toEqual([{ nombre: 'factura.pdf', duplicadoDe: 'FRA.pdf' }])
  })

  it('el que ya está canónico no se renombra', () => {
    const plan = planNombresCarpeta(
      [{ nombre: 'Factura-Venta-Opel-Astra-8061KRN.pdf', doc: 'facturaVenta', hash: 'h1' }],
      coche
    )
    expect(plan.renombrar).toEqual([])
    expect(plan.yaCanonicos).toEqual(['Factura-Venta-Opel-Astra-8061KRN.pdf'])
  })

  it('es idempotente: correr el plan sobre el resultado no cambia nada', () => {
    const primera = planNombresCarpeta(
      [{ nombre: 'FRA.pdf', doc: 'facturaCompra', hash: 'h1' }],
      coche
    )
    const segunda = planNombresCarpeta(
      [{ nombre: primera.renombrar[0].a, doc: 'facturaCompra', hash: 'h1' }],
      coche
    )
    expect(segunda.renombrar).toEqual([])
  })
})

describe('nombreFacturaVenta (el nombre con el que NACE la factura emitida)', () => {
  it('usa la convención canónica cuando hay matrícula', () => {
    expect(
      nombreFacturaVenta({ marca: 'Seat', modelo: 'Leon', matricula: '1111AAA' }, 'F-2026-030')
    ).toBe('Factura-Venta-Seat-Leon-1111AAA.pdf')
  })

  it('sin matrícula cae al número de factura (siempre único)', () => {
    expect(nombreFacturaVenta({ marca: null, modelo: null, matricula: null }, 'F-2026-030')).toBe(
      'Factura-Venta-F-2026-030.pdf'
    )
  })
})
