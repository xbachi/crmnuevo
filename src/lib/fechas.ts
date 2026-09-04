/**
 * Helpers puros de fecha-sin-hora ('YYYY-MM-DD').
 *
 * pg devuelve las columnas DATE como `Date` construido a medianoche LOCAL
 * (`new Date(y, m, d)`). `toISOString()` pasa a UTC y en cualquier zona al
 * este de Greenwich devuelve el día anterior. Por eso acá se leen los
 * componentes locales, nunca el ISO.
 */

const RE_YMD = /^(\d{4})-(\d{2})-(\d{2})$/

/** true si `s` es 'YYYY-MM-DD' y además una fecha real del calendario. */
export function esFechaYMD(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = RE_YMD.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  )
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * DATE de pg (Date local) o string ISO/'YYYY-MM-DD...' → 'YYYY-MM-DD'.
 * null/undefined/vacío/inválido → null.
 */
export function dateToYMD(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`
  }
  const s = String(v).trim().slice(0, 10)
  return esFechaYMD(s) ? s : null
}

/**
 * Valor de entrada (form/API) → 'YYYY-MM-DD' o null. Cualquier cosa que no
 * sea una fecha válida se guarda como NULL (nunca revienta el UPDATE).
 */
export function normalizarFechaYMD(v: unknown): string | null {
  return dateToYMD(v)
}
