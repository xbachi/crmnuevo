/**
 * CSV "Excel español" para las exportaciones de gestoría (manifiesto y libro):
 * separador `;`, decimales con coma, BOM UTF-8 para que Excel detecte la
 * codificación, líneas CRLF. Puro, sin dependencias — testeable en unit.
 */

export const CSV_BOM = '\uFEFF'
export const CSV_SEP = ';'

/** Escapa una celda: comillas si contiene ; " o saltos de línea. */
export function csvCell(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Número con 2 decimales y coma decimal (1234.5 → "1234,50"). '' si null. */
export function csvNum(value: number | string | null | undefined): string {
  if (value == null || value === '') return ''
  const n = Number(value)
  if (Number.isNaN(n)) return ''
  return n.toFixed(2).replace('.', ',')
}

export interface CsvSection {
  titulo: string
  headers: string[]
  rows: (string | number | null | undefined)[][]
}

/** Documento completo: BOM + secciones tituladas separadas por línea en blanco. */
export function buildCsvDocument(sections: CsvSection[]): string {
  const parts = sections.map((s) => {
    const lines = [
      csvCell(s.titulo),
      s.headers.map(csvCell).join(CSV_SEP),
      ...s.rows.map((r) => r.map(csvCell).join(CSV_SEP)),
    ]
    return lines.join('\r\n')
  })
  return CSV_BOM + parts.join('\r\n\r\n') + '\r\n'
}

/** Respuesta HTTP de descarga CSV (attachment). */
export function csvResponse(content: string, filename: string): Response {
  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
