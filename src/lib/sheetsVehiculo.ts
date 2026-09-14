/**
 * Upsert de vehículos en las hojas COMPRAS, Ventas-Sevencars y Base_Datos
 * (ficha comercial): el CRM es la fuente y mantiene al día TODAS las columnas
 * mapeadas (sheetsVehiculoMapeo.ts) de la fila del vehículo, localizada por
 * referencia canónica en la columna A.
 *
 *  - Base_Datos/Datos: se lee sin formato + máscara de fórmulas; las celdas
 *    con fórmula son del dueño de la hoja y nunca se pisan; la columna A de
 *    una fila existente no se reescribe; una fila nueva hereda las fórmulas
 *    (y el formato) de la fila anterior.
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
 * Apagado por defecto: se activa con SHEETS_VEHICULO_ENABLED=1
 * (SHEETS_VEHICULO_DISABLED=1 apaga aunque esté activado).
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
import { normalizarEstado, normalizarTipo } from '@/lib/vehiculoEstado'
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
  formulasParaFilaNueva,
  indiceReferencia,
  letraColumna,
  planUpsert,
  recortarFilasDatos,
  refDeCelda,
  referenciaCanonica,
  tipoDePestana,
  valorUserEntered,
  valoresEsperados,
  type Celda,
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
  | 'ficha'

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
  /** Pestañas sin fila de un vehículo VENDIDO: no se reinsertan (ya salieron de la pestaña). */
  omitidasVendido: ClavePestana[]
}

export interface PestanaLeida {
  headers: string[]
  filas: Celda[][]
  /** Sólo Base_Datos: true donde la celda es una fórmula. */
  formulas?: boolean[][]
}
export type CacheLectura = Map<ClavePestana, PestanaLeida>

const TIMEOUT_MS = 20_000

export function sheetsVehiculoDeshabilitado(): boolean {
  if (process.env.SHEETS_VEHICULO_DISABLED === '1') return true
  return process.env.SHEETS_VEHICULO_ENABLED !== '1'
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
            v."porteSolicitado", v.recibido, v."recibidoTexto", v."recibidoFecha", v."createdAt",
            v."precioPublicacion",
            f.regimen AS ficha_regimen, f.nombre_comercial AS ficha_nombre_comercial,
            f.url_imagen AS ficha_url_imagen, f.url_qr AS ficha_url_qr,
            f.mantenimientos AS ficha_mantenimientos,
            f.tarifa_financiacion AS ficha_tarifa_financiacion, f.garantia AS ficha_garantia,
            f.gp AS ficha_gp, f.pct_dto AS ficha_pct_dto,
            f.meses_garantia_fabrica AS ficha_meses_garantia_fabrica,
            f.motor_cv AS ficha_motor_cv, f.cubicaje AS ficha_cubicaje,
            f.caja AS ficha_caja, f.combustible AS ficha_combustible,
            d."importeTotal" AS deal_importe,
            TRIM(CONCAT_WS(' ', c.nombre, c.apellidos)) AS deal_cliente
       FROM "Vehiculo" v
       LEFT JOIN vehiculo_ficha_comercial f ON f.vehiculo_id = v.id
       LEFT JOIN LATERAL (
         SELECT dd."importeTotal", dd."clienteId"
           FROM "Deal" dd
          WHERE dd."vehiculoId" = v.id
            AND LOWER(TRIM(dd.estado)) IN ('vendido', 'facturado')
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

  const { deal_importe, deal_cliente, ...resto } = row
  const vehiculo: Record<string, unknown> = {}
  const ficha: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(resto)) {
    if (k.startsWith('ficha_')) ficha[k.slice(6)] = v
    else vehiculo[k] = v
  }
  const hayFicha = Object.values(ficha).some((v) => v != null)
  return {
    vehiculo: vehiculo as unknown as CtxVehiculoSheets['vehiculo'],
    pasos,
    deposito,
    ficha: hayFicha ? (ficha as CtxVehiculoSheets['ficha']) : null,
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
  const spreadsheetId = spreadsheetIdDe(hoja)
  const range = `'${pestana}'!A:AZ`
  if (hoja !== 'BASE_DATOS') {
    const res = await retryWithBackoff(() =>
      sheets.spreadsheets.values.get({ spreadsheetId, range })
    )
    const rows = (res.data.values ?? []) as string[][]
    const headers = (rows[0] ?? []).map((h) => String(h ?? ''))
    return { headers, filas: rows.slice(1) }
  }
  // Base_Datos: números sin formato ("12.485 €" → 12485), fechas como texto
  // según el formato de la celda ("1/01/2020"), y máscara de fórmulas.
  const res = await retryWithBackoff(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    })
  )
  const rows = (res.data.values ?? []) as Celda[][]
  const headers = (rows[0] ?? []).map((h) => String(h ?? ''))
  const filas = recortarFilasDatos(rows.slice(1))
  const resF = await retryWithBackoff(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: 'FORMULA',
    })
  )
  const rowsF = (resF.data.values ?? []) as unknown[][]
  const formulas = filas.map((_, i) =>
    (rowsF[i + 1] ?? []).map((c) => typeof c === 'string' && c.startsWith('='))
  )
  return { headers, filas, formulas }
}

/** Base_Datos tiene columnas tipadas (fecha, moneda): se escribe interpretado. */
function valueInputDe(hoja: Hoja): 'RAW' | 'USER_ENTERED' {
  return hoja === 'BASE_DATOS' ? 'USER_ENTERED' : 'RAW'
}
function valorParaHoja(hoja: Hoja, v: ValorCelda): ValorCelda {
  return hoja === 'BASE_DATOS' ? valorUserEntered(v) : v
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

/**
 * Pestañas (hoja, pestaña) donde vive un vehículo según su tipo. Base_Datos
 * (ficha comercial) sólo para C/I/D; los VENDIDO con fila conservan sólo las
 * columnas de identidad (valoresEsperados) y sin fila no se reinsertan.
 */
export function pestanasDe(tipo: string | null | undefined): [Hoja, Pestana][] {
  const { ventas, compras } = resolverTipoSheets(tipo)
  const out: [Hoja, Pestana][] = [
    ['VENTAS', ventas as Pestana],
    ['COMPRAS', compras as Pestana],
  ]
  const t = normalizarTipo(tipo)
  if (t === 'C' || t === 'I' || t === 'D') out.push(['BASE_DATOS', 'Datos'])
  return out
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
    omitidasVendido: [],
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
  // Referencias viejas (#I3, MAN-…, pruebas) no se proyectan: crearían filas
  // con una referencia que no existe en el CRM.
  if (refCanon !== String(ctx.vehiculo.referencia ?? '').trim()) {
    return {
      ...vacio,
      ok: false,
      permanente: true,
      error: `vehículo ${vehiculoId} con referencia no canónica: ${ctx.vehiculo.referencia}`,
    }
  }

  const sheets = opts.sheets ?? (await clienteSheets())
  const cache = opts.cache ?? new Map()
  const anioRef = anioReferencia(ctx.vehiculo)
  const errores: string[] = []
  const out: ResultadoUpsert = {
    ...vacio,
    detalle: [],
    faltantes: [],
    omitidasVendido: [],
  }
  const vendido = normalizarEstado(ctx.vehiculo.estado) === 'VENDIDO'

  for (const [hoja, pestana] of pestanasDe(ctx.vehiculo.tipo)) {
    const clave = `${hoja}/${pestana}` as ClavePestana
    try {
      const leida = await leerConCache(sheets, cache, hoja, pestana)
      const { headers, filas } = leida
      const refIdx = indiceReferencia(headers)
      const esperados = valoresEsperados(clave, headers, ctx)
      const i = encontrarFila(filas, refIdx, refCanon, tipoDePestana(pestana))
      const plan = planUpsert(
        headers,
        i >= 0 ? filas[i] : null,
        esperados,
        anioRef,
        i >= 0 ? leida.formulas?.[i] : undefined
      )

      if (plan.append) {
        // Los vendidos los mueven a mano a "Vendidos": sin fila no se reinsertan.
        if (vendido) {
          out.omitidasVendido.push(clave)
          continue
        }
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
              valueInputOption: valueInputDe(hoja),
              insertDataOption: 'INSERT_ROWS',
              requestBody: {
                values: [fila.map((v) => valorParaHoja(hoja, v))],
              },
            })
          )
          const esperadaFila = filas.length + 2
          const filaNum = res.data.updates?.updatedRange?.match(/!A?(\d+)/)?.[1]
          let colsFormula: number[] = []
          if (filaNum) {
            for (const c of escritas) c.celda = c.celda.replace('?', filaNum)
            if (hoja === 'BASE_DATOS') {
              colsFormula = await heredarFilaAnterior(
                sheets,
                hoja,
                pestana,
                parseInt(filaNum, 10),
                headers
              )
            } else {
              await formatearFilaBlanca(
                sheets,
                hoja,
                pestana,
                parseInt(filaNum, 10),
                fila.length
              )
            }
          }
          if (filaNum && parseInt(filaNum, 10) === esperadaFila) {
            filas.push(fila.map((v) => String(v)))
            if (leida.formulas) {
              const mask: boolean[] = new Array(headers.length).fill(false)
              for (const c of colsFormula) mask[c] = true
              leida.formulas.push(mask)
            }
          } else {
            // Sheets insertó la fila en otro sitio (hueco en la tabla): los
            // índices cacheados ya no valen, se relee la pestaña la próxima vez.
            console.warn(
              `[sheetsVehiculo] ${clave}: append en fila ${filaNum ?? '?'} (esperada ${esperadaFila}); caché invalidada`
            )
            cache.delete(clave)
          }
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
              valueInputOption: valueInputDe(hoja),
              data: escritas.map((c) => ({
                range: `'${pestana}'!${c.celda}`,
                values: [[valorParaHoja(hoja, c.nuevo)]],
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

/**
 * Base_Datos: la fila nueva hereda las fórmulas (desplazadas) y el formato de
 * la fila anterior, para que calcule igual que el resto; una fórmula heredada
 * pisa el valor literal recién escrito (la celda pasa a ser de la hoja).
 * Best-effort. Devuelve las columnas que quedaron con fórmula.
 */
async function heredarFilaAnterior(
  sheets: sheets_v4.Sheets,
  hoja: Hoja,
  pestana: Pestana,
  filaNum: number,
  headers: string[]
): Promise<number[]> {
  const previa = filaNum - 1
  if (previa < 2) return []
  const spreadsheetId = spreadsheetIdDe(hoja)
  let cols: number[] = []
  try {
    const res = await retryWithBackoff(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${pestana}'!A${previa}:AZ${previa}`,
        valueRenderOption: 'FORMULA',
      })
    )
    const formulas = formulasParaFilaNueva(
      (res.data.values?.[0] ?? []) as unknown[],
      previa,
      filaNum,
      headers
    )
    if (formulas.length) {
      await retryWithBackoff(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: formulas.map((f) => ({
              range: `'${pestana}'!${letraColumna(f.col)}${filaNum}`,
              values: [[f.formula]],
            })),
          },
        })
      )
      cols = formulas.map((f) => f.col)
    }
    const sheetId = await getSheetId(spreadsheetId, pestana)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            copyPaste: {
              source: {
                sheetId,
                startRowIndex: previa - 1,
                endRowIndex: previa,
                startColumnIndex: 0,
                endColumnIndex: headers.length,
              },
              destination: {
                sheetId,
                startRowIndex: filaNum - 1,
                endRowIndex: filaNum,
                startColumnIndex: 0,
                endColumnIndex: headers.length,
              },
              pasteType: 'PASTE_FORMAT',
              pasteOrientation: 'NORMAL',
            },
          },
        ],
      },
    })
  } catch (err) {
    console.error(
      '[sheetsVehiculo] heredar fila anterior:',
      (err as Error)?.message ?? err
    )
  }
  return cols
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

/**
 * Reserva la fila del outbox antes de procesarla ('pendiente' → 'procesando').
 * Falla (false) si ya la tomó otro proceso, o si hay otro job del MISMO
 * vehículo en curso (< 2 min): dos upserts concurrentes leerían "sin fila"
 * los dos y harían doble append. Un 'procesando' de más de 10 min se
 * considera muerto y se puede volver a reservar.
 */
export async function reservarOutboxSheetsVehiculo(
  outboxId: number
): Promise<boolean> {
  try {
    const res = await pool.query<{ id: number }>(
      `UPDATE webhook_outbox o
          SET estado = 'procesando', updated_at = NOW()
        WHERE o.id = $1
          AND (o.estado = 'pendiente'
               OR (o.estado = 'procesando'
                   AND o.updated_at < NOW() - INTERVAL '10 minutes'))
          AND NOT EXISTS (
                SELECT 1 FROM webhook_outbox x
                 WHERE x.tipo = $2 AND x.estado = 'procesando' AND x.id <> o.id
                   AND x.payload->>'vehiculoId' = o.payload->>'vehiculoId'
                   AND x.updated_at > NOW() - INTERVAL '2 minutes')
        RETURNING o.id`,
      [outboxId, SHEETS_VEHICULO_TIPO_OUTBOX]
    )
    return !!res.rows[0]
  } catch (err) {
    console.error(
      '[sheetsVehiculo] reservar outbox:',
      (err as Error)?.message ?? err
    )
    return false
  }
}

export async function procesarOutboxSheetsVehiculo(
  outboxId: number,
  payload: SheetsVehiculoPayload
): Promise<void> {
  try {
    // Sin reserva no se procesa: lo hará el retry/cron cuando quede libre.
    if (!(await reservarOutboxSheetsVehiculo(outboxId))) return
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
            omitidasVendido: [],
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

/**
 * Reenvío desde /api/admin/webhook-outbox/retry (mismo contrato que el resto).
 * Si se pasa `outboxId`, primero reserva la fila; si no se puede (otro job del
 * vehículo en curso) devuelve `skip: true` y el retry no la marca como fallo.
 */
export async function reenviarSheetsVehiculo(
  payload: SheetsVehiculoPayload,
  outboxId?: number
): Promise<{
  ok: boolean
  error?: string
  permanente?: boolean
  skip?: boolean
}> {
  const id = Number(payload?.vehiculoId)
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: 'payload sin vehiculoId', permanente: true }
  }
  if (outboxId != null && !(await reservarOutboxSheetsVehiculo(outboxId))) {
    return { ok: false, error: 'en curso', skip: true }
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
 * Encola el upsert del vehículo. Dedupe: si ya hay una fila 'pendiente' (aún
 * no reservada) para el mismo vehículo, no se encola otra: cuando se ejecute
 * releerá la DB y escribirá el estado más reciente. Una fila 'procesando' NO
 * deduplica (puede haber leído la DB antes de este cambio). Nunca lanza.
 */
export async function encolarSheetsVehiculo(
  vehiculoId: number,
  motivo: MotivoSheets
): Promise<{ encolado: boolean; outboxId?: number; reason?: string }> {
  try {
    if (sheetsVehiculoDeshabilitado()) {
      return { encolado: false, reason: 'SHEETS_VEHICULO_ENABLED!=1' }
    }
    const pendiente = await pool.query<{ id: number }>(
      `SELECT id FROM webhook_outbox
        WHERE tipo = $1 AND estado = 'pendiente'
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

// ---------------------------------------------------------------------------
// Comprobación / reparación global (cron diario y endpoint admin)
// ---------------------------------------------------------------------------

export const CLAVES_PESTANA: ClavePestana[] = [
  'VENTAS/Expo',
  'VENTAS/Deposito',
  'VENTAS/R',
  'COMPRAS/Compras',
  'COMPRAS/Deposito',
  'COMPRAS/R',
  'BASE_DATOS/Datos',
]

export interface DiferenciaCheck {
  referencia: string
  celda: string
  columna: string
  anterior: string
  nuevo: ValorCelda
}

export interface ResumenPestana {
  filas: number
  /** Referencias de vehículos sin fila en la pestaña (append hecho o pendiente). */
  faltantes: string[]
  /** Vehículos VENDIDO sin fila: sólo informe, nunca se reinsertan. */
  faltantesVendidos: string[]
  diferencias: DiferenciaCheck[]
  /** Referencias de la hoja sin vehículo en el CRM (sólo informe). */
  huerfanas: string[]
}

export interface ResumenCheck {
  dryRun: boolean
  porPestana: Record<ClavePestana, ResumenPestana>
  vehiculos: number
  escritas: number
  appends: number
  /** Total real de diferencias (la lista por pestaña se recorta a MAX_DIFERENCIAS). */
  diferenciasTotal: number
  /** Vehículos sin referencia interpretable (no se sincronizan; no es error). */
  sinReferencia: string[]
  errores: string[]
}

const MAX_DIFERENCIAS = 500
const ESPERA_LECTURA_MS = 300
const ESPERA_ESCRITURA_MS = 150
const MAX_429_SEGUIDOS = 3

const dormir = (ms: number) =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve()

function resumenVacio(dryRun: boolean): ResumenCheck {
  const porPestana = {} as Record<ClavePestana, ResumenPestana>
  for (const k of CLAVES_PESTANA)
    porPestana[k] = {
      filas: 0,
      faltantes: [],
      faltantesVendidos: [],
      diferencias: [],
      huerfanas: [],
    }
  return {
    dryRun,
    porPestana,
    vehiculos: 0,
    escritas: 0,
    appends: 0,
    diferenciasTotal: 0,
    sinReferencia: [],
    errores: [],
  }
}

/**
 * Recorre todos los vehículos C/I/D/R, compara su fila esperada con las 7
 * pestañas (leídas UNA vez) y, salvo dryRun, repara las celdas propiedad del
 * CRM con el mismo upsert. Las filas de la hoja sin vehículo se listan como
 * huérfanas (nunca se crean vehículos ni se borran filas). Nunca lanza.
 */
export async function checkSheetsVehiculos(opts: {
  dryRun: boolean
  motivo?: MotivoSheets
  sheets?: sheets_v4.Sheets
  /** Sólo tests: sin esperas entre llamadas. */
  sinEsperas?: boolean
}): Promise<ResumenCheck> {
  const dryRun = !!opts.dryRun
  const motivo = opts.motivo ?? 'cron'
  const out = resumenVacio(dryRun)
  const espera = (ms: number) => (opts.sinEsperas ? undefined : dormir(ms))

  if (!dryRun && sheetsVehiculoDeshabilitado()) {
    out.errores.push('SHEETS_VEHICULO_ENABLED!=1')
    return out
  }

  try {
    const sheets = opts.sheets ?? (await clienteSheets())
    const cache: CacheLectura = new Map()
    for (const clave of CLAVES_PESTANA) {
      const [hoja, pestana] = clave.split('/') as [Hoja, Pestana]
      try {
        cache.set(clave, await leerPestana(sheets, hoja, pestana))
      } catch (err) {
        out.errores.push(
          `lectura ${clave}: ${(err as Error)?.message ?? String(err)}`
        )
        return out
      }
      await espera(ESPERA_LECTURA_MS)
    }
    for (const clave of CLAVES_PESTANA) {
      out.porPestana[clave].filas = cache
        .get(clave)!
        .filas.filter((f) => f.some((c) => String(c ?? '').trim())).length
    }

    const res = await pool.query<{
      id: number
      referencia: string | null
      tipo: string | null
    }>('SELECT id, referencia, tipo FROM "Vehiculo" ORDER BY id')
    const vehiculos = res.rows.filter((v) => {
      const t = normalizarTipo(v.tipo)
      return t === 'C' || t === 'I' || t === 'D' || t === 'R'
    })
    out.vehiculos = vehiculos.length

    // Referencias que el CRM espera en cada pestaña (para detectar huérfanas).
    const esperadasPorPestana = new Map<ClavePestana, Set<string>>()
    for (const k of CLAVES_PESTANA) esperadasPorPestana.set(k, new Set())

    let seguidos429 = 0
    for (const v of vehiculos) {
      const refCanon = referenciaCanonica(v)
      if (refCanon == null) {
        out.sinReferencia.push(`#${v.id}`)
        continue
      }
      for (const [hoja, pestana] of pestanasDe(v.tipo)) {
        esperadasPorPestana
          .get(`${hoja}/${pestana}` as ClavePestana)
          ?.add(refCanon)
      }

      const r = await upsertVehiculoEnHojas(v.id, motivo, {
        dryRun,
        cache,
        sheets,
      })
      out.escritas += r.escritas
      out.appends += r.appends
      for (const clave of r.faltantes)
        out.porPestana[clave].faltantes.push(refCanon)
      for (const clave of r.omitidasVendido)
        out.porPestana[clave].faltantesVendidos.push(refCanon)
      for (const c of r.detalle) {
        out.diferenciasTotal++
        if (out.diferenciasTotal <= MAX_DIFERENCIAS) {
          out.porPestana[
            `${c.hoja}/${c.pestana}` as ClavePestana
          ].diferencias.push({
            referencia: refCanon,
            celda: c.celda,
            columna: c.columna,
            anterior: c.anterior,
            nuevo: c.nuevo,
          })
        }
      }
      if (!r.ok) {
        out.errores.push(`${refCanon} (#${v.id}): ${r.error ?? 'error'}`)
        if (/429|quota/i.test(r.error ?? '')) {
          if (++seguidos429 >= MAX_429_SEGUIDOS) {
            out.errores.push(
              `cuota de Sheets agotada (${seguidos429} fallos seguidos): se detiene`
            )
            break
          }
        }
      } else {
        seguidos429 = 0
      }
      if (!dryRun && r.escritas > 0) await espera(ESPERA_ESCRITURA_MS)
    }

    for (const clave of CLAVES_PESTANA) {
      const [hoja, pestana] = clave.split('/') as [Hoja, Pestana]
      // Un append fuera de sitio invalida la entrada; se relee para las huérfanas.
      const { headers, filas } =
        cache.get(clave) ?? (await leerPestana(sheets, hoja, pestana))
      const refIdx = indiceReferencia(headers)
      const esperadas = esperadasPorPestana.get(clave)!
      const vistas = new Set<string>()
      for (const fila of filas) {
        const ref = refDeCelda(fila?.[refIdx], tipoDePestana(pestana))
        if (!ref || esperadas.has(ref) || vistas.has(ref)) continue
        vistas.add(ref)
        out.porPestana[clave].huerfanas.push(ref)
      }
    }
  } catch (err) {
    out.errores.push((err as Error)?.message ?? String(err))
  }
  return out
}
