/**
 * Rangos esperados por campo de costo — guardas contra extracciones basura.
 *
 * Motivación (incidente 2026-07-09): un scan automático cargó compras absurdas
 * (47.104 y 156.372) porque no había ninguna validación. Estas guardas rechazan
 * lo imposible antes de escribir, y marcan lo dudoso para revisión.
 */

// [min, max] razonables por campo del Vehiculo. `max` es un tope DURO (por encima
// se rechaza: casi seguro error de extracción). `warnBelow`/`warnAbove` = banda
// de aviso (se acepta pero se marca para mirar).
export interface Rango {
  min: number
  max: number
  warnBelow?: number
  warnAbove?: number
}
export const RANGO_GASTO: Record<string, Rango> = {
  precioCompra: { min: 0, max: 90000, warnBelow: 300, warnAbove: 45000 },
  gastosTransporte: { min: 0, max: 3000, warnAbove: 1500 },
  gastosMecanica: { min: 0, max: 8000, warnAbove: 4000 },
  gastosPintura: { min: 0, max: 8000, warnAbove: 4000 },
  gastosLimpieza: { min: 0, max: 800, warnAbove: 400 },
  gastosOtros: { min: 0, max: 2000, warnAbove: 1000 },
}

export interface RangoResult {
  ok: boolean // false = rechazar (fuera del rango duro)
  reason?: string // motivo del rechazo
  warn?: string // aviso (se acepta pero revisar)
}

/** Valida un importe contra el rango del campo. */
export function validarImporte(campo: string, importe: number): RangoResult {
  const r = RANGO_GASTO[campo]
  if (!r) return { ok: true } // campo sin rango definido → no valida
  if (!Number.isFinite(importe) || importe < r.min) {
    return { ok: false, reason: `importe ${importe} < mínimo ${r.min} para ${campo}` }
  }
  if (importe > r.max) {
    return { ok: false, reason: `importe ${importe} > máximo ${r.max} para ${campo} (posible error de extracción)` }
  }
  if (r.warnAbove != null && importe > r.warnAbove) {
    return { ok: true, warn: `${campo}=${importe} inusualmente alto (>${r.warnAbove}), revisar` }
  }
  if (r.warnBelow != null && importe < r.warnBelow) {
    return { ok: true, warn: `${campo}=${importe} inusualmente bajo (<${r.warnBelow}), revisar` }
  }
  return { ok: true }
}
