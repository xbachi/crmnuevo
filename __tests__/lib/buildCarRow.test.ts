/**
 * Blindaje de la fila de coche de CB 2026 (columnas A..S):
 *  - C1: el porte NO se cuenta dos veces → columna H (idx 7) SIEMPRE en blanco
 *    (el porte vive dentro de G/compra vía computeCompra).
 *  - C2: ITV/garantía (gastosOtros) llega a la columna M (idx 12).
 *
 * Mockeamos pg/googleapis para importar buildCarRow sin abrir conexiones.
 */

jest.mock('@/lib/direct-database', () => ({ pool: { query: jest.fn() } }))
jest.mock('@/lib/googleSheets', () => ({ getGoogleSheetsAuth: jest.fn() }))
jest.mock('googleapis', () => ({ google: { sheets: jest.fn() } }))

import { buildCarRow } from '@/lib/costoBeneficio'
import { CN_INFORME } from '@/lib/costoBeneficioSheet'

const V = {
  referencia: '#1020',
  marca: 'Jeep',
  modelo: 'Compass',
  matricula: '2037KPL',
  precioCompra: 11032,
  gastosTransporte: 403,
  gastosMecanica: 250,
  gastosPintura: null,
  gastosLimpieza: 90.75,
  gastosOtros: 180, // ITV
}
const OPTS = { dealId: 1, numeroFactura: 'F-1', invoiceType: 'REBU', invoiceDate: '2026-05-15', salePrice: 15000 }

describe('buildCarRow — columnas de costo de CB (C1 + C2)', () => {
  // compra = precioCompra + porte = 11032 + 403 = 11435 (ya incluye el porte)
  const row = buildCarRow(V as never, OPTS as never, 17, 'rebu', 11435)

  it('G (idx 6) = compra (incluye porte)', () => {
    expect(row[6]).toBe(11435)
  })

  it('C1: H (idx 7) queda en BLANCO — el porte no se cuenta dos veces', () => {
    expect(row[7]).toBe('')
  })

  it('I (idx 8) = CN_INFORME fijo', () => {
    expect(row[8]).toBe(CN_INFORME)
  })

  it('J/K/L = taller/chapa/limpieza', () => {
    expect(row[9]).toBe(250)
    expect(row[10]).toBe('') // pintura null → blanco
    expect(row[11]).toBe(90.75)
  })

  it('C2: M (idx 12) = gastosOtros (ITV/garantía) llega a CB', () => {
    expect(row[12]).toBe(180)
  })

  it('N (idx 13) = fórmula COSTE SUM(G:M)', () => {
    expect(row[13]).toBe('=SUM(G17:M17)')
  })

  it('S (idx 18) = Nº de factura (dedup por factura en CB)', () => {
    expect(row[18]).toBe('F-1')
  })

  it('M queda en blanco si no hay gastosOtros', () => {
    const row2 = buildCarRow({ ...V, gastosOtros: null } as never, OPTS as never, 5, 'rebu', 11435)
    expect(row2[12]).toBe('')
  })
})
