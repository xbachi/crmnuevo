/**
 * Validación estricta de query params para endpoints admin.
 *
 * Puro (sin pg ni googleapis): un booleano mal escrito (?dryRun=1) debe fallar
 * ruidoso con 400, no colarse como `false` y disparar una escritura real.
 */

export class AdminParamError extends Error {}

/**
 * Lee un booleano estricto: sólo 'true'/'false' son válidos.
 *  - ausente (null) → defaultVal
 *  - 'true' → true · 'false' → false
 *  - cualquier otra cosa → AdminParamError
 */
export function parseStrictBool(
  sp: URLSearchParams,
  key: string,
  defaultVal: boolean
): boolean {
  const v = sp.get(key)
  if (v === null) return defaultVal
  if (v === 'true') return true
  if (v === 'false') return false
  throw new AdminParamError(`${key} debe ser 'true' o 'false' (recibido '${v}')`)
}

/** Rechaza cualquier query param fuera de la whitelist (evita typos silenciosos). */
export function assertKnownParams(sp: URLSearchParams, allowed: string[]): void {
  for (const key of sp.keys()) {
    if (!allowed.includes(key)) {
      throw new AdminParamError(
        `parámetro desconocido '${key}'. Permitidos: ${allowed.join(', ')}`
      )
    }
  }
}
