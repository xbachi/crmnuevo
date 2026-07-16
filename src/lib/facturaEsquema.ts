/**
 * Detección del esquema fiscal en runtime.
 *
 * Las migraciones (create-proveedores / add-facturas-registro-fiscal /
 * create-facturas-registro-lineas) se corren A MANO en Supabase, así que el deploy
 * puede ir por delante de la DB. El endpoint que registra las facturas de
 * proveedor NO puede caerse por eso: si las columnas nuevas no están, se hace el
 * INSERT viejo y listo — perder la factura es peor que registrarla sin capa fiscal.
 *
 * Mismo criterio que periodoLock: to_regclass → si no existe, degradar en silencio.
 *
 * El resultado se cachea por instancia de función (igual que el pool). El fallo de
 * la detección NO se cachea: un timeout puntual no debe condenar a la instancia a
 * hacer inserts viejos para siempre.
 */

import type { Pool, PoolClient } from 'pg'

export interface EsquemaFiscal {
  /** Existe la tabla `proveedores` → se puede resolver proveedor_id y sus defaults. */
  proveedores: boolean
  /** Existe `facturas_registro_lineas` → se puede guardar el desglose. */
  lineas: boolean
  /** `facturas_registro` tiene las columnas fiscales (se testea por `estado`). */
  fiscal: boolean
}

const SIN_ESQUEMA: EsquemaFiscal = { proveedores: false, lineas: false, fiscal: false }

let cache: EsquemaFiscal | null = null

/** Sólo para tests: el cache vive en el módulo y sobrevive entre casos. */
export function resetEsquemaCache(): void {
  cache = null
}

export async function detectarEsquemaFiscal(db: Pool | PoolClient): Promise<EsquemaFiscal> {
  if (cache) return cache
  try {
    const r = await db.query<{ prov: string | null; lin: string | null; estado: string | number }>(
      `SELECT to_regclass('public.proveedores')::text              AS prov,
              to_regclass('public.facturas_registro_lineas')::text AS lin,
              (SELECT count(*) FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name   = 'facturas_registro'
                  AND column_name  = 'estado')                     AS estado`
    )
    const row = r.rows[0]
    if (!row) return SIN_ESQUEMA
    cache = {
      proveedores: !!row.prov,
      lineas: !!row.lin,
      fiscal: Number(row.estado ?? 0) > 0,
    }
    return cache
  } catch {
    // Sin cachear: que un fallo puntual no degrade la instancia entera.
    return SIN_ESQUEMA
  }
}
