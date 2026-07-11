/**
 * Period locking (cierre mensual contable).
 *
 * Un mes con estado='cerrado' en `periodos_contables` ya fue entregado a la
 * gestoría: nada nuevo puede caer contablemente en él. Los guards de emisión /
 * registro / gastos consultan acá.
 *
 * Tolerante a la migración pendiente: si la tabla no existe (to_regclass →
 * NULL) TODO está abierto — el deploy no depende de correr
 * create-periodos-contables.sql primero.
 */

import type { Pool, PoolClient } from 'pg'

export class PeriodoCerradoError extends Error {
  constructor(
    public anio: number,
    public mes: number,
    contexto?: string
  ) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`
    super(
      `${contexto ? `${contexto}: ` : ''}el período ${periodo} está cerrado; reabrilo desde /api/admin/periodos si corresponde.`
    )
    this.name = 'PeriodoCerradoError'
  }
}

/** anio/mes de una fecha ISO (YYYY-MM-DD...) o Date. null si no es parseable. */
export function periodoDe(
  fecha: Date | string | null | undefined
): { anio: number; mes: number } | null {
  if (fecha == null) return null
  if (fecha instanceof Date) {
    if (Number.isNaN(fecha.getTime())) return null
    return { anio: fecha.getFullYear(), mes: fecha.getMonth() + 1 }
  }
  const m = /^(\d{4})-(\d{2})/.exec(String(fecha).trim())
  if (!m) return null
  const anio = parseInt(m[1], 10)
  const mes = parseInt(m[2], 10)
  if (mes < 1 || mes > 12) return null
  return { anio, mes }
}

/**
 * ¿La fecha cae en un período cerrado? false si la fecha no es parseable o si
 * la tabla periodos_contables todavía no existe (migración pendiente).
 */
export async function esPeriodoCerrado(
  db: Pool | PoolClient,
  fecha: Date | string | null | undefined
): Promise<boolean> {
  const p = periodoDe(fecha)
  if (!p) return false
  const reg = await db.query<{ t: string | null }>(
    `SELECT to_regclass('public.periodos_contables')::text AS t`
  )
  if (!reg.rows[0]?.t) return false
  const res = await db.query(
    `SELECT 1 FROM periodos_contables WHERE anio = $1 AND mes = $2 AND estado = 'cerrado'`,
    [p.anio, p.mes]
  )
  return res.rows.length > 0
}

/** Lanza PeriodoCerradoError si la fecha cae en un mes cerrado. */
export async function assertPeriodoAbierto(
  db: Pool | PoolClient,
  fecha: Date | string | null | undefined,
  contexto?: string
): Promise<void> {
  if (await esPeriodoCerrado(db, fecha)) {
    const p = periodoDe(fecha)!
    throw new PeriodoCerradoError(p.anio, p.mes, contexto)
  }
}
