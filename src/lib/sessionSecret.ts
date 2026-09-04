/**
 * Secreto HMAC de las sesiones. Sin imports de Node: lo usan auth-server
 * (Node) y auth-edge (middleware, Edge runtime). Lazy a propósito: no se
 * evalúa al cargar el módulo para no romper `next build`.
 *
 * Orden: SESSION_SECRET → en producción, secreto derivado de otro secreto ya
 * presente en el entorno (aviso en logs; el login no se cae) → en desarrollo,
 * valor fijo. Si en producción no hay ningún secreto disponible, lanza.
 */
const DEV_SESSION_SECRET = 'dev-only-INSECURE-set-SESSION_SECRET-in-prod'

export type SessionSecretSource = 'env' | 'derivado' | 'dev'

let avisado = false

function secretoDerivado(): string | null {
  const base =
    process.env.CRON_SECRET ||
    process.env.N8N_INVOICE_WEBHOOK_SECRET ||
    process.env.DATABASE_URL
  return base ? `derivado:${base}` : null
}

export function getSessionSecretSource(): SessionSecretSource {
  if (process.env.SESSION_SECRET) return 'env'
  if (process.env.NODE_ENV === 'production') return 'derivado'
  return 'dev'
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    const derivado = secretoDerivado()
    if (!derivado) throw new Error('SESSION_SECRET no configurado')
    if (!avisado) {
      avisado = true
      console.error(
        '[auth] SESSION_SECRET no configurado: usando un secreto derivado. Configúralo en Vercel (Production) y redespliega.'
      )
    }
    return derivado
  }
  return DEV_SESSION_SECRET
}
