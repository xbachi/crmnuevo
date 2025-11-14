/**
 * Cálculos financieros centralizados para vehículos de inversor
 * Evita duplicación de lógica y garantiza consistencia en los cálculos
 */

import {
  TAX_CONFIG,
  getIVARate,
  getImpuestoSociedadesRate,
  getBeneficioInversorPercentage,
} from '@/config/tax-rates'

export interface VehicleTaxCalculationParams {
  /** Precio de compra del vehículo */
  precioCompra: number
  /** Gastos de transporte */
  gastosTransporte: number
  /** Gastos de tasas/gestoría */
  gastosTasas: number
  /** Gastos de mecánica */
  gastosMecanica: number
  /** Gastos de pintura */
  gastosPintura: number
  /** Gastos de limpieza */
  gastosLimpieza: number
  /** Otros gastos */
  gastosOtros: number
  /** Gastos de CN y Garantía (incluido en costos antes de calcular impuestos) */
  gastosCNGarantia: number
  /** Precio de venta del vehículo */
  precioVenta: number
}

export interface VehicleTaxCalculationResult {
  /** Costo total (precio compra + todos los gastos incluyendo CN y Garantía) */
  costoTotal: number
  /** Diferencia entre precio de venta y costo total */
  diferencia: number
  /** IVA calculado sobre la diferencia */
  iva: number
  /** Base para calcular Impuesto de Sociedades (diferencia - IVA) */
  baseImpuestoSociedades: number
  /** Impuesto de Sociedades calculado */
  impuestoSociedades: number
  /** Beneficio neto total (antes de dividir con inversor) */
  beneficioNetoTotal: number
  /** Beneficio neto para el inversor (50% del beneficio total) */
  beneficioNeto: number
  /** Porcentaje de beneficio sobre el costo total */
  porcentajeBeneficio: number
  /** Indica si hay beneficio (true) o pérdida (false) */
  esBeneficio: boolean
  /** Precio de venta */
  precioVenta: number
}

/**
 * Redondea un número a 2 decimales
 */
function roundTo2Decimals(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Calcula todos los valores fiscales para un vehículo vendido
 *
 * @param params Parámetros de cálculo
 * @returns Resultado con todos los cálculos fiscales
 */
export function calculateVehicleTaxes(
  params: VehicleTaxCalculationParams
): VehicleTaxCalculationResult {
  const {
    precioCompra = 0,
    gastosTransporte = 0,
    gastosTasas = 0,
    gastosMecanica = 0,
    gastosPintura = 0,
    gastosLimpieza = 0,
    gastosOtros = 0,
    gastosCNGarantia = 0,
    precioVenta = 0,
  } = params

  // 1. Calcular costo total (incluye CN y Garantía como costo de compra)
  const costoTotal = roundTo2Decimals(
    precioCompra +
      gastosTransporte +
      gastosTasas +
      gastosMecanica +
      gastosPintura +
      gastosLimpieza +
      gastosOtros +
      gastosCNGarantia
  )

  // 2. Calcular diferencia (precio venta - costo total)
  const diferencia = roundTo2Decimals(precioVenta - costoTotal)

  // 3. Calcular IVA (21% sobre la diferencia)
  const iva = roundTo2Decimals(diferencia * getIVARate())

  // 4. Calcular base para Impuesto de Sociedades (diferencia - IVA)
  const baseImpuestoSociedades = roundTo2Decimals(diferencia - iva)

  // 5. Calcular Impuesto de Sociedades (25% sobre la base)
  const impuestoSociedades = roundTo2Decimals(
    baseImpuestoSociedades * getImpuestoSociedadesRate()
  )

  // 6. Calcular beneficio neto total (diferencia - IVA - Impuesto Sociedades)
  const beneficioNetoTotal = roundTo2Decimals(
    diferencia - iva - impuestoSociedades
  )

  // 7. Calcular beneficio neto para el inversor (50% del beneficio total)
  const beneficioNeto = roundTo2Decimals(
    beneficioNetoTotal * getBeneficioInversorPercentage()
  )

  // 8. Calcular porcentaje de beneficio sobre el costo total
  const porcentajeBeneficio =
    costoTotal > 0
      ? roundTo2Decimals((beneficioNetoTotal / costoTotal) * 100)
      : 0

  // 9. Determinar si hay beneficio o pérdida
  const esBeneficio = beneficioNetoTotal >= 0

  return {
    costoTotal,
    diferencia,
    iva,
    baseImpuestoSociedades,
    impuestoSociedades,
    beneficioNetoTotal,
    beneficioNeto,
    porcentajeBeneficio,
    esBeneficio,
    precioVenta,
  }
}

/**
 * Calcula el beneficio acumulado de múltiples vehículos vendidos
 *
 * @param vehiculos Array de vehículos con sus datos de costos y venta
 * @returns Beneficio acumulado total para el inversor (50% de cada vehículo)
 */
export function calculateBeneficioAcumulado(
  vehiculos: Array<{
    precioCompra?: number | null
    gastosTransporte?: number | null
    gastosTasas?: number | null
    gastosMecanica?: number | null
    gastosPintura?: number | null
    gastosLimpieza?: number | null
    gastosOtros?: number | null
    gastosCNGarantia?: number | null
    precioVenta?: number | null
    estado?: string | null
    garantiaPremium?: boolean | null
  }>
): number {
  let totalBeneficio = 0

  for (const vehiculo of vehiculos) {
    // Solo calcular para vehículos vendidos que tengan precio de venta
    const estadoNormalized = vehiculo.estado?.toLowerCase() || ''
    if (estadoNormalized !== 'vendido' || !vehiculo.precioVenta) {
      continue
    }

    const calculo = calculateVehicleTaxes({
      precioCompra: vehiculo.precioCompra || 0,
      gastosTransporte: vehiculo.gastosTransporte || 0,
      gastosTasas: vehiculo.gastosTasas || 0,
      gastosMecanica: vehiculo.gastosMecanica || 0,
      gastosPintura: vehiculo.gastosPintura || 0,
      gastosLimpieza: vehiculo.gastosLimpieza || 0,
      gastosOtros: vehiculo.gastosOtros || 0,
      gastosCNGarantia: vehiculo.gastosCNGarantia || 0,
      precioVenta: vehiculo.precioVenta,
    })

    // Beneficio neto del inversor (50% del beneficio total)
    let beneficioNeto = calculo.beneficioNeto

    // Si tiene garantía premium, agregar 190€ extra al beneficio del inversor
    const garantiaPremium = vehiculo.garantiaPremium || false
    if (garantiaPremium) {
      beneficioNeto = beneficioNeto + 190
    }

    // Sumar el beneficio neto (ya incluye el 50% y los 190€ si aplica)
    totalBeneficio += beneficioNeto
  }

  return roundTo2Decimals(totalBeneficio)
}
