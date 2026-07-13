/**
 * Motor de comisiones de la vendedora.
 *
 * La comisión de cada venta NO ramifica por la etiqueta formaPago: manda el
 * RATIO financiado (montoFinanciado / precioVenta) cruzado con la garantía.
 * Un "mixto" con ratio ≥ umbral cobra el porcentaje, igual que un financiado.
 *
 *   ratio = 0              → contado:        25 € standard / 40 € premium
 *   0 < ratio < umbral     → financiadoBajo: 20 € standard / 50 € premium
 *   ratio ≥ umbral (0,70)  → financiadoAlto: 0,4% / 1% del importe financiado
 *
 * Más un bono mensual por cantidad de ventas, NO acumulativo: se paga solo el
 * escalón alcanzado (9 ventas → escalón de 8 → 200 €).
 *
 * OJO con los porcentajes: en la config van como número humano (0,4 = 0,4%),
 * no como fracción. El ÚNICO lugar que divide por 100 es calcularComision.
 */

export type FormaPago = 'contado' | 'financiado' | 'mixto'

export const FORMAS_PAGO: readonly FormaPago[] = [
  'contado',
  'financiado',
  'mixto',
] as const

/** Tramo aplicado — se expone en la API/UI para poder auditar cada fila. */
export type TramoComision = 'contado' | 'financiadoBajo' | 'financiadoAlto'

export interface TarifaFija {
  standard: number
  premium: number
}

export interface TarifaPorcentaje {
  /** % humano: 0,4 = 0,4% del importe financiado. */
  pctStandard: number
  /** % humano: 1 = 1% del importe financiado. */
  pctPremium: number
}

export interface EscalonBono {
  minVentas: number
  importe: number
}

export interface ComisionConfig {
  /** Ratio financiado a partir del cual se paga porcentaje (0,70 = 70%). */
  umbralFinanciado: number
  contado: TarifaFija
  financiadoBajo: TarifaFija
  financiadoAlto: TarifaPorcentaje
  /** Escalones del bono mensual, ordenados por minVentas ascendente. */
  bonos: EscalonBono[]
}

export interface CondicionesComision {
  formaPago: FormaPago
  garantiaPremium: boolean
  montoFinanciado?: number | null
  /** Precio de venta de la operación; sin él no hay ratio → no calculable. */
  precioVenta?: number | null
}

export interface ComisionCalculada {
  tramo: TramoComision
  /** montoFinanciado / precioVenta (0 en contado). */
  ratioFinanciado: number
  /** % humano aplicado en el tramo alto; null en los tramos de tarifa fija. */
  pctAplicado: number | null
  total: number
  /** Texto corto y auditable del porqué (columna/tooltip en la UI). */
  motivo: string
}

/** Tabla real vigente. También es el seed de create-comision-config.sql. */
export const CONFIG_POR_DEFECTO: ComisionConfig = {
  umbralFinanciado: 0.7,
  contado: { standard: 25, premium: 40 },
  financiadoBajo: { standard: 20, premium: 50 },
  financiadoAlto: { pctStandard: 0.4, pctPremium: 1.0 },
  bonos: [
    { minVentas: 4, importe: 50 },
    { minVentas: 6, importe: 100 },
    { minVentas: 8, importe: 200 },
    { minVentas: 10, importe: 250 },
    { minVentas: 12, importe: 300 },
    { minVentas: 14, importe: 400 },
    { minVentas: 16, importe: 500 },
  ],
}

export function configPorDefecto(): ComisionConfig {
  return JSON.parse(JSON.stringify(CONFIG_POR_DEFECTO)) as ComisionConfig
}

const numPositivo = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : NaN
}

function normalizarTarifaFija(raw: unknown): TarifaFija | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const standard = numPositivo(o.standard)
  const premium = numPositivo(o.premium)
  if (Number.isNaN(standard) || Number.isNaN(premium)) return null
  return { standard, premium }
}

/**
 * Normaliza un JSONB crudo a ComisionConfig; null si la forma no es válida.
 * Los porcentajes se toman TAL CUAL (número humano): pctPremium: 1 es 1%,
 * nunca 100%. umbralFinanciado sí es una fracción (0,70), por eso se exige ≤ 1.
 */
export function normalizarConfig(raw: unknown): ComisionConfig | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>

  const umbral = numPositivo(o.umbralFinanciado)
  if (Number.isNaN(umbral) || umbral > 1) return null

  const contado = normalizarTarifaFija(o.contado)
  const financiadoBajo = normalizarTarifaFija(o.financiadoBajo)
  if (!contado || !financiadoBajo) return null

  const altoRaw = o.financiadoAlto
  if (typeof altoRaw !== 'object' || altoRaw === null) return null
  const pctStandard = numPositivo(
    (altoRaw as Record<string, unknown>).pctStandard
  )
  const pctPremium = numPositivo((altoRaw as Record<string, unknown>).pctPremium)
  if (Number.isNaN(pctStandard) || Number.isNaN(pctPremium)) return null

  if (!Array.isArray(o.bonos)) return null
  const bonos: EscalonBono[] = []
  for (const b of o.bonos) {
    if (typeof b !== 'object' || b === null) return null
    const minVentas = numPositivo((b as Record<string, unknown>).minVentas)
    const importe = numPositivo((b as Record<string, unknown>).importe)
    if (
      Number.isNaN(minVentas) ||
      !Number.isInteger(minVentas) ||
      minVentas < 1 ||
      Number.isNaN(importe)
    ) {
      return null
    }
    bonos.push({ minVentas, importe })
  }
  bonos.sort((a, b) => a.minVentas - b.minVentas)

  return {
    umbralFinanciado: umbral,
    contado,
    financiadoBajo,
    financiadoAlto: { pctStandard, pctPremium },
    bonos,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const pctEs = (n: number) => n.toLocaleString('es-ES')

export function calcularComision(
  condiciones: CondicionesComision,
  config: ComisionConfig
): ComisionCalculada {
  const garantia = condiciones.garantiaPremium ? 'premium' : 'standard'
  const precio = condiciones.precioVenta ?? 0
  const financiado = condiciones.montoFinanciado ?? 0

  // Sin precio de venta no hay ratio computable; sin financiación, ratio 0.
  const ratio = precio > 0 && financiado > 0 ? financiado / precio : 0

  if (ratio === 0) {
    return {
      tramo: 'contado',
      ratioFinanciado: 0,
      pctAplicado: null,
      total: round2(config.contado[garantia]),
      motivo: `Contado (sin financiación) · tarifa fija ${garantia}`,
    }
  }

  const umbralPct = pctEs(round2(config.umbralFinanciado * 100))
  const ratioPct = pctEs(round2(ratio * 100))

  // Umbral INCLUSIVE: exactamente 70% ya es tramo alto.
  if (ratio >= config.umbralFinanciado) {
    const pct = condiciones.garantiaPremium
      ? config.financiadoAlto.pctPremium
      : config.financiadoAlto.pctStandard
    return {
      tramo: 'financiadoAlto',
      ratioFinanciado: ratio,
      pctAplicado: pct,
      total: round2((financiado * pct) / 100), // pct humano → /100
      motivo:
        `Financiado ${ratioPct}% (≥ ${umbralPct}%) · ${pctEs(pct)}% del ` +
        `importe financiado (${garantia})`,
    }
  }

  return {
    tramo: 'financiadoBajo',
    ratioFinanciado: ratio,
    pctAplicado: null,
    total: round2(config.financiadoBajo[garantia]),
    motivo: `Financiado ${ratioPct}% (< ${umbralPct}%) · tarifa fija ${garantia}`,
  }
}

export interface BonoMensual {
  /** minVentas del escalón alcanzado; null si no llegó al primero. */
  escalon: number | null
  importe: number
  siguienteEscalon: EscalonBono | null
  /** Ventas que faltan para el siguiente escalón; null si ya es el último. */
  faltanParaSiguiente: number | null
}

/**
 * Bono NO acumulativo: paga SOLO el escalón alcanzado (el mayor minVentas que
 * no supera la cantidad de ventas). Debajo del primer escalón → 0. Por encima
 * del último → se queda en el último.
 */
export function calcularBonoMensual(
  ventas: number,
  config: ComisionConfig
): BonoMensual {
  const escalones = [...config.bonos].sort((a, b) => a.minVentas - b.minVentas)
  let alcanzado: EscalonBono | null = null
  let siguiente: EscalonBono | null = null

  for (const e of escalones) {
    if (ventas >= e.minVentas) alcanzado = e
    else if (siguiente === null) siguiente = e
  }

  return {
    escalon: alcanzado?.minVentas ?? null,
    importe: alcanzado?.importe ?? 0,
    siguienteEscalon: siguiente,
    faltanParaSiguiente: siguiente ? siguiente.minVentas - ventas : null,
  }
}
