/**
 * Upsert de vehículos en las hojas COMPRAS y Ventas-Sevencars: el CRM es la
 * fuente y mantiene al día TODAS las columnas mapeadas (sheetsVehiculoMapeo.ts)
 * de la fila del vehículo, localizada por referencia canónica en la columna A.
 *
 *  - Fila existente → values.batchUpdate SOLO con las celdas que difieren.
 *  - Fila inexistente → values.append de la fila completa.
 *  - Nunca borra ni mueve filas, nunca escribe columnas no mapeadas, nunca
 *    pisa una celda con un valor vacío.
 *  - Cada celda escrita deja fila en sheets_sync_log.
 *
 * Encolado: los disparadores insertan en webhook_outbox (tipo 'sheets_vehiculo')
 * y se procesa en background (after() + timeout 20 s); lo que falle lo
 * reintenta POST /api/admin/webhook-outbox/retry y el cron diario.
 * Kill switch: SHEETS_VEHICULO_DISABLED=1.
 */
import { google, type sheets_v4 } from 'googleapis'
import { after } from 'next/server'
import { pool } from '@/lib/direct-database'
import {
  getGoogleSheetsAuth,
  getSheetId,
  retryWithBackoff,
} from '@/lib/googleSheets'
import { SHEETS_CONFIG, resolverTipoSheets } from '@/lib/sheetsConfig'
import { normalizarTipo } from '@/lib/vehiculoEstado'
import { dateToYMD } from '@/lib/fechas'
import {
  insertOutboxPending,
  markOutboxEnviado,
  markOutboxFallo,
  markOutboxAgotado,
} from '@/lib/webhookOutbox'
import type { PasoVehiculo } from '@/lib/vehiculoPasos'
import {
  anioReferencia,
  encontrarFila,
  filaParaAppend,
  indiceReferencia,
  letraColumna,
  planUpsert,
  referenciaCanonica,
  tipoDePestana,
  valoresEsperados,
  type ClavePestana,
  type CtxVehiculoSheets,
  type Hoja,
  type Pestana,
  type ValorCelda,
} from '@/lib/sheetsVehiculoMapeo'

export const SHEETS_VEHICULO_TIPO_OUTBOX = 'sheets_vehiculo'

export type MotivoSheets =
  | 'create'
  | 'update'
  | 'estado'
  | 'deal'
  | 'kanban'
  | 'deposito'
  | 'cron'
  | 'retry'
  | 'admin'

export interface SheetsVehiculoPayload {
  vehiculoId: number
  motivo: MotivoSheets
}

export interface CeldaEscrita {
  hoja: Hoja
  pestana: Pestana
  celda: string
  columna: string
  anterior: string
  nuevo: ValorCelda
}

export interface ResultadoUpsert {
  ok: boolean
  error?: string
  /** Fallo definitivo (vehículo inexistente): no reintentar. */
  permanente?: boolean
  /** Celdas escritas (o que se escribirían en dryRun), appends incluidos. */
  escritas: number
  appends: number
  detalle: CeldaEscrita[]
  /** Pestañas donde no había fila y se hizo (o haría) append. */
  faltantes: ClavePestana[]
}

export interface PestanaLeida {
  headers: string[]
  filas: string[][]
}
export type CacheLectura = Map<ClavePestana, PestanaLeida>

const TIMEOUT_MS = 20_000

export function sheetsVehiculoDeshabilitado(): boolean {
  return process.env.SHEETS_VEHICULO_DISABLED === '1'
}

export function spreadsheetIdDe(hoja: Hoja): string {
  return SHEETS_CONFIG.SPREADSHEET_IDS[hoja]
}

export async function clienteSheets(): Promise<sheets_v4.Sheets> {
  const auth = await getGoogleSheetsAuth()
  return google.sheets({ version: 'v4', auth })
}

// ---------------------------------------------------------------------------
// Contexto del vehículo (DB)
// ---------------------------------------------------------------------------

export async function cargarCtx(
  vehiculoId: number
): Promise<CtxVehiculoSheets | null> {
  const v = await pool.query(
    `SELECT v.id, v.referencia, v.tipo, v.marca, v.modelo, v.matricula, v.bastidor,
            v.kms, v.estado, v."fechaMatriculacion", v."fechaCompra", v."precioCompra",
            v."gastosTransporte", v."segundaLlave", v.carpeta, v.master, v."hojasA",
            v.documentacion, v.itv, v.seguro, v.proveedor, v.abonado, v.comprobante,
            v."porteSolicitado", v.recibido, v."createdAt",
            d."importeTotal" AS deal_importe,
            TRIM(CONCAT_WS(' ', c.nombre, c.apellidos)) AS deal_cliente
       FROM "Vehiculo" v
       LEFT JOIN LATERAL (
         SELECT dd."importeTotal", dd."clienteId"
           FROM "Deal" dd
          WHERE dd."vehiculoId" = v.id
          ORDER BY (dd.id = v."dealActivoId") DESC, dd.id DESC
          LIMIT 1
       ) d ON TRUE
       LEFT JOIN "Cliente" c ON c.id = d."clienteId"
      WHERE v.id = $1`,
    [vehiculoId]
  )
  const row = v.rows[0]
  if (!row) return null

  const pasosRes = await pool.query(
    `SELECT paso, texto, fecha FROM vehiculo_pasos WHERE vehiculo_id = $1`,
    [vehiculoId]
  )
  const pasos: CtxVehiculoSheets['pasos'] = {}
  for (const p of pasosRes.rows) {
    pasos[p.paso as PasoVehiculo] = {
      texto: p.texto ?? null,
      fecha: dateToYMD(p.fecha),
    }
  }

  let deposito: CtxVehiculoSheets['deposito'] = null
  if (normalizarTipo(row.tipo) === 'D') {
    const dep = await pool.query(
      `SELECT precio_venta FROM depositos
        WHERE vehiculo_id = $1
        ORDER BY (estado = 'ACTIVO') DESC, id DESC
        LIMIT 1`,
      [vehiculoId]
    )
    deposito = dep.rows[0] ? { precio_venta: dep.rows[0].precio_venta } : null
  }

  const { deal_importe, deal_cliente, ...vehiculo } = row
  return {
    vehiculo,
    pasos,
    deposito,
    deal:
      deal_importe != null || deal_cliente
        ? { importeTotal: deal_importe, clienteNombre: deal_cliente || null }
        : null,
  }
}

// ---------------------------------------------------------------------------
// Lectura / escritura de la hoja
// ---------------------------------------------------------------------------

export async function leerPestana(
  sheets: sheets_v4.Sheets,
  hoja: Hoja,
  pestana: Pestana
): Promise<PestanaLeida> {
  const res = await retryWithBackoff(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetIdDe(hoja),
      range: `'${pestana}'!A:AZ`,
    })
  )
  const rows = (res.data.values ?? []) as string[][]
  const headers = (rows[0] ?? []).map((h) => String(h ?? ''))
  return { headers, filas: rows.slice(1) }
}

async function leerConCache(
  sheets: sheets_v4.Sheets,
  cache: CacheLectura,
  hoja: Hoja,
  pestana: Pestana
): Promise<PestanaLeida> {
  const clave = `${hoja}/${pestana}` as ClavePestana
  const hit = cache.get(clave)
  if (hit) return hit
  const leida = await leerPestana(sheets, hoja, pestana)
  cache.set(clave, leida)
  return leida
}

async function registrarLog(
  vehiculoId: number,
  motivo: MotivoSheets,
  celdas: CeldaEscrita[]
): Promise<void> {
  if (!celdas.length) return
  const values: unknown[] = []
  const tuples = celdas.map((c, i) => {
    const b = i * 8
    values.push(
      vehiculoId,
      c.hoja,
      c.pestana,
      c.celda,
      c.columna,
      c.anterior || null,
      String(c.nuevo),
      motivo
    )
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`
  })
  try {
    await pool.query(
      `INSERT INTO sheets_sync_log
         (vehiculo_id, hoja, pestana, celda, columna, valor_anterior, valor_nuevo, motivo)
       VALUES ${tuples.join(',')}`,
      values
    )
  } catch (err) {
    console.error('[sheetsVehiculo] log:', (err as Error)?.message ?? err)
  }
}

/** Pestañas (hoja, pestaña) donde vive un vehículo según su tipo. */
export function pestanasDe(tipo: string | null | undefined): [Hoja, Pestana][] {
  const { ventas, compras } = resolverTipoSheets(tipo)
  return [
    ['VENTAS', ventas as Pestana],
    ['COMPRAS', compras as Pestana],
  ]
}

export interface OpcionesUpsert {
  dryRun?: boolean
  cache?: CacheLectura
  ctx?: CtxVehiculoSheets
  sheets?: sheets_v4.Sheets
}

export async function upsertVehiculoEnHojas(
  vehiculoId: number,
  motivo: MotivoSheets,
  opts: OpcionesUpsert = {}
): Promise<ResultadoUpsert> {
  const dryRun = !!opts.dryRun
  const vacio: ResultadoUpsert = {
    ok: true,
    escritas: 0,
    appends: 0,
    detalle: [],
    faltantes: [],
  }
  if (sheetsVehiculoDeshabilitado() && !dryRun) return vacio

  const ctx = opts.ctx ?? (await cargarCtx(vehiculoId))
  if (!ctx) {
    return {
      ...vacio,
      ok: false,
      permanente: true,
      error: `vehículo ${vehiculoId} inexistente`,
    }
  }
  const refCanon = referenciaCanonica(ctx.vehiculo)
  if (refCanon == null) {
    return {
      ...vacio,
      ok: false,
      permanente: true,
      error: `vehículo ${vehiculoId} sin referencia`,
    }
  }

  const sheets = opts.sheets ?? (await clienteSheets())
  const cache = opts.cache ?? new Map()
  const anioRef = anioReferencia(ctx.vehiculo)
  const errores: string[] = []
  const out: ResultadoUpsert = { ...vacio, detalle: [], faltantes: [] }

  for (const [hoja, pestana] of pestanasDe(ctx.vehiculo.tipo)) {
    const clave = `${hoja}/${pestana}` as ClavePestana
    try {
      const { headers, filas } = await leerConCache(
        sheets,
        cache,
        hoja,
        pestana
      )
      const refIdx = indiceReferencia(headers)
      const esperados = valoresEsperados(clave, headers, ctx)
      const i = encontrarFila(filas, refIdx, refCanon, tipoDePestana(pestana))
      const plan = planUpsert(
        headers,
        i >= 0 ? filas[i] : null,
        esperados,
        anioRef
      )

      if (plan.append) {
        out.faltantes.push(clave)
        const fila = filaParaAppend(headers, esperados)
        const escritas: CeldaEscrita[] = esperados.map((e) => ({
          hoja,
          pestana,
          celda: `${letraColumna(e.col)}?`,
          columna: e.header,
          anterior: '',
          nuevo: e.valor,
        }))
        if (!dryRun) {
          const res = await retryWithBackoff(() =>
            sheets.spreadsheets.values.append({
              spreadsheetId: spreadsheetIdDe(hoja),
              range: `'${pestana}'!A1`,
              valueInputOption: 'RAW',
              insertDataOption: 'INSERT_ROWS',
              requestBody: { values: [fila] },
            })
          )
          const filaNum = res.data.updates?.updatedRange?.match(/!A?(\d+)/)?.[1]
          if (filaNum) {
            for (const c of escritas) c.celda = c.celda.replace('?', filaNum)
            await formatearFilaBlanca(
              sheets,
              hoja,
              pestana,
              parseInt(filaNum, 10),
              fila.length
            )
          }
          filas.push(fila.map((v) => String(v)))
          await registrarLog(vehiculoId, motivo, escritas)
        }
        out.appends++
        out.escritas += escritas.length
        out.detalle.push(...escritas)
        continue
      }

      if (!plan.celdas.length) continue
      const filaNum = i + 2 // 1-based + cabecera
      const escritas: CeldaEscrita[] = plan.celdas.map((c) => ({
        hoja,
        pestana,
        celda: `${c.letra}${filaNum}`,
        columna: c.header,
        anterior: c.anterior,
        nuevo: c.nuevo,
      }))
      if (!dryRun) {
        await retryWithBackoff(() =>
          sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: spreadsheetIdDe(hoja),
            requestBody: {
              valueInputOption: 'RAW',
              data: escritas.map((c) => ({
                range: `'${pestana}'!${c.celda}`,
                values: [[c.nuevo]],
              })),
            },
          })
        )
        for (const c of plan.celdas) filas[i][c.col] = String(c.nuevo)
        await registrarLog(vehiculoId, motivo, escritas)
      }
      out.escritas += escritas.length
      out.detalle.push(...escritas)
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err)
      console.error(`[sheetsVehiculo] ${clave} #${vehiculoId}:`, msg)
      errores.push(`${clave}: ${msg}`)
    }
  }

  if (errores.length) {
    out.ok = false
    out.error = errores.join(' | ')
  }
  return out
}

/** Mismo formato blanco que aplicaba el append antiguo; best-effort. */
async function formatearFilaBlanca(
  sheets: sheets_v4.Sheets,
  hoja: Hoja,
  pestana: Pestana,
  filaNum: number,
  ancho: number
): Promise<void> {
  try {
    const sheetId = await getSheetId(spreadsheetIdDe(hoja), pestana)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetIdDe(hoja),
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: filaNum - 1,
                endRowIndex: filaNum,
                startColumnIndex: 0,
                endColumnIndex: ancho,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 1, green: 1, blue: 1 },
                  textFormat: {
                    foregroundColor: { red: 0, green: 0, blue: 0 },
                  },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
        ],
      },
    })
  } catch (err) {
    console.error(
      '[sheetsVehiculo] formato fila:',
      (err as Error)?.message ?? err
    )
  }
}

// ---------------------------------------------------------------------------
// Cola (webhook_outbox) y procesamiento
// ---------------------------------------------------------------------------

export async function procesarOutboxSheetsVehiculo(
  outboxId: number,
  payload: SheetsVehiculoPayload
): Promise<void> {
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<ResultadoUpsert>((resolve) => {
      timer = setTimeout(
        () =>
          resolve({
            ok: false,
            error: `timeout ${TIMEOUT_MS / 1000}s`,
            escritas: 0,
            appends: 0,
            detalle: [],
            faltantes: [],
          }),
        TIMEOUT_MS
      )
    })
    const result = await Promise.race([
      upsertVehiculoEnHojas(payload.vehiculoId, payload.motivo),
      timeout,
    ]).finally(() => clearTimeout(timer))
    if (result.ok) await markOutboxEnviado(outboxId)
    else if (result.permanente)
      await markOutboxAgotado(outboxId, result.error ?? 'unknown error')
    else await markOutboxFallo(outboxId, result.error ?? 'unknown error')
  } catch (err) {
    await markOutboxFallo(outboxId, (err as Error)?.message ?? String(err))
  }
}

/** Reenvío desde /api/admin/webhook-outbox/retry (mismo contrato que el resto). */
export async function reenviarSheetsVehiculo(
  payload: SheetsVehiculoPayload
): Promise<{ ok: boolean; error?: string; permanente?: boolean }> {
  const id = Number(payload?.vehiculoId)
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: 'payload sin vehiculoId', permanente: true }
  }
  const r = await upsertVehiculoEnHojas(id, 'retry')
  return { ok: r.ok, error: r.error, permanente: r.permanente }
}

function programarEnBackground(fn: () => Promise<void>): void {
  // Dentro de una request de Next, after() mantiene viva la lambda hasta que
  // termine; fuera de una request (scripts, tests) lanza y se cae al fallback.
  try {
    after(fn)
  } catch {
    void fn()
  }
}

/**
 * Encola el upsert del vehículo. Dedupe: si ya hay una fila pendiente sin
 * intentos para el mismo vehículo, no se encola otra (el job relee la DB al
 * ejecutarse, así que ya va a escribir el estado más reciente). Nunca lanza.
 */
export async function encolarSheetsVehiculo(
  vehiculoId: number,
  motivo: MotivoSheets
): Promise<{ encolado: boolean; outboxId?: number; reason?: string }> {
  try {
    if (sheetsVehiculoDeshabilitado()) {
      return { encolado: false, reason: 'SHEETS_VEHICULO_DISABLED=1' }
    }
    const pendiente = await pool.query<{ id: number }>(
      `SELECT id FROM webhook_outbox
        WHERE tipo = $1 AND estado = 'pendiente' AND intentos = 0
          AND payload->>'vehiculoId' = $2
        LIMIT 1`,
      [SHEETS_VEHICULO_TIPO_OUTBOX, String(vehiculoId)]
    )
    if (pendiente.rows[0]) {
      return {
        encolado: false,
        outboxId: pendiente.rows[0].id,
        reason: 'ya pendiente',
      }
    }
    const ref = await pool.query<{ referencia: string | null }>(
      'SELECT referencia FROM "Vehiculo" WHERE id = $1',
      [vehiculoId]
    )
    const payload: SheetsVehiculoPayload = { vehiculoId, motivo }
    const outboxId = await insertOutboxPending(
      SHEETS_VEHICULO_TIPO_OUTBOX,
      payload,
      ref.rows[0]?.referencia ?? String(vehiculoId)
    )
    if (outboxId == null)
      return { encolado: false, reason: 'outbox insert failed' }
    programarEnBackground(() => procesarOutboxSheetsVehiculo(outboxId, payload))
    return { encolado: true, outboxId }
  } catch (err) {
    const reason = (err as Error)?.message ?? String(err)
    console.error('[sheetsVehiculo] encolar:', reason)
    return { encolado: false, reason }
  }
}
