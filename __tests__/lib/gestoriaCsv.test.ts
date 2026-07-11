/**
 * CSV Excel español para manifiesto/libro: BOM UTF-8, separador `;`,
 * decimales con coma, escaping de celdas.
 */

import { buildCsvDocument, csvCell, csvNum, CSV_BOM } from '@/lib/gestoriaCsv'

describe('csvCell', () => {
  it('escapa celdas con ; comillas o saltos de línea', () => {
    expect(csvCell('taller a;b')).toBe('"taller a;b"')
    expect(csvCell('dice "ok"')).toBe('"dice ""ok"""')
    expect(csvCell('dos\nlíneas')).toBe('"dos\nlíneas"')
    expect(csvCell('normal')).toBe('normal')
    expect(csvCell(null)).toBe('')
  })
})

describe('csvNum', () => {
  it('formatea con 2 decimales y coma (Excel español)', () => {
    expect(csvNum(1234.5)).toBe('1234,50')
    expect(csvNum('277.88')).toBe('277,88')
    expect(csvNum(0)).toBe('0,00')
    expect(csvNum(null)).toBe('')
    expect(csvNum('no-numero')).toBe('')
  })
})

describe('buildCsvDocument', () => {
  const doc = buildCsvDocument([
    {
      titulo: 'SECCION A',
      headers: ['numero', 'importe'],
      rows: [['F-2026-0001', csvNum(1210)]],
    },
    {
      titulo: 'SECCION B',
      headers: ['proveedor'],
      rows: [['taller a;b']],
    },
  ])

  it('arranca con BOM UTF-8', () => {
    expect(doc.startsWith(CSV_BOM)).toBe(true)
    expect(doc.charCodeAt(0)).toBe(0xfeff)
  })

  it('usa ; como separador y CRLF, con las dos secciones', () => {
    expect(doc).toContain('numero;importe')
    expect(doc).toContain('F-2026-0001;1210,00')
    expect(doc).toContain('SECCION B')
    expect(doc).toContain('"taller a;b"')
    expect(doc).toContain('\r\n')
  })
})
