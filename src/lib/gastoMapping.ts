/**
 * Mapeo puro tipo-de-factura → columna de gastos del Vehiculo.
 *
 * Extraído de src/app/api/vehiculos/gasto/route.ts para testearlo sin arrastrar
 * pg. Define a qué campo del modelo va cada proveedor/concepto y qué "tipos"
 * comparten campo (necesario para recomputar el campo = SUMA de esas facturas).
 */

// tipo (proveedor/concepto) → columna del modelo Vehiculo
export const TIPO_A_CAMPO: Record<string, string> = {
  mecauto: 'gastosMecanica', // taller
  fergo: 'gastosPintura', // chapa
  world: 'gastosLimpieza', // limpieza (world-detailing)
  'world-detailing': 'gastosLimpieza',
  worlddetailing: 'gastosLimpieza',
  limpieza: 'gastosLimpieza',
  compra: 'precioCompra',
  transporte: 'gastosTransporte',
  porte: 'gastosTransporte',
  itv: 'gastosOtros',
}

export const normPlate = (s: string) => s.replace(/[\s.\-]/g, '').toUpperCase()

/** Columna del Vehiculo para un tipo (case/space-insensitive), o null si no existe. */
export function campoParaTipo(tipoRaw: string): string | null {
  return TIPO_A_CAMPO[String(tipoRaw).toLowerCase().trim()] ?? null
}

/** Todos los tipos que escriben en el mismo campo (para sumar sus facturas). */
export function tiposCanonicos(campo: string): string[] {
  return Object.entries(TIPO_A_CAMPO)
    .filter(([, c]) => c === campo)
    .map(([t]) => t)
}
