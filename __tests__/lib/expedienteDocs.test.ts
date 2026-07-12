/**
 * detectarDocs / docsFaltantes / matriculaFromCarpeta contra los NOMBRES
 * REALES del OneDrive productivo (carpetas y archivos vistos en GESTORIA).
 */

import {
  detectarDocs,
  docsFaltantes,
  matriculaFromCarpeta,
  type DocsDetectados,
} from '@/lib/expedienteDocs'

const soloUno = (flag: keyof DocsDetectados): DocsDetectados => ({
  facturaVenta: false,
  facturaCompra: false,
  contratoCompra: false,
  contratoVenta: false,
  contratoDeposito: false,
  [flag]: true,
})

const detectar = (nombre: string) => detectarDocs([{ nombre }])

describe('detectarDocs — nombres reales de factura de venta', () => {
  it.each([
    'Factura-Venta-F-2026-020.pdf',
    'factura-rebu-factura-rebu-F-2026-019.pdf',
    'factura-iva-F-2026-4221.pdf',
    'factura-R-2026-026 compra venta.pdf',
  ])('%s → sólo facturaVenta', (nombre) => {
    expect(detectar(nombre)).toEqual(soloUno('facturaVenta'))
  })
})

describe('detectarDocs — compra y contratos reales', () => {
  it('Factura-Compra-XXXX.pdf → sólo facturaCompra', () => {
    expect(detectar('Factura-Compra-XXXX.pdf')).toEqual(soloUno('facturaCompra'))
  })

  it.each([
    'Contrato-Compra-8121LBC.jpeg',
    'Contrato compra A4 1187 MGT.jpeg',
    'CONTRATO COMPRA VENTA.jpeg', // REBU de particular: cuenta como contrato de compra
  ])('%s → sólo contratoCompra', (nombre) => {
    expect(detectar(nombre)).toEqual(soloUno('contratoCompra'))
  })

  it.each([
    'Contrato comprador.jpeg', // = contrato de venta firmado por el comprador
    'Contrato-Venta-pag1-8700GKW.jpeg',
  ])('%s → sólo contratoVenta', (nombre) => {
    expect(detectar(nombre)).toEqual(soloUno('contratoVenta'))
  })

  it.each([
    'Contrato-Deposito-7487MGV.jpeg',
    'Contrato depósito.jpeg', // con acento
  ])('%s → sólo contratoDeposito', (nombre) => {
    expect(detectar(nombre)).toEqual(soloUno('contratoDeposito'))
  })

  it('acumula flags sobre varios archivos', () => {
    const docs = detectarDocs([
      { nombre: 'Factura-Venta-F-2026-020.pdf' },
      { nombre: 'Contrato-Deposito-7487MGV.jpeg' },
      { nombre: 'Contrato comprador.jpeg' },
    ])
    expect(docs).toEqual({
      facturaVenta: true,
      facturaCompra: false,
      contratoCompra: false,
      contratoVenta: true,
      contratoDeposito: true,
    })
  })

  it('archivos irrelevantes no detectan nada', () => {
    expect(detectar('permiso-circulacion.pdf')).toEqual({
      facturaVenta: false,
      facturaCompra: false,
      contratoCompra: false,
      contratoVenta: false,
      contratoDeposito: false,
    })
  })
})

describe('docsFaltantes por tipo de operación', () => {
  const docsRetailVat = detectarDocs([
    { nombre: 'Factura-Venta-F-2026-020.pdf' },
    { nombre: 'Factura-Compra-XXXX.pdf' },
    { nombre: 'Contrato comprador.jpeg' },
  ])

  it('retail-vat completo → sin faltantes', () => {
    expect(docsFaltantes('retail-vat', docsRetailVat)).toEqual([])
  })

  it('retail-vat sin factura de compra → falta factura-compra', () => {
    const docs = detectarDocs([
      { nombre: 'Factura-Venta-F-2026-020.pdf' },
      { nombre: 'Contrato comprador.jpeg' },
    ])
    expect(docsFaltantes('retail-vat', docs)).toEqual(['factura-compra'])
  })

  it('retail-rebu exige CONTRATO de compra (compra venta lo cubre)', () => {
    const docs = detectarDocs([
      { nombre: 'factura-rebu-factura-rebu-F-2026-019.pdf' },
      { nombre: 'CONTRATO COMPRA VENTA.jpeg' },
      { nombre: 'Contrato comprador.jpeg' },
    ])
    expect(docsFaltantes('retail-rebu', docs)).toEqual([])
  })

  it('deposito sin contrato de depósito → falta contrato-deposito', () => {
    const docs = detectarDocs([
      { nombre: 'factura-iva-F-2026-4221.pdf' },
      { nombre: 'Contrato comprador.jpeg' },
    ])
    expect(docsFaltantes('deposito', docs)).toEqual(['contrato-deposito'])
  })

  it('b2b: contrato-compra es opcional, no cuenta como faltante', () => {
    expect(docsFaltantes('b2b', docsRetailVat)).toEqual([])
  })

  it('desconocido: exige factura de venta + justificante de compra', () => {
    expect(docsFaltantes('desconocido', detectar('permiso-circulacion.pdf'))).toEqual([
      'factura-venta',
      'factura-compra o contrato-compra',
    ])
    // contrato de compra alcanza como justificante
    const conContrato = detectarDocs([
      { nombre: 'factura-iva-F-2026-4221.pdf' },
      { nombre: 'Contrato-Compra-8121LBC.jpeg' },
    ])
    expect(docsFaltantes('desconocido', conContrato)).toEqual([])
  })
})

describe('matriculaFromCarpeta — nombres reales de carpeta', () => {
  it.each([
    ['68-Kia-Xceed-0608NLF', '0608NLF'], // la D final de Xceed NO es parte de la matrícula
    ['74-Opel-Astra-8061KRN', '8061KRN'],
    ['D-4-Audi-A4-Avant-1187MGT', '1187MGT'],
    ['D-28-Fiat-500-7487MGV', '7487MGV'],
    ['R-24-VW-Eos-8700GKW', '8700GKW'],
    ['79- Hyundai Kona-6935KYC', '6935KYC'], // espacios sueltos
    ['Yamaha Raptor quad-E9961BDJ', 'E9961BDJ'], // formato viejo con letra
    ['71-Ford-Puma-Alemania-4864LNP', '4864LNP'],
  ])('%s → %s', (carpeta, esperada) => {
    expect(matriculaFromCarpeta(carpeta)).toBe(esperada)
  })

  it('devuelve null si no hay matrícula reconocible', () => {
    expect(matriculaFromCarpeta('Carpeta-sin-matricula')).toBeNull()
    expect(matriculaFromCarpeta('')).toBeNull()
  })
})
