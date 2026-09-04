import { esFechaYMD } from '@/lib/fechas'

export type EstadoVencimiento =
  | { estado: 'vencida'; dias: number }
  | { estado: 'proxima'; dias: number }
  | { estado: 'ok'; dias: number }

/** Días de antelación con los que una fecha pasa a "próxima a vencer". */
export const DIAS_AVISO_VENCIMIENTO = 30

const MS_DIA = 86_400_000

function aUTCMedianoche(v: string | Date): number | null {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())
  }
  if (!esFechaYMD(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/**
 * Estado de un vencimiento respecto a `hoy` (por defecto, la fecha actual).
 * `dias` es la diferencia en días naturales (negativo si ya venció).
 * Fecha null/inválida → null (sin estado, no se pinta nada).
 */
export function estadoVencimiento(
  fecha: string | Date | null | undefined,
  hoy: string | Date = new Date()
): EstadoVencimiento | null {
  if (fecha == null || fecha === '') return null
  const f = aUTCMedianoche(fecha)
  const h = aUTCMedianoche(hoy)
  if (f === null || h === null) return null
  const dias = Math.round((f - h) / MS_DIA)
  if (dias < 0) return { estado: 'vencida', dias }
  if (dias <= DIAS_AVISO_VENCIMIENTO) return { estado: 'proxima', dias }
  return { estado: 'ok', dias }
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa'. Devuelve '' si la fecha no es válida. */
export function formatFechaCorta(fecha: string | null | undefined): string {
  if (!esFechaYMD(fecha)) return ''
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}

/** Texto del badge: 'Vencida' / 'Vence hoy' / 'Vence en N días'; null si no aplica. */
export function textoVencimiento(e: EstadoVencimiento | null): string | null {
  if (!e) return null
  if (e.estado === 'vencida') return 'Vencida'
  if (e.estado === 'proxima') {
    if (e.dias === 0) return 'Vence hoy'
    return `Vence en ${e.dias} día${e.dias === 1 ? '' : 's'}`
  }
  return null
}
