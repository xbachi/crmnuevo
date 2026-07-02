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

const CN_INFORME = 120
const COSTOBENEFICIO_SPREADSHEET_ID_DEFAULT = '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'
const COSTOBENEFICIO_SHEET_NAME_DEFAULT = 'CB 2026'
const NUM_COLS = 19 // A..S
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'] as const

// Locale es_ES: separador de argumentos ';' y decimal ',' (validado en vivo).
const MES_FORMULA = (r: number) =>
  `=IF(A${r}="";"";CHOOSE(MONTH(A${r});"ENERO";"FEBRERO";"MARZO";"ABRIL";"MAYO";"JUNIO";"JULIO";"AGOSTO";"SEPTIEMBRE";"OCTUBRE";"NOVIEMBRE";"DICIEMBRE"))`
const COSTE_FORMULA = (r: number) => `=SUM(G${r}:M${r})`
// IVA sobre el margen (misma convención que la planilla "2026": (precio - coste) * 21%),
// uniforme para iva 21 y rebu.
const IVA_FORMULA = (r: number) => `=IF(O${r}="";"";(O${r}-N${r})*0,21)`
const MARGEN_FORMULA = (r: number) => `=IF(O${r}="";"";O${r}-N${r}-P${r})`
const PCT_FORMULA = (r: number) => `=IF(N${r}=0;"";Q${r}/N${r})`
const SUBTOTAL = (col: string, mes: string) => `=SUMIFS(${col}$2:${col}$400;$B$2:$B$400;"${mes}")`

function toEsDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export interface CostoBeneficioOptions {
  dealId: number
  numeroFactura: string
  invoiceType: string // 'VAT' | 'REBU'
  invoiceDate: string // YYYY-MM-DD
  salePrice: number
  dryRun?: boolean
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
}

function log(msg: string) { console.log(`[costoBeneficio] ${msg}`) }
const normPlate = (s: string) => s.replace(/[\s.\-]/g, '').toUpperCase()
const normRef = (s: string) => s.replace(/[#\s.\-]/g, '').toUpperCase()

async function loadVehicleCosts(dealId: number): Promise<VehicleCostData | null> {
  const res = await pool.query(
    `SELECT v.referencia, v.marca, v.modelo, v.matricula,
            v."precioCompra", v."gastosTransporte", v."gastosMecanica",
            v."gastosPintura", v."gastosLimpieza"
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
  }
}

/** Valores de la fila del coche (A..S), fórmulas con locale es_ES. */
function buildCarRow(v: VehicleCostData, opts: CostoBeneficioOptions, r: number, regimen: string, compra: number | null): (string | number)[] {
  const b = ''
  return [
    toEsDate(opts.invoiceDate), MES_FORMULA(r), v.referencia ?? b, [v.marca, v.modelo].filter(Boolean).join(' ') || b,
    v.matricula ?? b, regimen, compra ?? b, v.gastosTransporte ?? b, CN_INFORME,
    v.gastosMecanica ?? b, v.gastosPintura ?? b, v.gastosLimpieza ?? b, b,
    COSTE_FORMULA(r), opts.salePrice, IVA_FORMULA(r), MARGEN_FORMULA(r), PCT_FORMULA(r), b,
  ]
}

interface Ctx { api: sheets_v4.Sheets; spreadsheetId: string; sheetId: number; sheetTitle: string; rows: string[][] }
async function openTab(): Promise<Ctx | { error: string }> {
  const auth = await getGoogleSheetsAuth()
  const api = google.sheets({ version: 'v4', auth })
  const spreadsheetId = process.env.COSTOBENEFICIO_SPREADSHEET_ID || COSTOBENEFICIO_SPREADSHEET_ID_DEFAULT
  const wanted = process.env.COSTOBENEFICIO_SHEET_NAME || COSTOBENEFICIO_SHEET_NAME_DEFAULT
  const meta = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title))' })
  const tab = (meta.data.sheets ?? []).find((s) => s.properties?.title === wanted)
  if (!tab?.properties?.title || tab.properties.sheetId == null) {
    const names = (meta.data.sheets ?? []).map((s) => `"${s.properties?.title}"`).join(', ')
    return { error: `pestaña "${wanted}" no encontrada. Pestañas: ${names}.` }
  }
  const vr = await api.spreadsheets.values.get({ spreadsheetId, range: `${tab.properties.title}!A1:S`, valueRenderOption: 'FORMATTED_VALUE' })
  return { api, spreadsheetId, sheetId: tab.properties.sheetId, sheetTitle: tab.properties.title, rows: (vr.data.values ?? []) as string[][] }
}

const isBand = (row: string[] | undefined) =>
  !!row && (MESES as readonly string[]).includes(String(row[0] ?? '').trim().toUpperCase())
const isSubtotal = (row: string[] | undefined) => !!row && /^TOTAL\b/i.test(String(row?.[3] ?? '').trim())

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
    const compra = v.precioCompra != null || v.gastosTransporte != null ? (v.precioCompra ?? 0) + (v.gastosTransporte ?? 0) : null
    if (v.precioCompra == null) warnings.push('precioCompra vacío en CRM')
    if (v.gastosMecanica == null) warnings.push('taller (gastosMecanica) vacío')
    if (v.gastosPintura == null) warnings.push('chapa (gastosPintura) vacío')
    if (v.gastosLimpieza == null) warnings.push('limpieza (gastosLimpieza) vacío')

    const mesIdx = parseInt(opts.invoiceDate.slice(5, 7), 10) - 1
    if (!(mesIdx >= 0 && mesIdx <= 11)) return { ok: false, action: 'error', detail: `fecha inválida: ${opts.invoiceDate}`, warnings }
    const mes = MESES[mesIdx]
    const regimen = opts.invoiceType === 'REBU' ? 'rebu' : 'iva 21'

    const ctx = await openTab()
    if ('error' in ctx) { log(ctx.error); return { ok: false, action: 'error', detail: ctx.error, warnings } }
    const { api, spreadsheetId, sheetId, sheetTitle, rows } = ctx

    // dedup (col C ref / col E matrícula) en toda la hoja
    const plate = v.matricula ? normPlate(v.matricula) : null
    const ref = v.referencia ? normRef(v.referencia) : null
    for (let i = 0; i < rows.length; i++) {
      const e = String(rows[i]?.[4] ?? '').trim(), c = String(rows[i]?.[2] ?? '').trim()
      if (plate && e && normPlate(e) === plate) return { ok: true, action: 'duplicate', detail: `ya existe (matrícula E${i + 1})`, warnings }
      if (ref && c && normRef(c) === ref && !isSubtotal(rows[i])) return { ok: true, action: 'duplicate', detail: `ya existe (referencia C${i + 1})`, warnings }
    }

    // ubicar banda del mes (1-based) y su subtotal
    let bandRow = -1
    for (let i = 0; i < rows.length; i++) if (isBand(rows[i]) && String(rows[i][0]).trim().toUpperCase() === mes) { bandRow = i + 1; break }

    let targetRow: number // fila (1-based) donde quedará la fila del coche
    let createBand = false
    const requests: sheets_v4.Schema$Request[] = []

    if (bandRow > 0) {
      // insertar tras el último coche del mes (antes del subtotal)
      let lastCar = bandRow
      for (let i = bandRow; i < rows.length; i++) {
        if (isSubtotal(rows[i]) || (isBand(rows[i]) && i + 1 !== bandRow)) break
        if (String(rows[i]?.[2] ?? '').trim()) lastCar = i + 1 // col C con ref
      }
      targetRow = lastCar + 1
      requests.push({ insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: targetRow - 1, endIndex: targetRow }, inheritFromBefore: true } })
    } else {
      // crear banda nueva al final
      createBand = true
      let lastContent = rows.length
      while (lastContent > 0 && !(rows[lastContent - 1] ?? []).some((c) => String(c ?? '').trim())) lastContent--
      bandRow = lastContent + 2 // deja una fila en blanco
      targetRow = bandRow + 1
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

/** Hook post-emisión: nunca lanza ni bloquea la emisión. Timeout 20 s. */
export async function notifyCostoBeneficio(opts: CostoBeneficioOptions): Promise<void> {
  try {
    await Promise.race([
      syncCostoBeneficio(opts),
      new Promise<CostoBeneficioResult>((resolve) => setTimeout(() => resolve({ ok: false, action: 'error', detail: 'timeout 20s', warnings: [] }), 20_000)),
    ])
  } catch (err) {
    console.error('[costoBeneficio] hook failed:', (err as Error)?.message ?? err)
  }
}
