/**
 * Estado de las páginas de lista (búsqueda, filtros, orden, página…) en la
 * query string. Funciones puras: la URL solo lleva las claves cuyo valor
 * difiere del valor por defecto, así queda limpia y se puede compartir.
 */
export type ValorUrl = string | number | boolean
export type UrlStateDefaults = Record<string, ValorUrl>

function coercer(raw: string, porDefecto: ValorUrl): ValorUrl {
  if (typeof porDefecto === 'number') {
    const n = raw.trim() === '' ? NaN : Number(raw)
    return Number.isFinite(n) ? n : porDefecto
  }
  if (typeof porDefecto === 'boolean') {
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
    return porDefecto
  }
  return raw
}

function serializar(valor: ValorUrl): string {
  if (typeof valor === 'boolean') return valor ? '1' : '0'
  return String(valor)
}

/** Lee las claves de `defaults` desde `params`, coaccionando al tipo del default. */
export function leerEstadoDeParams<T extends UrlStateDefaults>(
  params: URLSearchParams,
  defaults: T
): T {
  const estado: Record<string, ValorUrl> = { ...defaults }
  for (const clave of Object.keys(defaults)) {
    const raw = params.get(clave)
    if (raw !== null) estado[clave] = coercer(raw, defaults[clave])
  }
  return estado as T
}

/**
 * Devuelve una copia de `params` con las claves de `estado` escritas; las que
 * valen lo mismo que su default se eliminan. Las claves ajenas se conservan.
 */
export function escribirEstadoEnParams<T extends UrlStateDefaults>(
  params: URLSearchParams,
  estado: Partial<T>,
  defaults: T
): URLSearchParams {
  const siguiente = new URLSearchParams(params)
  for (const clave of Object.keys(estado)) {
    const valor = estado[clave]
    if (valor === undefined || valor === defaults[clave]) {
      siguiente.delete(clave)
    } else {
      siguiente.set(clave, serializar(valor))
    }
  }
  return siguiente
}

export function estadosIguales(
  a: Record<string, ValorUrl>,
  b: Record<string, ValorUrl>
): boolean {
  const clavesA = Object.keys(a)
  if (clavesA.length !== Object.keys(b).length) return false
  return clavesA.every((clave) => a[clave] === b[clave])
}
