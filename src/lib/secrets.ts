import crypto from 'crypto'

/**
 * Comparación de secretos en tiempo constante. `false` si alguno es falsy o
 * si difieren en longitud (timingSafeEqual exige buffers del mismo tamaño).
 */
export function safeEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}
