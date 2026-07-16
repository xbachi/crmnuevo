/**
 * Traza de cambios sobre datos fiscales (`fiscal_audit_log`).
 *
 * Una factura ya declarada a la AEAT no se toca: si el dato cambia después de
 * presentar el modelo, la declaración y el CRM dejan de cuadrar y nadie sabe cuál
 * de los dos miente. Acá se registra QUIÉN cambió QUÉ y POR QUÉ, para poder
 * reconstruir el estado que se declaró en su día.
 *
 * Tolerante a la migración pendiente: si la tabla no existe (to_regclass → NULL)
 * el registro es un no-op silencioso — el deploy no puede depender de correr el
 * SQL primero (mismo criterio que periodoLock).
 */

import type { Pool, PoolClient } from 'pg'

export type AccionAudit = 'crear' | 'editar' | 'transicion' | 'validar' | 'correccion-post-declaracion'

export interface CambioCampo {
  antes: unknown
  despues: unknown
}

/** Estados en los que la fila ya no admite edición libre. */
const ESTADOS_INMUTABLES = new Set(['declarada', 'rectificada', 'anulada'])

/**
 * Normaliza para comparar por VALOR, no por representación.
 *
 * Dos trampas conocidas:
 *  - pg devuelve NUMERIC como string: "12.50" y 12.5 son el MISMO importe (este
 *    bug ya mordió en costoBeneficio, marcando cambios fantasma en cada sync).
 *  - Date vs su ISO string son el mismo instante.
 */
function normalizarValor(v: unknown): unknown {
  if (v == null) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString()
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v)
  if (typeof v === 'string') {
    const t = v.trim()
    // Solo numérico "de verdad": no convertimos "" ni "1e3" ni matrículas.
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
    return v
  }
  return v
}

function mismoValor(a: unknown, b: unknown): boolean {
  const na = normalizarValor(a)
  const nb = normalizarValor(b)
  if (na === nb) return true
  if (na === null || nb === null) return false
  if (typeof na === 'object' || typeof nb === 'object') {
    return JSON.stringify(na) === JSON.stringify(nb)
  }
  return false
}

/**
 * Campos que realmente cambiaron. `undefined` en `despues` se ignora: un campo
 * no enviado no es un campo borrado (para borrar se manda null explícito).
 */
export function diffCampos(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>
): Record<string, CambioCampo> {
  const out: Record<string, CambioCampo> = {}
  for (const campo of Object.keys(despues ?? {})) {
    const nuevo = despues[campo]
    if (nuevo === undefined) continue
    const viejo = (antes ?? {})[campo]
    if (!mismoValor(viejo, nuevo)) out[campo] = { antes: viejo ?? null, despues: nuevo }
  }
  return out
}

export interface RegistrarCambioParams {
  tabla: string
  filaId: number
  accion: AccionAudit
  cambios: Record<string, CambioCampo>
  actor: string
  motivo?: string
}

/**
 * Inserta la entrada de auditoría.
 *
 * DEBE llamarse con el mismo `PoolClient` y dentro de la MISMA transacción que el
 * UPDATE que audita: si el UPDATE hace rollback, la traza también, y nunca queda
 * un audit de un cambio que no ocurrió (ni un cambio sin audit).
 */
export async function registrarCambio(
  db: Pool | PoolClient,
  params: RegistrarCambioParams
): Promise<void> {
  const reg = await db.query<{ t: string | null }>(
    `SELECT to_regclass('public.fiscal_audit_log')::text AS t`
  )
  if (!reg.rows[0]?.t) return

  await db.query(
    `INSERT INTO fiscal_audit_log (tabla, fila_id, accion, cambios, motivo, actor)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
    [
      params.tabla,
      params.filaId,
      params.accion,
      JSON.stringify(params.cambios ?? {}),
      params.motivo ?? null,
      params.actor,
    ]
  )
}

export class RegistroInmutableError extends Error {
  constructor(
    public estado: string,
    contexto?: string
  ) {
    super(
      `${contexto ? `${contexto}: ` : ''}el registro está ${estado} y no se puede modificar; ` +
        `una factura ya declarada solo se corrige indicando un motivo (queda registrado en la auditoría como 'correccion-post-declaracion').`
    )
    this.name = 'RegistroInmutableError'
  }
}

/**
 * Guarda de inmutabilidad. Los estados declarada/rectificada/anulada solo se
 * tocan con `force` + `motivo` no vacío — el motivo es el que justifica la
 * corrección ante la gestoría, así que sin motivo no hay force que valga.
 */
export function assertRegistroMutable(
  row: { estado?: string | null },
  opts?: { force?: boolean; motivo?: string }
): void {
  const estado = String(row?.estado ?? '').toLowerCase()
  if (!ESTADOS_INMUTABLES.has(estado)) return
  if (opts?.force && String(opts.motivo ?? '').trim()) return
  throw new RegistroInmutableError(estado)
}
