/**
 * Pasos de preparación del vehículo (tabla vehiculo_pasos). Sólo los 7 que
 * coinciden con estados del kanban; CARPETA..SEGURO viven en "Vehiculo".
 */
import { pool } from '@/lib/direct-database'
import { dateToYMD, esFechaYMD } from '@/lib/fechas'
import { normalizarEstado } from '@/lib/vehiculoEstado'

export const PASOS_VEHICULO = [
  'REVI_INIC',
  'MECAUTO',
  'REVI_PINTURA',
  'PINTURA',
  'LIMPIEZA',
  'FOTOS',
  'PUBLICADO',
] as const
export type PasoVehiculo = (typeof PASOS_VEHICULO)[number]
export type FuentePaso = 'crm' | 'import'

export interface PasoRow {
  paso: PasoVehiculo
  texto: string | null
  fecha: string | null
  fuente: FuentePaso
}

export interface PasoInput {
  paso: PasoVehiculo
  texto?: string | null
  fecha?: string | null
}

export function esPasoVehiculo(v: unknown): v is PasoVehiculo {
  return (PASOS_VEHICULO as readonly string[]).includes(String(v))
}

export async function getPasos(vehiculoId: number): Promise<PasoRow[]> {
  const res = await pool.query(
    `SELECT paso, texto, fecha, fuente FROM vehiculo_pasos
      WHERE vehiculo_id = $1`,
    [vehiculoId]
  )
  const orden = new Map(PASOS_VEHICULO.map((p, i) => [p, i]))
  return res.rows
    .map((r) => ({
      paso: r.paso as PasoVehiculo,
      texto: r.texto ?? null,
      fecha: dateToYMD(r.fecha),
      fuente: (r.fuente ?? 'crm') as FuentePaso,
    }))
    .sort((a, b) => (orden.get(a.paso) ?? 0) - (orden.get(b.paso) ?? 0))
}

/** Sobrescribe texto/fecha del paso (edición desde la UI). */
export async function upsertPasos(
  vehiculoId: number,
  pasos: PasoInput[],
  fuente: FuentePaso = 'crm'
): Promise<void> {
  for (const p of pasos) {
    if (!esPasoVehiculo(p.paso)) continue
    const texto = p.texto == null ? null : String(p.texto).trim() || null
    const fecha = p.fecha && esFechaYMD(p.fecha) ? p.fecha : null
    await pool.query(
      `INSERT INTO vehiculo_pasos (vehiculo_id, paso, texto, fecha, fuente)
       VALUES ($1, $2, $3, $4::date, $5)
       ON CONFLICT (vehiculo_id, paso) DO UPDATE SET
         texto = EXCLUDED.texto,
         fecha = EXCLUDED.fecha,
         fuente = EXCLUDED.fuente,
         updated_at = NOW()`,
      [vehiculoId, p.paso, texto, fecha, fuente]
    )
  }
}

/**
 * Al cambiar el estado del vehículo a un paso de preparación, deja constancia
 * con fecha de hoy. Si la fila vino de la importación se conserva el texto
 * original y sólo se rellena la fecha si faltaba. Best-effort: nunca lanza.
 */
export async function registrarPasoEstado(
  vehiculoId: number,
  estado: string | null | undefined,
  hoy: Date = new Date()
): Promise<boolean> {
  try {
    const paso = normalizarEstado(estado)
    if (!paso || !esPasoVehiculo(paso)) return false
    const ymd = hoy.toISOString().slice(0, 10)
    const texto = `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`
    await pool.query(
      `INSERT INTO vehiculo_pasos (vehiculo_id, paso, texto, fecha, fuente)
       VALUES ($1, $2, $3, $4::date, 'crm')
       ON CONFLICT (vehiculo_id, paso) DO UPDATE SET
         texto = CASE WHEN vehiculo_pasos.fuente = 'import'
                      THEN vehiculo_pasos.texto ELSE EXCLUDED.texto END,
         fecha = COALESCE(vehiculo_pasos.fecha, EXCLUDED.fecha),
         updated_at = NOW()`,
      [vehiculoId, paso, texto, ymd]
    )
    return true
  } catch (err) {
    console.error(
      '[vehiculoPasos] registrar paso:',
      (err as Error)?.message ?? err
    )
    return false
  }
}
