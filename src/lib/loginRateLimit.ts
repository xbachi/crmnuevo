/**
 * Limitador de intentos de login en memoria (Map a nivel de módulo).
 * Limitación conocida: el estado es por instancia serverless, no compartido.
 */
export const MAX_FALLOS = 5
export const VENTANA_MS = 15 * 60 * 1000

interface Entrada {
  intentos: number
  ventanaHasta: number
  bloqueadoHasta: number | null
}

const entradas = new Map<string, Entrada>()

export function claveLogin(ip: string, usuario: string): string {
  return `${ip}:${usuario.trim().toLowerCase()}`
}

/** Devuelve la entrada vigente; borra perezosamente las vencidas. */
function vigente(clave: string, now: number): Entrada | undefined {
  const e = entradas.get(clave)
  if (!e) return undefined
  const vencida =
    e.bloqueadoHasta !== null ? e.bloqueadoHasta <= now : e.ventanaHasta <= now
  if (vencida) {
    entradas.delete(clave)
    return undefined
  }
  return e
}

export function estaBloqueado(
  clave: string,
  now: number = Date.now()
): boolean {
  const e = vigente(clave, now)
  return !!e && e.bloqueadoHasta !== null && e.bloqueadoHasta > now
}

export function registrarFallo(
  clave: string,
  now: number = Date.now()
): { intentos: number; bloqueado: boolean } {
  const e = vigente(clave, now) ?? {
    intentos: 0,
    ventanaHasta: now + VENTANA_MS,
    bloqueadoHasta: null,
  }
  e.intentos += 1
  if (e.intentos >= MAX_FALLOS) e.bloqueadoHasta = now + VENTANA_MS
  entradas.set(clave, e)
  return { intentos: e.intentos, bloqueado: e.bloqueadoHasta !== null }
}

export function limpiar(clave: string): void {
  entradas.delete(clave)
}
