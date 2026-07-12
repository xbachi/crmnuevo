/**
 * chequearExpedientes / parseCbBandas — fixtures que reproducen los errores
 * reales del cierre 2T 2026: ventas de abril contadas en la banda MARZO,
 * carpetas faltantes en OneDrive y documentos faltantes por tipo de operación.
 */

import {
  chequearExpedientes,
  parseCbBandas,
  mesBanda,
  type CarpetaSnapshot,
} from '@/lib/chequeoExpedientes'
import type { TipoOperacion } from '@/lib/expedienteChecklist'

const carpeta = (
  mes: string,
  nombre: string,
  matricula: string | null,
  archivos: string[]
): CarpetaSnapshot => ({
  mes,
  carpeta: nombre,
  matricula,
  archivos: archivos.map((n) => ({ nombre: n })),
  scannedAt: '2026-07-11 21:15:00+00',
})

const DOCS_COMPLETOS = [
  'Factura-Venta-F-2026-020.pdf',
  'Factura-Compra-XXXX.pdf',
  'Contrato comprador.jpeg',
]

describe('parseCbBandas', () => {
  it('asigna cada coche a su banda y corta en el subtotal', () => {
    const rows = [
      ['MARZO'],
      ['01/03/2026', 'MARZO', '#67', 'Seat León', '1234 ABC'],
      ['02/03/2026', 'MARZO', '#68', 'Kia Xceed', '0608-NLF'],
      ['', '', '', 'TOTAL MARZO'],
      [''],
      ['ABRIL'],
      ['05/04/2026', 'ABRIL', '#74', 'Opel Astra', '8061KRN'],
      ['', '', '', 'TOTAL ABRIL'],
    ]
    expect(parseCbBandas(rows)).toEqual([
      { banda: 'MARZO', matricula: '1234ABC', fila: 2 },
      { banda: 'MARZO', matricula: '0608NLF', fila: 3 },
      { banda: 'ABRIL', matricula: '8061KRN', fila: 7 },
    ])
  })
})

describe('mesBanda', () => {
  it.each([
    ['abril', 'ABRIL'],
    ['04-Abril', 'ABRIL'],
    ['MAYO', 'MAYO'],
    ['junio 2026', 'JUNIO'],
    ['carpeta-rara', null],
  ])('%s → %s', (mes, esperado) => {
    expect(mesBanda(mes)).toBe(esperado)
  })
})

describe('chequearExpedientes', () => {
  const base = {
    year: 2026,
    quarter: 2,
    tipos: new Map<string, TipoOperacion>([['8061KRN', 'retail-vat']]),
  }

  it('detecta bandaIncorrecta: factura de abril en la banda MARZO de CB', () => {
    const res = chequearExpedientes({
      ...base,
      facturas: [{ numero: 'F-2026-020', matricula: '8061KRN', fecha: '2026-04-05' }],
      carpetas: [carpeta('abril', '74-Opel-Astra-8061KRN', '8061KRN', DOCS_COMPLETOS)],
      cb: [{ banda: 'MARZO', matricula: '8061KRN', fila: 12 }],
    })
    const abril = res.meses.find((m) => m.mes === 'ABRIL')!
    expect(abril.descuadres.bandaIncorrecta).toEqual([
      { matricula: '8061KRN', bandaCb: 'MARZO', mesFactura: 'ABRIL' },
    ])
    expect(abril.ok).toBe(false)
    expect(res.resumen.ok).toBe(false)
    expect(res.resumen.bloqueantes.join(' ')).toContain('banda MARZO')
  })

  it('detecta factura sin carpeta y carpeta sin factura', () => {
    const res = chequearExpedientes({
      ...base,
      facturas: [{ numero: 'F-2026-021', matricula: '6935KYC', fecha: '2026-05-10' }],
      carpetas: [carpeta('mayo', '79- Hyundai Kona-0000XXX', '0000XXX', DOCS_COMPLETOS)],
      cb: [{ banda: 'MAYO', matricula: '6935KYC', fila: 20 }],
    })
    const mayo = res.meses.find((m) => m.mes === 'MAYO')!
    expect(mayo.descuadres.facturasSinCarpeta).toEqual([
      { numero: 'F-2026-021', matricula: '6935KYC' },
    ])
    expect(mayo.descuadres.carpetasSinFactura).toEqual(['79- Hyundai Kona-0000XXX'])
    expect(mayo.ok).toBe(false)
  })

  it('detecta cbSinFactura y facturaSinCb', () => {
    const res = chequearExpedientes({
      ...base,
      facturas: [{ numero: 'F-2026-022', matricula: '1187MGT', fecha: '2026-06-01' }],
      carpetas: [carpeta('junio', 'D-4-Audi-A4-Avant-1187MGT', '1187MGT', DOCS_COMPLETOS)],
      cb: [{ banda: 'JUNIO', matricula: '9999ZZZ', fila: 30 }],
    })
    const junio = res.meses.find((m) => m.mes === 'JUNIO')!
    expect(junio.descuadres.cbSinFactura).toEqual(['9999ZZZ'])
    expect(junio.descuadres.facturaSinCb).toEqual([
      { numero: 'F-2026-022', matricula: '1187MGT' },
    ])
  })

  it('dos facturas activas del mismo coche: una carpeta cubre ambas', () => {
    const res = chequearExpedientes({
      ...base,
      facturas: [
        { numero: 'F-2026-023', matricula: '8700GKW', fecha: '2026-04-02' },
        { numero: 'F-2026-024', matricula: '8700-GKW', fecha: '2026-04-02' },
      ],
      carpetas: [carpeta('abril', 'R-24-VW-Eos-8700GKW', '8700GKW', DOCS_COMPLETOS)],
      cb: [{ banda: 'ABRIL', matricula: '8700GKW', fila: 15 }],
    })
    const abril = res.meses.find((m) => m.mes === 'ABRIL')!
    expect(abril.facturas.count).toBe(2)
    expect(abril.descuadres.facturasSinCarpeta).toEqual([])
    expect(abril.descuadres.bandaIncorrecta).toEqual([])
    expect(abril.ok).toBe(true)
  })

  it('marca doc faltante según tipo de operación del expediente', () => {
    const res = chequearExpedientes({
      year: 2026,
      quarter: 2,
      tipos: new Map<string, TipoOperacion>([['7487MGV', 'deposito']]),
      facturas: [{ numero: 'F-2026-025', matricula: '7487MGV', fecha: '2026-04-20' }],
      carpetas: [
        carpeta('abril', 'D-28-Fiat-500-7487MGV', '7487MGV', [
          'factura-iva-F-2026-4221.pdf',
          'Contrato comprador.jpeg',
          // sin Contrato-Deposito
        ]),
      ],
      cb: [{ banda: 'ABRIL', matricula: '7487MGV', fila: 9 }],
    })
    expect(res.expedientesDocs).toHaveLength(1)
    expect(res.expedientesDocs[0].tipoOperacion).toBe('deposito')
    expect(res.expedientesDocs[0].faltantes).toEqual(['contrato-deposito'])
    expect(res.resumen.ok).toBe(false)
    expect(res.resumen.bloqueantes.join(' ')).toContain('contrato-deposito')
  })

  it('carpeta sin expediente → tipo desconocido con exigencia mínima', () => {
    const res = chequearExpedientes({
      year: 2026,
      quarter: 2,
      tipos: new Map(),
      facturas: [{ numero: 'F-2026-026', matricula: 'E9961BDJ', fecha: '2026-06-15' }],
      carpetas: [
        carpeta('junio', 'Yamaha Raptor quad-E9961BDJ', 'E9961BDJ', [
          'Factura-Venta-F-2026-026.pdf',
          'CONTRATO COMPRA VENTA.jpeg',
        ]),
      ],
      cb: [{ banda: 'JUNIO', matricula: 'E9961BDJ', fila: 40 }],
    })
    expect(res.expedientesDocs[0].tipoOperacion).toBe('desconocido')
    expect(res.expedientesDocs[0].faltantes).toEqual([])
    expect(res.resumen.ok).toBe(true)
  })

  it('sin snapshot: carpetas verificable:false, sin descuadres de carpetas y con nota', () => {
    const res = chequearExpedientes({
      ...base,
      facturas: [{ numero: 'F-2026-020', matricula: '8061KRN', fecha: '2026-04-05' }],
      carpetas: null,
      cb: [{ banda: 'ABRIL', matricula: '8061KRN', fila: 12 }],
    })
    const abril = res.meses.find((m) => m.mes === 'ABRIL')!
    expect(abril.carpetas.verificable).toBe(false)
    expect(abril.descuadres.facturasSinCarpeta).toEqual([])
    expect(res.resumen.notas.join(' ')).toContain('sin snapshot')
    expect(res.resumen.ok).toBe(true) // no bloquea, sólo avisa
    expect(res.expedientesDocs).toEqual([])
  })

  it('hoja CB no legible: cbBanda verificable:false y nota', () => {
    const res = chequearExpedientes({
      ...base,
      facturas: [{ numero: 'F-2026-020', matricula: '8061KRN', fecha: '2026-04-05' }],
      carpetas: [carpeta('abril', '74-Opel-Astra-8061KRN', '8061KRN', DOCS_COMPLETOS)],
      cb: null,
    })
    const abril = res.meses.find((m) => m.mes === 'ABRIL')!
    expect(abril.cbBanda.verificable).toBe(false)
    expect(abril.descuadres.bandaIncorrecta).toEqual([])
    expect(res.resumen.notas.join(' ')).toContain('CB no legible')
  })
})
