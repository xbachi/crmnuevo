/**
 * Lógica pura del wizard de nueva venta (/deals/nuevo), separada del
 * componente para poder testearla sin montar 1.400 líneas de JSX.
 */
import { normalizarEstado } from './vehiculoEstado'

export interface VehiculoPreseleccion {
  estado?: string | null
  /** Venta activa que devuelve GET /api/vehiculos/{id} (join por dealActivoId). */
  venta?: { dealId?: number | null } | null
  dealActivoId?: number | null
}

/**
 * Un vehículo reservado/vendido, o con una venta activa colgando, no se puede
 * volver a vender desde el wizard aunque llegue por ?vehiculoId= en la URL.
 */
export function puedePreseleccionarVehiculo(v: VehiculoPreseleccion): boolean {
  const estado = normalizarEstado(v.estado)
  if (estado === 'RESERVADO' || estado === 'VENDIDO') return false
  if (v.venta?.dealId) return false
  if (v.dealActivoId) return false
  return true
}

/** Pasos del wizard: 1 cliente, 2 vehículo, 3 datos de la reserva. */
export function resolverPasoInicial({
  cliente,
  vehiculo,
}: {
  cliente: boolean
  vehiculo: boolean
}): 1 | 2 | 3 {
  if (cliente && vehiculo) return 3
  if (cliente) return 2
  return 1
}
