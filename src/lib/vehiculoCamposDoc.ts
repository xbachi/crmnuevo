/**
 * Acceso a vehiculo_campos_doc: los campos que rellenó el permiso de
 * circulación / la tarjeta ITV y que todavía no ha confirmado una persona.
 *
 * La parte con reglas (qué es obligatorio y cuándo) vive en
 * `@/lib/camposVehiculo`, que es pura y testeable. Aquí sólo está el SQL.
 *
 * Todo lo de lectura es tolerante a fallos a propósito: si la tabla no está
 * aplicada todavía, o la consulta revienta, se devuelve "no hay pendientes" y se
 * loguea. Un error de infraestructura no puede dejar el stock sin poder
 * publicarse; publicar de más se deshace en un clic, no poder publicar durante
 * un despliegue es una mañana perdida.
 */

import { pool } from '@/lib/direct-database'
import {
  faltantesPublicar,
  type Faltante,
  type FichaPublicable,
  type VehiculoPublicable,
} from '@/lib/camposVehiculo'

export interface CampoDocPendiente {
  campo: string
  valor: string | null
  confianza: number | null
  archivo: string | null
  ficha_id: number | null
  aplicado_at: string | null
}

/** Cliente de pg o el pool: el cron ya tiene el suyo dentro de su bucle. */
type Ejecutor = Pick<typeof pool, 'query'>

/** Campos de este coche pendientes de confirmar, del más reciente al más viejo. */
export async function pendientesDe(
  vehiculoId: number
): Promise<CampoDocPendiente[]> {
  try {
    const r = await pool.query<CampoDocPendiente>(
      `SELECT campo, valor, confianza::float8 AS confianza, archivo, ficha_id,
              aplicado_at
         FROM vehiculo_campos_doc
        WHERE vehiculo_id = $1 AND confirmado_at IS NULL
        ORDER BY aplicado_at DESC, campo`,
      [vehiculoId]
    )
    return r.rows
  } catch (err) {
    console.error('[campos-doc] pendientes:', (err as Error)?.message ?? err)
    return []
  }
}

export interface CampoDocEscrito {
  campo: string
  valor: string | null
  confianza: number | null
  fichaId?: number | null
  archivo?: string | null
}

/**
 * Deja constancia de que el documento rellenó varios campos de un coche, en un
 * solo INSERT. Una fila por (vehiculo_id, campo): si llega una foto mejor y se
 * vuelve a rellenar, se pisa el valor y el campo vuelve a quedar SIN confirmar
 * — es un dato nuevo y nadie lo ha mirado.
 *
 * `ejecutor` permite pasar el cliente de una transacción: el valor y esta marca
 * tienen que entrar juntos. Si el valor se escribiera sin la marca, el coche se
 * podría publicar con un dato leído por IA que nadie ha confirmado, que es
 * justo lo que esta tabla existe para impedir.
 */
export async function registrarCamposDoc(
  ejecutor: Ejecutor,
  vehiculoId: number,
  campos: readonly CampoDocEscrito[]
): Promise<void> {
  if (campos.length === 0) return
  await ejecutor.query(
    `INSERT INTO vehiculo_campos_doc
       (vehiculo_id, campo, valor, confianza, ficha_id, archivo)
     SELECT $1, x.campo, x.valor, x.confianza, x.ficha_id, x.archivo
       FROM jsonb_to_recordset($2::jsonb)
         AS x(campo text, valor text, confianza numeric, ficha_id int, archivo text)
     ON CONFLICT (vehiculo_id, campo) DO UPDATE
       SET valor = EXCLUDED.valor,
           confianza = EXCLUDED.confianza,
           ficha_id = EXCLUDED.ficha_id,
           archivo = EXCLUDED.archivo,
           aplicado_at = NOW(),
           confirmado_at = NULL,
           confirmado_por = NULL`,
    [
      vehiculoId,
      JSON.stringify(
        campos.map((c) => ({
          campo: c.campo,
          valor: c.valor,
          confianza: c.confianza,
          ficha_id: c.fichaId ?? null,
          archivo: c.archivo ?? null,
        }))
      ),
    ]
  )
}

/**
 * El campo deja de estar pendiente porque una persona lo ha reescrito a mano:
 * editar el coche o su ficha comercial ES confirmarlo. Sin esto, corregir un
 * dato mal leído dejaba el coche bloqueado con el valor viejo en pantalla.
 *
 * Silencioso a propósito: es un efecto secundario de guardar, y que falle no
 * puede tumbar el guardado.
 */
export async function olvidarCamposDoc(
  vehiculoId: number,
  campos: readonly string[]
): Promise<void> {
  if (campos.length === 0) return
  try {
    await pool.query(
      `DELETE FROM vehiculo_campos_doc
        WHERE vehiculo_id = $1 AND campo = ANY($2::text[])`,
      [vehiculoId, [...campos]]
    )
  } catch (err) {
    console.error('[campos-doc] olvidar:', (err as Error)?.message ?? err)
  }
}

/**
 * Marca campos como confirmados por una persona. Devuelve los que realmente
 * cambiaron: confirmar dos veces el mismo campo no es un error, simplemente no
 * hace nada la segunda vez.
 */
export async function confirmarCampos(
  vehiculoId: number,
  campos: readonly string[],
  por: string
): Promise<string[]> {
  if (campos.length === 0) return []
  const r = await pool.query<{ campo: string }>(
    `UPDATE vehiculo_campos_doc
        SET confirmado_at = NOW(), confirmado_por = $3
      WHERE vehiculo_id = $1
        AND campo = ANY($2::text[])
        AND confirmado_at IS NULL
      RETURNING campo`,
    [vehiculoId, [...campos], por.slice(0, 120)]
  )
  return r.rows.map((x) => x.campo)
}

interface FilaPublicable extends VehiculoPublicable {
  id: number
}

/**
 * Lo que falta para poder pasar este coche a PUBLICADO. Lista vacía = adelante.
 *
 * Lee el vehículo, su ficha comercial y sus pendientes de confirmar en una sola
 * consulta (el pool es compartido y estamos dentro de un PUT: no queremos tres
 * idas y vueltas). Si el coche no existe devuelve lista vacía: el 404 lo da
 * quien llama, no esto.
 *
 * `patch` son los campos de "Vehiculo" que ESA MISMA petición está a punto de
 * escribir. Sin él, rellenar el color y publicar en el mismo PUT —que es lo que
 * hace el modal de edición— se bloquearía contra el color viejo, todavía vacío.
 */
export async function faltantesParaPublicar(
  vehiculoId: number,
  patch: Record<string, unknown> = {}
): Promise<Faltante[]> {
  try {
    const r = await pool.query<{
      vehiculo: FilaPublicable | null
      ficha: FichaPublicable
      pendientes: string[] | null
    }>(
      `SELECT to_jsonb(v) AS vehiculo,
              to_jsonb(f) AS ficha,
              (SELECT array_agg(d.campo)
                 FROM vehiculo_campos_doc d
                WHERE d.vehiculo_id = v.id AND d.confirmado_at IS NULL) AS pendientes
         FROM "Vehiculo" v
         LEFT JOIN vehiculo_ficha_comercial f ON f.vehiculo_id = v.id
        WHERE v.id = $1`,
      [vehiculoId]
    )
    const fila = r.rows[0]
    if (!fila?.vehiculo) return []
    return faltantesPublicar(
      { ...fila.vehiculo, ...patch },
      fila.ficha ?? null,
      fila.pendientes ?? []
    )
  } catch (err) {
    console.error(
      '[campos-doc] faltantes para publicar:',
      (err as Error)?.message ?? err
    )
    return []
  }
}
