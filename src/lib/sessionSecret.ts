/**
 * Secreto HMAC de las sesiones. Sin imports de Node: lo usan auth-server
 * (Node) y auth-edge (middleware, Edge runtime). Lazy a propósito: no se
 * evalúa al cargar el módulo para no romper `next build`.
 */
const DEV_SESSION_SECRET = 'dev-only-INSECURE-set-SESSION_SECRET-in-prod'

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET no configurado')
  }
  return DEV_SESSION_SECRET
}
