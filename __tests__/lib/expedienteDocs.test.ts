/**
 * detectarDocs / docsFaltantes / matriculaFromCarpeta contra los NOMBRES
 * REALES del OneDrive productivo (carpetas y archivos vistos en GESTORIA).
 */

import {
  analizarCarpeta,
  detectarDocs,
  docsFaltantes,
  indexarRegistros,
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

  it('deposito sin contrato de depósito → NO falta nada (la gestoría no lo pide)', () => {
    const docs = detectarDocs([
      { nombre: 'factura-iva-F-2026-4221.pdf' },
      { nombre: 'Contrato comprador.jpeg' },
    ])
    expect(docsFaltantes('deposito', docs)).toEqual([])
  })

  it('deposito sin contrato de venta → sí falta el contrato de venta', () => {
    const docs = detectarDocs([{ nombre: 'factura-iva-F-2026-4221.pdf' }])
    expect(docsFaltantes('deposito', docs)).toEqual(['contrato-venta'])
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

// ---------------------------------------------------------------------------
// Casos reales del 2T 2026 que el detector por nombre no veía (falsos "falta X").
// ---------------------------------------------------------------------------

const MD5_COMPRA = 'a'.repeat(32)
const MD5_OTRO = 'b'.repeat(32)

describe('detectarDocs — casos reales que fallaban por el nombre', () => {
  it('FRA-compra.pdf (68-Kia-Xceed-0608NLF) → facturaCompra por nombre ("FRA" = factura)', () => {
    expect(detectar('FRA-compra.pdf')).toEqual(soloUno('facturaCompra'))
  })

  it('Contrrato compra-sandero.jpeg (typo real) → contratoCompra', () => {
    expect(detectar('Contrrato compra-sandero.jpeg')).toEqual(soloUno('contratoCompra'))
  })

  it('Contrato vendedor.jpeg → contratoCompra (lo firma quien nos vende)', () => {
    expect(detectar('Contrato vendedor.jpeg')).toEqual(soloUno('contratoCompra'))
  })

  it('factura.pdf a secas NO se da por buena: queda ambigua', () => {
    const r = analizarCarpeta([{ nombre: 'factura.pdf' }])
    expect(r.docs.facturaCompra).toBe(false)
    expect(r.docs.facturaVenta).toBe(false)
    expect(r.ambiguos).toEqual([
      { nombre: 'factura.pdf', motivo: 'no se pudo clasificar por hash ni por nombre' },
    ])
  })

  it('factura.pdf (64-Vw-Golf-0886LRM) se resuelve por HASH contra facturas_registro', () => {
    const hashes = indexarRegistros([
      { hash: MD5_COMPRA, categoria: 'coche-compra', matricula: '0886LRM' },
    ])
    const r = analizarCarpeta([{ nombre: 'factura.pdf', hash: MD5_COMPRA }], {
      hashes,
      matricula: '0886LRM',
    })
    expect(r.docs).toEqual(soloUno('facturaCompra'))
    expect(r.ambiguos).toEqual([])
  })

  it('el hash de la factura de compra de OTRO coche no completa la carpeta', () => {
    const hashes = indexarRegistros([
      { hash: MD5_COMPRA, categoria: 'coche-compra', matricula: '9999ZZZ' },
    ])
    const r = analizarCarpeta([{ nombre: 'factura.pdf', hash: MD5_COMPRA }], {
      hashes,
      matricula: '0886LRM',
    })
    expect(r.docs.facturaCompra).toBe(false)
    expect(r.ambiguos).toHaveLength(1)
  })
})

describe('alertas de contenido', () => {
  it('duplicado: FRA.pdf y "Sevencars Motors SL ESW-MP-19.pdf" con el mismo md5', () => {
    const archivos = [
      { nombre: 'FRA.pdf', bytes: 311878, hash: MD5_COMPRA },
      { nombre: 'Sevencars Motors SL ESW-MP-19.pdf', bytes: 311878, hash: MD5_COMPRA },
    ]
    const hashes = indexarRegistros([
      { hash: MD5_COMPRA, categoria: 'coche-compra', matricula: '0608NLF' },
    ])
    const r = analizarCarpeta(archivos, { hashes, matricula: '0608NLF' })
    expect(r.duplicados).toEqual([
      { hash: MD5_COMPRA, nombres: ['FRA.pdf', 'Sevencars Motors SL ESW-MP-19.pdf'] },
    ])
    expect(r.mismoArchivoDosNombres).toEqual([])
    // el hash lo identifica: la factura de compra SÍ está (una sola vez)
    expect(r.docs).toEqual(soloUno('facturaCompra'))
  })

  it('mismoArchivoDosNombres: Factura-Compra y Contrato-Compra son el mismo archivo', () => {
    const archivos = [
      { nombre: 'Factura-Compra-1222BBL.pdf', bytes: 4620586, hash: MD5_OTRO },
      { nombre: 'Contrato-Compra-1222BBL.pdf', bytes: 4620586, hash: MD5_OTRO },
    ]
    const r = analizarCarpeta(archivos, { matricula: '1222BBL' })
    expect(r.mismoArchivoDosNombres).toEqual([
      {
        hash: MD5_OTRO,
        nombres: ['Factura-Compra-1222BBL.pdf', 'Contrato-Compra-1222BBL.pdf'],
        docs: ['facturaCompra', 'contratoCompra'],
      },
    ])
    expect(r.duplicados).toEqual([])
    // NINGUNO de los dos nombres es confiable: uno de los documentos no existe
    expect(r.docs.facturaCompra).toBe(false)
    expect(r.docs.contratoCompra).toBe(false)
    expect(r.ambiguos).toHaveLength(2)
  })

  it('con hash conocido, el conflicto se resuelve a favor del registro de facturas', () => {
    const hashes = indexarRegistros([
      { hash: MD5_OTRO, categoria: 'coche-compra', matricula: '1222BBL' },
    ])
    const r = analizarCarpeta(
      [
        { nombre: 'Factura-Compra-1222BBL.pdf', hash: MD5_OTRO },
        { nombre: 'Contrato-Compra-1222BBL.pdf', hash: MD5_OTRO },
      ],
      { hashes, matricula: '1222BBL' }
    )
    expect(r.mismoArchivoDosNombres).toHaveLength(1) // se avisa igual
    expect(r.docs).toEqual(soloUno('facturaCompra')) // el contrato NO existe
    expect(r.ambiguos).toEqual([])
  })

  it('ambiguo: archivo sin pistas en el nombre y sin hash conocido', () => {
    const r = analizarCarpeta([{ nombre: 'Sevencars Motors SL ESW-MP-19.pdf' }])
    expect(r.ambiguos).toEqual([
      {
        nombre: 'Sevencars Motors SL ESW-MP-19.pdf',
        motivo: 'no se pudo clasificar por hash ni por nombre',
      },
    ])
  })

  it('documentos que no son de la checklist no ensucian la lista de ambiguos', () => {
    const r = analizarCarpeta([{ nombre: 'permiso-circulacion.pdf' }, { nombre: 'ficha-tecnica.pdf' }])
    expect(r.ambiguos).toEqual([])
    expect(r.duplicados).toEqual([])
  })
})

describe('compatibilidad con snapshots viejos (sin hash)', () => {
  it('sin hash y sin registros, la detección es idéntica a la de siempre', () => {
    const archivos = [
      { nombre: 'Factura-Venta-F-2026-020.pdf' },
      { nombre: 'Factura-Compra-XXXX.pdf' },
      { nombre: 'Contrato comprador.jpeg' },
    ]
    const r = analizarCarpeta(archivos)
    expect(r.docs).toEqual({
      facturaVenta: true,
      facturaCompra: true,
      contratoCompra: false,
      contratoVenta: true,
      contratoDeposito: false,
    })
    expect(r.duplicados).toEqual([])
    expect(r.mismoArchivoDosNombres).toEqual([])
  })

  it('archivos con hash null (ilegibles en el mount) no rompen ni se agrupan', () => {
    const r = analizarCarpeta([
      { nombre: 'Factura-Compra-XXXX.pdf', hash: null },
      { nombre: 'Contrato-Venta-8700GKW.jpeg', hash: null },
    ])
    expect(r.docs.facturaCompra).toBe(true)
    expect(r.docs.contratoVenta).toBe(true)
    expect(r.duplicados).toEqual([])
  })

  it('detectarDocs mantiene la firma vieja (sólo nombres)', () => {
    expect(detectarDocs([{ nombre: 'Factura-Venta-F-2026-020.pdf' }])).toEqual(
      soloUno('facturaVenta')
    )
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
