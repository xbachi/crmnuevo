/**
 * @jest-environment node
 *
 * PDF de la factura rectificativa (y de la original anulada). jsPDF escribe el
 * texto sin comprimir en el content stream, así que se puede afirmar sobre el
 * contenido leyendo el buffer como latin1.
 */

import { generarFactura } from '@/lib/contractGenerator'
import { formatEUR } from '@/lib/pdf/theme'

const baseDeal = {
  id: 501,
  numero: 'INV-FR-2026-001',
  cliente: {
    nombre: 'Ana',
    apellidos: 'García',
    dni: '99887766Z',
    email: 'ana@example.com',
  },
  vehiculo: {
    marca: 'Seat',
    modelo: 'Ibiza',
    matricula: '4321 XYZ',
    bastidor: 'VSS123456789',
    precioPublicacion: -3373,
    año: 2019,
  },
  importeSena: 0,
} as unknown as Parameters<typeof generarFactura>[0]

const rectificativaDeal = { ...baseDeal, importeTotal: -3373 } as typeof baseDeal

function text(buf: Uint8Array): string {
  return Buffer.from(buf).toString('latin1')
}

/** Importe tal como queda impreso, sin el símbolo € (que en el stream del PDF
 *  va en WinAnsi, no en latin1). Ojo: es-ES no agrupa los miles en números de
 *  4 dígitos ("-3373,00"), por eso se compara contra formatEUR y no a mano. */
function eur(n: number): string {
  return formatEUR(n).replace(/[\s\u00a0]*€$/, '')
}

describe('generarFactura — RECTIFICATIVA', () => {
  const options = {
    rectificativa: {
      numeroOriginal: 'R-2026-023',
      fechaOriginal: '15/03/2026',
      motivo: 'Factura duplicada del mismo vehículo (error de emisión)',
    },
  }

  it('titula FACTURA RECTIFICATIVA y lleva el sello diagonal', async () => {
    const pdf = await generarFactura(
      rectificativaDeal,
      'IVA',
      'FR-2026-001',
      options
    )
    const s = text(pdf)
    expect(s).toContain('FACTURA RECTIFICATIVA')
    expect(s).toContain('FR-2026-001')
    // Sello: texto + ExtGState (semitransparencia)
    expect(s).toContain('RECTIFICATIVA')
    expect(s).toContain('/ExtGState')
  })

  it('imprime la referencia legal con NÚMERO Y FECHA de la original, el motivo y la norma', async () => {
    const pdf = await generarFactura(
      rectificativaDeal,
      'IVA',
      'FR-2026-001',
      options
    )
    const s = text(pdf)
    expect(s).toContain('Rectifica a la factura R-2026-023 de fecha 15/03/2026')
    expect(s).toContain('Motivo: Factura duplicada del mismo')
    expect(s).toContain('art. 15 del RD 1619/2012')
  })

  it('los importes salen en negativo (base, IVA y total)', async () => {
    const pdf = await generarFactura(
      rectificativaDeal,
      'IVA',
      'FR-2026-001',
      options
    )
    const s = text(pdf)
    expect(s).toContain(eur(-3373)) // total
    expect(s).toContain(eur(-2787.6)) // base imponible (3373 / 1,21)
    expect(s).toContain(eur(-585.4)) // cuota de IVA
    expect(s).not.toContain('-0,00')
  })

  it('rectificativa de una REBU: sin desglose de IVA', async () => {
    const pdf = await generarFactura(
      { ...rectificativaDeal, importeTotal: -6000 } as typeof baseDeal,
      'REBU',
      'FR-2026-002',
      options
    )
    const s = text(pdf)
    expect(s).toContain('FACTURA RECTIFICATIVA')
    expect(s).toContain(eur(-6000))
    expect(s).not.toContain('IVA (21%)')
    expect(s).not.toContain('Subtotal')
  })

  it('no promete garantía comercial', async () => {
    const pdf = await generarFactura(
      rectificativaDeal,
      'IVA',
      'FR-2026-001',
      options
    )
    expect(text(pdf)).not.toContain('12 meses')
  })
})

describe('generarFactura — original RECTIFIED', () => {
  it('lleva el sello ANULADA y la referencia a la rectificativa', async () => {
    const pdf = await generarFactura(
      { ...baseDeal, importeTotal: 3373 } as typeof baseDeal,
      'IVA',
      'R-2026-023',
      {
        anuladaPor: {
          numeroRectificativa: 'FR-2026-001',
          fechaRectificativa: '11/07/2026',
        },
      }
    )
    const s = text(pdf)
    expect(s).toContain('ANULADA')
    expect(s).toContain('Rectificada por FR-2026-001 de fecha 11/07/2026')
    expect(s).toContain('/ExtGState')
    // Sigue siendo la factura original: importes en positivo, título normal.
    expect(s).toContain(eur(3373))
    expect(s).not.toContain('FACTURA RECTIFICATIVA')
  })
})

describe('generarFactura — factura normal (sin regresión)', () => {
  it('no lleva sellos ni referencias de rectificación', async () => {
    const pdf = await generarFactura(
      { ...baseDeal, importeTotal: 12100 } as typeof baseDeal,
      'IVA',
      'F-2026-010'
    )
    const s = text(pdf)
    expect(s).toContain('FACTURA')
    expect(s).not.toContain('RECTIFICATIVA')
    expect(s).not.toContain('ANULADA')
    expect(s).toContain('12 meses')
  })
})
