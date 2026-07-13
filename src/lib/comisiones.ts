/**
 * Motor de comisiones de la vendedora.
 *
 * Estructura: comisión base según forma de pago × garantía premium, más un
 * porcentaje del monto financiado en ventas financiadas o mixtas. La tabla
 * exacta llega después → todo es configurable (comision_config, fila id=1)
 * y arranca en 0: mientras toda la config sea 0, pendienteConfig=true y la
 * UI avisa que las comisiones se muestran en 0.
 */

export type FormaPago = 'contado' | 'financiado' | 'mixto'

export const FORMAS_PAGO: readonly FormaPago[] = [
  'contado',
  'financiado',
  'mixto',
] as const

export interface ComisionBase {
  conGarantiaPremium: number
  sinGarantiaPremium: number
}

export interface ComisionConfig {
  base: Record<FormaPago, ComisionBase>
  /** % del monto financiado que se suma en financiado/mixto (ej: 1.5 = 1,5%). */
  pctMontoFinanciado: number
}

export interface CondicionesComision {
  formaPago: FormaPago
  garantiaPremium: boolean
  montoFinanciado?: number | null
}

export interface ComisionCalculada {
  base: number
  extraFinanciacion: number
  total: number
  /** true si TODA la config está en 0 (tabla de comisiones sin configurar). */
  pendienteConfig: boolean
}

export function configVacia(): ComisionConfig {
  return {
    base: {
      contado: { conGarantiaPremium: 0, sinGarantiaPremium: 0 },
      financiado: { conGarantiaPremium: 0, sinGarantiaPremium: 0 },
      mixto: { conGarantiaPremium: 0, sinGarantiaPremium: 0 },
    },
    pctMontoFinanciado: 0,
  }
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : NaN
}

/**
 * Normaliza un JSONB crudo a ComisionConfig. Devuelve null si la forma no es
 * válida (algún valor faltante, negativo o no numérico).
 */
export function normalizarConfig(raw: unknown): ComisionConfig | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  const baseRaw = obj.base
  if (typeof baseRaw !== 'object' || baseRaw === null) return null

  const out = configVacia()
  for (const forma of FORMAS_PAGO) {
    const fila = (baseRaw as Record<string, unknown>)[forma]
    if (typeof fila !== 'object' || fila === null) return null
    const con = num((fila as Record<string, unknown>).conGarantiaPremium)
    const sin = num((fila as Record<string, unknown>).sinGarantiaPremium)
    if (Number.isNaN(con) || Number.isNaN(sin)) return null
    out.base[forma] = { conGarantiaPremium: con, sinGarantiaPremium: sin }
  }
  const pct = num(obj.pctMontoFinanciado)
  if (Number.isNaN(pct)) return null
  out.pctMontoFinanciado = pct
  return out
}

export function esConfigPendiente(config: ComisionConfig): boolean {
  return (
    config.pctMontoFinanciado === 0 &&
    FORMAS_PAGO.every(
      (f) =>
        config.base[f].conGarantiaPremium === 0 &&
        config.base[f].sinGarantiaPremium === 0
    )
  )
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function calcularComision(
  condiciones: CondicionesComision,
  config: ComisionConfig
): ComisionCalculada {
  const fila = config.base[condiciones.formaPago]
  const base = condiciones.garantiaPremium
    ? fila.conGarantiaPremium
    : fila.sinGarantiaPremium

  const monto = condiciones.montoFinanciado ?? 0
  const extraFinanciacion =
    condiciones.formaPago !== 'contado' && monto > 0
      ? round2((monto * config.pctMontoFinanciado) / 100)
      : 0

  return {
    base: round2(base),
    extraFinanciacion,
    total: round2(base + extraFinanciacion),
    pendienteConfig: esConfigPendiente(config),
  }
}
