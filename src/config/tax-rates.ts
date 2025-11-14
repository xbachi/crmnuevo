/**
 * Configuración de tasas fiscales y porcentajes
 * Centraliza todos los valores mágicos relacionados con impuestos y beneficios
 */

export const TAX_CONFIG = {
  /** IVA (Impuesto sobre el Valor Añadido) - 21% */
  IVA_RATE: 0.21,

  /** Impuesto de Sociedades - 25% */
  IMPUESTO_SOCIEDADES_RATE: 0.25,

  /** Porcentaje del beneficio que corresponde al inversor - 50% */
  BENEFICIO_INVERSOR_PERCENTAGE: 0.5,
} as const

/**
 * Obtiene la tasa de IVA
 */
export function getIVARate(): number {
  return TAX_CONFIG.IVA_RATE
}

/**
 * Obtiene la tasa de Impuesto de Sociedades
 */
export function getImpuestoSociedadesRate(): number {
  return TAX_CONFIG.IMPUESTO_SOCIEDADES_RATE
}

/**
 * Obtiene el porcentaje de beneficio del inversor
 */
export function getBeneficioInversorPercentage(): number {
  return TAX_CONFIG.BENEFICIO_INVERSOR_PERCENTAGE
}
