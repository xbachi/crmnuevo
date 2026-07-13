/**
 * Efecto de una VENTA sobre el estado del vehículo, en un solo lugar.
 *
 * El flujo retail ya lo hacía (updateDeal en direct-database.ts: el Deal pasa
 * a 'vendido'/'facturado' → el Vehiculo pasa a vendido + dealActivoId; borrar
 * el deal lo devuelve a 'disponible'). El flujo B2B no tocaba el vehículo:
 * el coche se vendía y seguía en stock, contaminando stock-aging, el KPI de
 * vendidos y "Ventas por mes" (todos leen Vehiculo.estado).
 *
 * Estos helpers son el MISMO camino, pasado por la máquina de estados
 * canónica (vehiculoEstado.ts) en vez de un UPDATE suelto:
 *   - marcarVehiculoVendido: idempotente (si ya está VENDIDO, no-op).
 *   - liberarVehiculoVendido: sólo si el vehículo está VENDIDO y NINGÚN deal
 *     retail lo reclama (dealActivoId IS NULL) — la anulación de una venta B2B
 *     no puede pisar una venta retail del mismo coche.
 *
 * Reciben un Queryable (pool o client dentro de un tx): el pool está capado y
 * no se abre una conexión nueva acá.
 */

import { normalizarEstado, transicionValida } from './vehiculoEstado'

export interface Queryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: R[]; rowCount: number | null }>
}

export type MarcarVendidoResult =
  | 'marcado'
  | 'ya-vendido'
  | 'sin-vehiculo'
  | 'transicion-invalida'

export type LiberarResult =
  | 'liberado'
  | 'no-estaba-vendido'
  | 'sin-vehiculo'
  | 'reclamado-por-deal'

interface VehiculoEstadoRow extends Record<string, unknown> {
  estado: string | null
  dealActivoId: number | null
}

async function leerVehiculo(
  db: Queryable,
  vehiculoId: number
): Promise<VehiculoEstadoRow | null> {
  const { rows } = await db.query<VehiculoEstadoRow>(
    `SELECT estado, "dealActivoId" FROM "Vehiculo" WHERE id = $1`,
    [vehiculoId]
  )
  return rows[0] ?? null
}

/**
 * Marca el vehículo como VENDIDO. NO toca dealActivoId (una venta B2B no
 * tiene deal; una retail lo setea en su propio camino).
 * `force` saltea la validación de transición (mismo escape que
 * PUT /api/vehiculos/[id]), dejando warn de auditoría.
 */
export async function marcarVehiculoVendido(
  db: Queryable,
  vehiculoId: number,
  opts: { origen: string; force?: boolean } = { origen: 'desconocido' }
): Promise<MarcarVendidoResult> {
  const v = await leerVehiculo(db, vehiculoId)
  if (!v) return 'sin-vehiculo'

  if (normalizarEstado(v.estado) === 'VENDIDO') return 'ya-vendido'

  if (!transicionValida(v.estado, 'VENDIDO')) {
    if (!opts.force) return 'transicion-invalida'
    console.warn(
      `⚠️ [AUDIT] Transición forzada a VENDIDO en vehículo ${vehiculoId} (origen: ${opts.origen}): '${v.estado ?? ''}' → 'VENDIDO'`
    )
  }

  await db.query(
    `UPDATE "Vehiculo" SET estado = 'VENDIDO', "updatedAt" = NOW() WHERE id = $1`,
    [vehiculoId]
  )
  return 'marcado'
}

/**
 * Devuelve el vehículo a stock (VENDIDO → DISPONIBLE) al anularse la venta.
 * Guardas: sólo si está VENDIDO (idempotente) y si ningún deal retail lo
 * reclama todavía.
 */
export async function liberarVehiculoVendido(
  db: Queryable,
  vehiculoId: number,
  opts: { origen: string } = { origen: 'desconocido' }
): Promise<LiberarResult> {
  const v = await leerVehiculo(db, vehiculoId)
  if (!v) return 'sin-vehiculo'
  if (normalizarEstado(v.estado) !== 'VENDIDO') return 'no-estaba-vendido'
  if (v.dealActivoId != null) {
    console.warn(
      `[vehiculoVenta] vehículo ${vehiculoId} NO se libera (origen: ${opts.origen}): lo reclama el deal ${v.dealActivoId}`
    )
    return 'reclamado-por-deal'
  }

  await db.query(
    `UPDATE "Vehiculo" SET estado = 'DISPONIBLE', "updatedAt" = NOW() WHERE id = $1`,
    [vehiculoId]
  )
  return 'liberado'
}
