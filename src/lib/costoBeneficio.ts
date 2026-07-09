/**
 * Sincronización con la hoja de costo/beneficio (Google Sheets, pestaña "CB 2026").
 *
 * Al emitir una factura de venta, inserta UNA fila del coche en la banda del
 * MES correspondiente (crea la banda si el mes aún no existe). Los subtotales
 * del mes y el resumen lateral usan SUMIFS filtrado por mes, así que insertar
 * filas nunca los rompe.
 *
 * Best-effort: nunca lanza. No-op si faltan credenciales Google o si
 * COSTOBENEFICIO_DISABLED=1. Soporta dryRun (loguea el plan sin escribir).
 *
 * Columnas (A..S): A fecha · B mes(f) · C ref · D coche · E matrícula ·
 *  F régimen · G compra · H porte · I cn+informe(120) · J taller(Mecauto) ·
 *  K chapa(Fergo) · L limpieza(W.Detailing) · M cn+gar+itv · N COSTE(f) ·
 *  O precio · P IVA(f) · Q margen(f) · R %(f) · S detalle
 */

import { google, type sheets_v4 } from 'googleapis'
import { pool } from '@/lib/direct-database'
import { getGoogleSheetsAuth } from '@/lib/googleSheets'
import {
  CN_INFORME,
  MESES,
  MES_FORMULA,
  COSTE_FORMULA,
  IVA_FORMULA,
  MARGEN_FORMULA,
  PCT_FORMULA,
  SUBTOTAL,
  toEsDate,
  monthIndexFromIso,
  regimenFromType,
  computeCompra,
  findDuplicate,
  planInsertion,
  normPlate,
  normRef,
  reconcileCostCells,
  type CbCosts,
} from '@/lib/costoBeneficioSheet'

const COSTOBENEFICIO_SPREADSHEET_ID_DEFAULT = '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'
const COSTOBENEFICIO_SHEET_NAME_DEFAULT = 'CB 2026'
const NUM_COLS = 19 // A..S

export interface CostoBeneficioOptions {
  dealId: number
  numeroFactura: string
  invoiceType: string // 'VAT' | 'REBU'
  invoiceDate: string // YYYY-MM-DD
  salePrice: number
  dryRun?: boolean
  sheetName?: string // fuerza la pestaña destino (repair); si no, usa env/default
}
export interface CostoBeneficioResult {
  ok: boolean
  action: 'inserted' | 'duplicate' | 'dry-run' | 'skipped' | 'error'
  detail: string
  warnings: string[]
  plan?: Record<string, unknown>
}
interface VehicleCostData {
  referencia: string | null
  marca: string | null
  modelo: string | null
  matricula: string | null
  precioCompra: number | null
  gastosTransporte: number | null
  gastosMecanica: number | null
  gastosPintura: number | null
  gastosLimpieza: number | null
  gastosOtros: number | null // ITV/garantía → columna M de CB
}

function log(msg: string) { console.log(`[costoBeneficio] ${msg}`) }

async function loadVehicleCosts(dealId: number): Promise<VehicleCostData | null> {
  const res = await pool.query(
    `SELECT v.referencia, v.marca, v.modelo, v.matricula,
            v."precioCompra", v."gastosTransporte", v."gastosMecanica",
            v."gastosPintura", v."gastosLimpieza", v."gastosOtros"
       FROM "Deal" d JOIN "Vehiculo" v ON v.id = d."vehiculoId" WHERE d.id = $1`,
    [dealId]
  )
  const r = res.rows[0]
  if (!r) return null
  const num = (x: unknown) => (x != null ? Number(x) : null)
  return {
    referencia: r.referencia ?? null, marca: r.marca ?? null, modelo: r.modelo ?? null, matricula: r.matricula ?? null,
    precioCompra: num(r.precioCompra), gastosTransporte: num(r.gastosTransporte),
    gastosMecanica: num(r.gastosMecanica), gastosPintura: num(r.gastosPintura), gastosLimpieza: num(r.gastosLimpieza),
    gastosOtros: num(r.gastosOtros),
  }
}

/**
 * Valores de la fila del coche (A..S), fórmulas con locale es_ES.
 * COSTE (N) = SUM(G:M). El porte va SOLO dentro de G (compra = precioCompra +
 * porte); H se deja en blanco a propósito para no contar el porte dos veces
 * (bug histórico corregido). M = gastosOtros (ITV/garantía) para que llegue a CB.
 */
export function buildCarRow(v: VehicleCostData, opts: CostoBeneficioOptions, r: number, regimen: string, compra: number | null): (string | number)[] {
  const b = ''
  return [
    toEsDate(opts.invoiceDate), MES_FORMULA(r), v.referencia ?? b, [v.marca, v.modelo].filter(Boolean).join(' ') || b,
    v.matricula ?? b, regimen, compra ?? b, b, CN_INFORME,
    v.gastosMecanica ?? b, v.gastosPintura ?? b, v.gastosLimpieza ?? b, v.gastosOtros ?? b,
    COSTE_FORMULA(r), opts.salePrice, IVA_FORMULA(r), MARGEN_FORMULA(r), PCT_FORMULA(r), b,
  ]
}

interface Ctx { api: sheets_v4.Sheets; spreadsheetId: string; sheetId: number; sheetTitle: string; rows: string[][] }
async function openTab(sheetName?: string): Promise<Ctx | { error: string }> {
  const auth = await getGoogleSheetsAuth()
  const api = google.sheets({ version: 'v4', auth })
  const spreadsheetId = process.env.COSTOBENEFICIO_SPREADSHEET_ID || COSTOBENEFICIO_SPREADSHEET_ID_DEFAULT
  const wanted = sheetName || process.env.COSTOBENEFICIO_SHEET_NAME || COSTOBENEFICIO_SHEET_NAME_DEFAULT
  const meta = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title))' })
  const tab = (meta.data.sheets ?? []).find((s) => s.properties?.title === wanted)
  if (!tab?.properties?.title || tab.properties.sheetId == null) {
    const names = (meta.data.sheets ?? []).map((s) => `"${s.properties?.title}"`).join(', ')
    return { error: `pestaña "${wanted}" no encontrada. Pestañas: ${names}.` }
  }
  const vr = await api.spreadsheets.values.get({ spreadsheetId, range: `${tab.properties.title}!A1:S`, valueRenderOption: 'FORMATTED_VALUE' })
  return { api, spreadsheetId, sheetId: tab.properties.sheetId, sheetTitle: tab.properties.title, rows: (vr.data.values ?? []) as string[][] }
}

export async function syncCostoBeneficio(opts: CostoBeneficioOptions): Promise<CostoBeneficioResult> {
  const warnings: string[] = []
  try {
    if (process.env.COSTOBENEFICIO_DISABLED === '1') return { ok: true, action: 'skipped', detail: 'COSTOBENEFICIO_DISABLED=1', warnings }
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      log('sin credenciales Google — skip'); return { ok: true, action: 'skipped', detail: 'faltan credenciales Google', warnings }
    }
    const v = await loadVehicleCosts(opts.dealId)
    if (!v) return { ok: false, action: 'error', detail: `Deal ${opts.dealId} sin vehículo`, warnings }
    if (!v.referencia) warnings.push('sin referencia')
    if (!v.matricula) warnings.push('sin matrícula')
    const compra = computeCompra(v.precioCompra, v.gastosTransporte)
    if (v.precioCompra == null) warnings.push('precioCompra vacío en CRM')
    if (v.gastosMecanica == null) warnings.push('taller (gastosMecanica) vacío')
    if (v.gastosPintura == null) warnings.push('chapa (gastosPintura) vacío')
    if (v.gastosLimpieza == null) warnings.push('limpieza (gastosLimpieza) vacío')

    const mesIdx = monthIndexFromIso(opts.invoiceDate)
    if (mesIdx < 0) return { ok: false, action: 'error', detail: `fecha inválida: ${opts.invoiceDate}`, warnings }
    const mes = MESES[mesIdx]
    const regimen = regimenFromType(opts.invoiceType)

    const ctx = await openTab(opts.sheetName)
    if ('error' in ctx) { log(ctx.error); return { ok: false, action: 'error', detail: ctx.error, warnings } }
    const { api, spreadsheetId, sheetId, sheetTitle, rows } = ctx

    // dedup (col C ref / col E matrícula) en toda la hoja
    const dup = findDuplicate(rows, v.matricula, v.referencia)
    if (dup) {
      const col = dup.kind === 'plate' ? 'matrícula E' : 'referencia C'
      return { ok: true, action: 'duplicate', detail: `ya existe (${col}${dup.row})`, warnings }
    }

    // ubicar banda del mes y fila destino (1-based)
    const { bandRow, targetRow, createBand } = planInsertion(rows, mes)
    const requests: sheets_v4.Schema$Request[] = []

    if (!createBand) {
      requests.push({ insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: targetRow - 1, endIndex: targetRow }, inheritFromBefore: true } })
    } else {
      const subRow = bandRow + 2
      // insertar 3 filas (banda, coche, subtotal)
      requests.push({ insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: bandRow - 1, endIndex: bandRow - 1 + 3 }, inheritFromBefore: false } })
      // formato banda (merge + color) y subtotal
      requests.push({ mergeCells: { range: { sheetId, startRowIndex: bandRow - 1, endRowIndex: bandRow, startColumnIndex: 0, endColumnIndex: NUM_COLS }, mergeType: 'MERGE_ROWS' } })
      requests.push({ repeatCell: { range: { sheetId, startRowIndex: bandRow - 1, endRowIndex: bandRow, startColumnIndex: 0, endColumnIndex: NUM_COLS }, cell: { userEnteredFormat: { backgroundColor: { red: .18, green: .46, blue: .71 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11 }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } })
      requests.push({ repeatCell: { range: { sheetId, startRowIndex: subRow - 1, endRowIndex: subRow, startColumnIndex: 0, endColumnIndex: NUM_COLS }, cell: { userEnteredFormat: { backgroundColor: { red: .85, green: .89, blue: .95 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } })
    }

    const carRow = buildCarRow(v, opts, targetRow, regimen, compra)
    const plan = {
      dealId: opts.dealId, numeroFactura: opts.numeroFactura, sheet: `${sheetTitle} (gid=${sheetId})`, mes,
      filaDestino: targetRow, bandaNueva: createBand,
      valores: { A_fecha: toEsDate(opts.invoiceDate), C_ref: v.referencia, D_coche: [v.marca, v.modelo].filter(Boolean).join(' '), E_matricula: v.matricula, F_regimen: regimen, G_compra: compra, 'desglose(compra+porte)': { precioCompra: v.precioCompra, transporte: v.gastosTransporte }, I_cn: CN_INFORME, J_taller: v.gastosMecanica, K_chapa: v.gastosPintura, L_limpieza: v.gastosLimpieza, O_precio: opts.salePrice },
      dedup: 'no existe',
    }
    if (opts.dryRun) { log(`DRY-RUN → ${JSON.stringify(plan, null, 2)}`); return { ok: true, action: 'dry-run', detail: `insertaría fila ${targetRow} (${mes}) en "${sheetTitle}"${createBand ? ' [crea banda]' : ''}`, warnings, plan } }

    // 1) estructura (insertar filas + formato de banda/subtotal si aplica)
    await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
    // 2) valores (USER_ENTERED interpreta fórmulas es_ES y la fecha dd/mm/yyyy)
    const data: sheets_v4.Schema$ValueRange[] = [{ range: `${sheetTitle}!A${targetRow}:S${targetRow}`, values: [carRow] }]
    if (createBand) {
      data.push({ range: `${sheetTitle}!A${bandRow}`, values: [[mes]] })
      data.push({ range: `${sheetTitle}!D${targetRow + 1}:R${targetRow + 1}`, values: [[`TOTAL ${mes}`, '', '', '', '', '', '', '', '', '', SUBTOTAL('N', mes), SUBTOTAL('O', mes), SUBTOTAL('P', mes), SUBTOTAL('Q', mes)]] })
    }
    await api.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'USER_ENTERED', data } })
    // 3) heredar formato numérico de una fila de coche previa (si existe)
    if (!createBand && targetRow > 2) {
      await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ copyPaste: { source: { sheetId, startRowIndex: targetRow - 2, endRowIndex: targetRow - 1, startColumnIndex: 0, endColumnIndex: NUM_COLS }, destination: { sheetId, startRowIndex: targetRow - 1, endRowIndex: targetRow, startColumnIndex: 0, endColumnIndex: NUM_COLS }, pasteType: 'PASTE_FORMAT' } }] } })
    }

    log(`fila ${targetRow} (${mes}) en "${sheetTitle}": ${v.referencia ?? '?'} / ${v.matricula ?? '?'} / ${opts.salePrice}${createBand ? ' [banda nueva]' : ''}${warnings.length ? ` | avisos: ${warnings.join(' | ')}` : ''}`)
    return { ok: true, action: 'inserted', detail: `fila ${targetRow} (${mes}) en "${sheetTitle}"`, warnings, plan }
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err)
    log(`ERROR: ${msg}`)
    return { ok: false, action: 'error', detail: msg, warnings }
  }
}

/** Hook post-emisión: nunca lanza ni bloquea la emisión. Timeout 20 s. SIEMPRE loguea en costobeneficio_logs. */
export async function notifyCostoBeneficio(opts: CostoBeneficioOptions): Promise<void> {
  const startTime = Date.now()
  let result: CostoBeneficioResult = { ok: false, action: 'error', detail: 'no result', warnings: [] }

  try {
    result = await Promise.race([
      syncCostoBeneficio(opts),
      new Promise<CostoBeneficioResult>((resolve) => setTimeout(() => resolve({ ok: false, action: 'error', detail: 'timeout 20s', warnings: [] }), 20_000)),
    ])
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err)
    console.error('[costoBeneficio] hook failed:', msg)
    result = { ok: false, action: 'error', detail: msg, warnings: [] }
  } finally {
    // SIEMPRE loguear el resultado (éxito/error) en la tabla de audit
    const executionTime = Date.now() - startTime
    try {
      await pool.query(
        `INSERT INTO costobeneficio_logs
          (deal_id, invoice_number, invoice_date, invoice_type, sale_price,
           success, action, detail, warnings, error_message, execution_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          opts.dealId,
          opts.numeroFactura,
          opts.invoiceDate,
          opts.invoiceType,
          opts.salePrice,
          result.ok,
          result.action,
          result.detail,
          result.warnings.length > 0 ? result.warnings : null,
          result.ok ? null : result.detail,
          executionTime,
        ]
      )
    } catch (logErr) {
      // Si falla el logging, solo logueamos a console (no bloqueamos)
      console.error('[costoBeneficio] failed to log:', (logErr as Error)?.message ?? logErr)
    }
  }
}

/**
 * Refleja en la fila de CB del coche los costos ACTUALES del CRM (overwrite:
 * corrige valores distintos y limpia H). Best-effort: nunca lanza. Pensado para
 * dispararse tras cargar un costo (POST /vehiculos/gasto) para que un costo
 * tardío llegue solo a la hoja, sin esperar una emisión. No-op si el coche aún
 * no tiene fila en CB (todavía no se emitió su factura de venta).
 */
export async function resyncVehiculoRowToCB(vehiculoId: number, sheetName?: string): Promise<CostoBeneficioResult> {
  const warnings: string[] = []
  try {
    if (process.env.COSTOBENEFICIO_DISABLED === '1') return { ok: true, action: 'skipped', detail: 'COSTOBENEFICIO_DISABLED=1', warnings }
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) return { ok: true, action: 'skipped', detail: 'faltan credenciales Google', warnings }

    const res = await pool.query(
      `SELECT referencia, matricula, "precioCompra", "gastosTransporte",
              "gastosMecanica", "gastosPintura", "gastosLimpieza", "gastosOtros"
         FROM "Vehiculo" WHERE id = $1`,
      [vehiculoId]
    )
    const r = res.rows[0]
    if (!r) return { ok: false, action: 'error', detail: `Vehiculo ${vehiculoId} no existe`, warnings }
    const num = (x: unknown) => (x != null ? Number(x) : null)
    const costs: CbCosts = {
      precioCompra: num(r.precioCompra), gastosTransporte: num(r.gastosTransporte),
      gastosMecanica: num(r.gastosMecanica), gastosPintura: num(r.gastosPintura),
      gastosLimpieza: num(r.gastosLimpieza), gastosOtros: num(r.gastosOtros),
    }

    const ctx = await openTab(sheetName)
    if ('error' in ctx) return { ok: false, action: 'error', detail: ctx.error, warnings }
    const { api, spreadsheetId, sheetTitle, rows } = ctx

    const plate = r.matricula ? normPlate(String(r.matricula)) : null
    const ref = r.referencia ? normRef(String(r.referencia)) : null
    let rowNum = 0
    for (let i = 0; i < rows.length; i++) {
      const rp = rows[i]?.[4] ? normPlate(String(rows[i][4])) : null
      const rr = rows[i]?.[2] ? normRef(String(rows[i][2])) : null
      if ((plate && rp && plate === rp) || (ref && rr && ref === rr)) { rowNum = i + 1; break }
    }
    if (!rowNum) return { ok: true, action: 'skipped', detail: 'coche sin fila en CB (aún)', warnings }

    const updates = reconcileCostCells(rows[rowNum - 1] as string[], costs, 'overwrite')
    if (updates.length === 0) return { ok: true, action: 'skipped', detail: 'CB ya coincide', warnings }

    const data = updates.map((u) => ({ range: `${sheetTitle}!${u.col}${rowNum}`, values: [[u.value]] }))
    await api.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'USER_ENTERED', data } })
    log(`resync fila ${rowNum} (${r.matricula}): ${updates.map((u) => `${u.col}=${u.value}`).join(', ')}`)
    return { ok: true, action: 'inserted', detail: `fila ${rowNum}: ${updates.map((u) => u.col).join(',')}`, warnings }
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err)
    log(`resyncVehiculoRowToCB ERROR: ${msg}`)
    return { ok: false, action: 'error', detail: msg, warnings }
  }
}
