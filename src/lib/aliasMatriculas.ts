/**
 * Alias de matrícula: un coche puede cambiar de matrícula (provisional →
 * definitiva, re-matriculación) y los documentos ya emitidos se quedan con la
 * vieja. Los cruces por matrícula (facturas ↔ carpetas ↔ CB ↔ expedientes)
 * tienen que entender que las dos son el MISMO coche.
 *
 * Fuente: tabla vehiculo_matriculas (create-vehiculo-matriculas.sql). Si la
 * tabla no existe todavía, el índice queda vacío y todo se comporta como antes.
 *
 * Regla de seguridad: si una matrícula figura en DOS vehículos distintos, es
 * ambigua y NO se aliasa (cada lado se compara consigo mismo). Nunca se unen
 * dos coches distintos por un dato sucio.
 */

import type { Pool, PoolClient } from 'pg'
import { normPlate } from '@/lib/facturasRegistro'

type Db = Pool | PoolClient

export interface GrupoAlias {
  vehiculoId: number
  matriculas: string[]
}

/** plate normalizada → clave canónica del grupo (la menor del grupo, estable). */
export interface AliasIndex {
  canon: Map<string, string>
  grupos: Map<string, string[]> // clave canónica → matrículas del grupo
}

export const ALIAS_VACIO: AliasIndex = { canon: new Map(), grupos: new Map() }

export function construirAliasIndex(grupos: GrupoAlias[]): AliasIndex {
  // 1. matrícula → vehículos que la reclaman (para detectar ambiguas).
  const dueños = new Map<string, Set<number>>()
  const porVehiculo = new Map<number, Set<string>>()
  for (const g of grupos) {
    for (const raw of g.matriculas) {
      const p = normPlate(String(raw ?? ''))
      if (!p) continue
      if (!dueños.has(p)) dueños.set(p, new Set())
      dueños.get(p)!.add(g.vehiculoId)
      if (!porVehiculo.has(g.vehiculoId)) porVehiculo.set(g.vehiculoId, new Set())
      porVehiculo.get(g.vehiculoId)!.add(p)
    }
  }

  const canon = new Map<string, string>()
  const gruposOut = new Map<string, string[]>()
  for (const [, plates] of porVehiculo) {
    // Las ambiguas se caen del grupo: no aportan identidad.
    const limpias = [...plates].filter((p) => (dueños.get(p)?.size ?? 0) === 1).sort()
    if (limpias.length < 2) continue // un solo alias = nada que resolver
    const clave = limpias[0]
    gruposOut.set(clave, limpias)
    for (const p of limpias) canon.set(p, clave)
  }
  return { canon, grupos: gruposOut }
}

/** Matrícula normalizada y reducida a la clave canónica de su coche. */
export function canonPlate(idx: AliasIndex | null | undefined, plate: string): string {
  const p = normPlate(String(plate ?? ''))
  return idx?.canon.get(p) ?? p
}

/** Todas las matrículas equivalentes (incluida la propia), normalizadas. */
export function resolverAliasMatricula(
  idx: AliasIndex | null | undefined,
  plate: string
): string[] {
  const p = normPlate(String(plate ?? ''))
  if (!p) return []
  const clave = idx?.canon.get(p)
  if (!clave) return [p]
  return idx!.grupos.get(clave) ?? [p]
}

/** ¿Las dos matrículas son del mismo coche? */
export function mismoVehiculo(
  idx: AliasIndex | null | undefined,
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false
  return canonPlate(idx, a) === canonPlate(idx, b)
}

async function existeTabla(db: Db): Promise<boolean> {
  const reg = await db.query<{ reg: string | null }>(
    `SELECT to_regclass('public.vehiculo_matriculas') AS reg`
  )
  return Boolean(reg.rows[0]?.reg)
}

/** Índice completo (una query). Vacío si la tabla todavía no existe. */
export async function cargarAliasIndex(db: Db): Promise<AliasIndex> {
  if (!(await existeTabla(db))) return ALIAS_VACIO
  const res = await db.query<{ vehiculo_id: number; matriculas: string[] }>(
    `SELECT vehiculo_id, ARRAY_AGG(matricula_norm) AS matriculas
       FROM vehiculo_matriculas
      WHERE matricula_norm <> ''
      GROUP BY vehiculo_id
     HAVING COUNT(*) > 1`
  )
  return construirAliasIndex(
    res.rows.map((r) => ({
      vehiculoId: r.vehiculo_id,
      matriculas: Array.isArray(r.matriculas) ? r.matriculas : [],
    }))
  )
}

/**
 * Alias de UNA matrícula (para queries puntuales: `matricula = ANY($1)`).
 * Devuelve siempre al menos la propia. Si la matrícula figura en más de un
 * vehículo, no se aliasa.
 */
export async function aliasDeMatricula(db: Db, plate: string): Promise<string[]> {
  const p = normPlate(String(plate ?? ''))
  if (!p) return []
  if (!(await existeTabla(db))) return [p]
  const res = await db.query<{ matricula_norm: string; vehiculo_id: number }>(
    `SELECT m2.matricula_norm, m2.vehiculo_id
       FROM vehiculo_matriculas m1
       JOIN vehiculo_matriculas m2 ON m2.vehiculo_id = m1.vehiculo_id
      WHERE m1.matricula_norm = $1`,
    [p]
  )
  const vehiculos = new Set(res.rows.map((r) => r.vehiculo_id))
  if (vehiculos.size !== 1) return [p] // sin filas, o matrícula ambigua
  const plates = new Set(res.rows.map((r) => normPlate(r.matricula_norm)).filter(Boolean))
  plates.add(p)
  return [...plates].sort()
}
