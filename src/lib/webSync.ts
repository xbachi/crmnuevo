/**
 * Aviso a la web (WordPress, sevencars.es) cuando un coche cambia de estado
 * en el CRM: la ficha pública tiene que decir "reservado" / "vendido" /
 * disponible al instante, no cuando alguien se acuerde de editarla.
 *
 * Mismo patrón que src/lib/gestoriaWebhook.ts: POST con timeout, best-effort,
 * nunca lanza, y no-op silencioso si no está configurado. Cada intento deja
 * fila en `webhook_outbox` (tipo 'web_estado') para que un cambio de estado
 * nunca se pierda sin rastro; ver POST /api/admin/webhook-outbox/retry.
 *
 * Contrato del receptor:
 *   POST $SEVEN_WEB_SYNC_URL
 *   X-Seven-Timestamp: <epoch s>
 *   X-Seven-Signature: sha256=<hmac_sha256(ts + '.' + cuerpoCrudo, SECRETO)>
 *   { matricula, matriculas[], estado, ts }
 *   200 ok · 400 payload · 401 firma · 404 matrícula · 409 repetición · 429 rate
 */

import crypto from 'crypto'
import { pool } from '@/lib/direct-database'
import { normPlate } from '@/lib/facturasRegistro'
import { aliasDeMatricula } from '@/lib/aliasMatriculas'
import { normalizarEstado } from '@/lib/vehiculoEstado'
import {
  insertOutboxPending,
  markOutboxEnviado,
  markOutboxFallo,
  markOutboxAgotado,
} from '@/lib/webhookOutbox'

/** La normalización de matrícula es EXACTAMENTE la del resto del CRM
 *  (facturasRegistro.normPlate, la misma que Vehiculo.matricula_norm en SQL).
 *  Se re-exporta para que quien sincronice con la web no escriba otra. */
export { normPlate }

export type EstadoWeb = 'reservado' | 'vendido' | 'disponible'

export interface WebEstadoPayload {
  /** Matrícula actual, normalizada. */
  matricula: string
  /** Matrícula actual + alias históricos, normalizados. */
  matriculas: string[]
  estado: EstadoWeb
  /** Epoch (s) del CAMBIO de estado. La web lo usa para descartar avisos
   *  obsoletos; NO se re-sella en los reintentos (ver postWebEstado). */
  ts: number
}

export interface WebSyncResult {
  ok: boolean
  status?: number
  error?: string
  /** Fallo definitivo (400/404/409): reintentarlo nunca va a funcionar. */
  permanente?: boolean
}

/**
 * Estado del CRM → estado que entiende la web. Acepta los dos vocabularios
 * (MAYÚSCULAS del kanban y minúsculas del flujo de deals) porque pasa por
 * normalizarEstado(). Cualquier otro estado (preparación, sin estado, basura)
 * devuelve null: de esos no se avisa.
 */
export function estadoWeb(estado: string | null | undefined): EstadoWeb | null {
  switch (normalizarEstado(estado)) {
    case 'RESERVADO':
      return 'reservado'
    case 'VENDIDO':
      return 'vendido'
    case 'PUBLICADO':
    case 'DISPONIBLE':
      return 'disponible'
    default:
      return null
  }
}

/** Firma del contrato: HMAC-SHA256 sobre `${ts}.${cuerpo}` en hex. */
export function firmaWebSync(
  ts: number,
  cuerpo: string,
  secreto: string
): string {
  return crypto
    .createHmac('sha256', secreto)
    .update(`${ts}.${cuerpo}`)
    .digest('hex')
}

/**
 * POST crudo a la web. Sin bookkeeping de outbox — lo comparten
 * notifyWebVehiculoEstado() y el endpoint de reintento.
 *
 * El ts de la CABECERA se sella aquí (ventana de validez del receptor), no se
 * reusa el del cuerpo: un reintento horas después con el ts viejo caería fuera
 * de la ventana y nunca entraría. El ts del CUERPO se queda con el del cambio
 * original, que es lo que la web necesita para ordenar/descartar avisos.
 */
export async function postWebEstado(
  payload: WebEstadoPayload
): Promise<WebSyncResult> {
  const url = process.env.SEVEN_WEB_SYNC_URL
  const secreto = process.env.SEVEN_WEB_SYNC_SECRET
  if (!url || !secreto) {
    return { ok: false, error: 'SEVEN_WEB_SYNC_URL/SECRET no configuradas' }
  }

  // El cuerpo se serializa UNA sola vez: esta misma cadena es la que se firma
  // y la que se manda. Serializar dos veces puede dar bytes distintos (orden
  // de claves, floats) y la firma no validaría del otro lado.
  const cuerpo = JSON.stringify(payload)
  const ts = Math.floor(Date.now() / 1000)
  const firma = firmaWebSync(ts, cuerpo, secreto)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Seven-Timestamp': String(ts),
        'X-Seven-Signature': `sha256=${firma}`,
      },
      body: cuerpo,
      signal: controller.signal,
    })
    if (!res.ok) {
      // 400 (payload inválido), 404 (matrícula que la web no tiene) y 409 no
      // son transitorios: reintentarlos llena la bandeja de basura permanente.
      //
      // El 409 merece explicación, porque el contrato lo usa para dos cosas.
      // Una es "petición repetida", que aquí no puede pasar: cada envío sella
      // un ts nuevo en la cabecera, así que la firma —que es el número de
      // serie del otro lado— cambia en cada reintento. Luego un 409 solo puede
      // significar la otra: matrícula ambigua, dos coches con la misma placa en
      // la web. Eso no se arregla reintentando, se arregla a mano.
      const permanente =
        res.status === 400 || res.status === 404 || res.status === 409
      return {
        ok: false,
        status: res.status,
        error: `web sync returned ${res.status}`,
        permanente,
      }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? String(err) }
  } finally {
    clearTimeout(timeout)
  }
}

/** Matrícula actual del vehículo (la columna admite NULL). */
async function matriculaDeVehiculo(vehiculoId: number): Promise<string | null> {
  try {
    const res = await pool.query<{ matricula: string | null }>(
      'SELECT matricula FROM "Vehiculo" WHERE id = $1',
      [vehiculoId]
    )
    return res.rows[0]?.matricula ?? null
  } catch (err) {
    console.error('[webSync] lookup matrícula:', (err as Error)?.message ?? err)
    return null
  }
}

/**
 * Avisa a la web del nuevo estado de un vehículo. Best-effort: nunca lanza.
 * No-op silencioso (con motivo para logs) si falta configuración, si el estado
 * no se sincroniza o si el coche no tiene matrícula.
 *
 * @param matricula matrícula ya conocida por el llamante; si no se pasa se lee de la DB.
 */
export async function notifyWebVehiculoEstado(
  vehiculoId: number,
  estado: string | null | undefined,
  matricula?: string | null
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const est = estadoWeb(estado)
    if (!est) return { sent: false, reason: 'estado no sincronizable' }

    if (!process.env.SEVEN_WEB_SYNC_URL || !process.env.SEVEN_WEB_SYNC_SECRET) {
      return { sent: false, reason: 'SEVEN_WEB_SYNC_URL/SECRET no configuradas' }
    }

    const cruda =
      matricula !== undefined
        ? matricula
        : await matriculaDeVehiculo(vehiculoId)
    const plate = normPlate(String(cruda ?? ''))
    if (!plate) return { sent: false, reason: 'vehículo sin matrícula' }

    // Un coche puede cambiar de matrícula (provisional → definitiva) y la web
    // puede tener publicada todavía la vieja: si mandásemos solo la actual, el
    // receptor devolvería 404 y la ficha se quedaría con el estado obsoleto.
    let matriculas = [plate]
    try {
      const alias = await aliasDeMatricula(pool, plate)
      if (alias.length) matriculas = alias
    } catch (err) {
      console.error('[webSync] alias matrícula:', (err as Error)?.message ?? err)
    }

    const payload: WebEstadoPayload = {
      matricula: plate,
      matriculas,
      estado: est,
      ts: Math.floor(Date.now() / 1000),
    }

    // Fila ANTES del POST: ningún cambio de estado sin rastro, aunque el
    // proceso muera en mitad del fetch. `numero_factura` se reusa como
    // referencia humana de la fila (acá, la matrícula); ver retry/route.ts.
    const outboxId = await insertOutboxPending('web_estado', payload, plate)
    const result = await postWebEstado(payload)

    if (result.ok) {
      if (outboxId) await markOutboxEnviado(outboxId)
      return { sent: true }
    }

    console.error(
      `[webSync] aviso fallido para ${plate} (${est}):`,
      result.error
    )
    if (outboxId) {
      const motivo = result.error ?? 'unknown error'
      // 5xx / timeout / 429 quedan 'pendiente' para el reintento; 400 y 404 se
      // agotan de golpe (no se arreglan solos).
      if (result.permanente) await markOutboxAgotado(outboxId, motivo)
      else await markOutboxFallo(outboxId, motivo)
    }
    return { sent: false, reason: result.error }
  } catch (err) {
    const reason = (err as Error)?.message ?? String(err)
    console.error('[webSync] error inesperado:', reason)
    return { sent: false, reason }
  }
}
