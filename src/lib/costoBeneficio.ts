/**
 * Sincronización con la pestaña "costobeneficio" del spreadsheet COMPRAS.
 *
 * Al emitir una factura de venta se inserta un bloque de 2 filas en la
 * sección del mes correspondiente, copiando formato y fórmulas del último
 * bloque existente de ese mes (COSTE/IVA/Margen se copian como fórmulas,
 * nunca se hardcodean).
 *
 * Best-effort: nunca lanza — devuelve un resultado descriptivo. No-op si
 * faltan GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY o si
 * COSTOBENEFICIO_DISABLED=1. Soporta dryRun (loguea el plan sin escribir).
 *
 * Columnas: A ref/régimen · B marca+modelo/matrícula · C COMPRA (compra+
 * transporte) · D cn+informe (120 fijo) · E taller (Mecauto=gastosMecanica) ·
 * F chapa (Fergo=gastosPintura) · G limpieza (WorldDetailing=gastosLimpieza) ·
 * H cn+garantia+itv (manual) · I COSTE (fórmula) · J IVA (fórmula) ·
 * K PRECIO (factura) · L Margen (fórmula) · M DETALLE.
 */

import { google, type sheets_v4 } from 'googleapis'
import { pool } from '@/lib/direct-database'
import { getGoogleSheetsAuth } from '@/lib/googleSheets'

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const

const CN_INFORME = 120
const NUM_COLS = 13 // A..M

// Planilla "Costo-Beneficio", pestaña "2026" (mismo patrón hardcode que sheetsConfig.ts).
// Sobreescribible por env si algún día cambia.
const COSTOBENEFICIO_SPREADSHEET_ID_DEFAULT = '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'
const COSTOBENEFICIO_SHEET_NAME_DEFAULT = '2026'

export interface CostoBeneficioOptions {
  dealId: number
  numeroFactura: string
  invoiceType: string // 'VAT' | 'REBU'
  /** YYYY-MM-DD (fecha de la factura de venta) */
  invoiceDate: string
  salePrice: number
  dryRun?: boolean
}

export interface CostoBeneficioResult {
  ok: boolean
  action: 'inserted' | 'duplicate' | 'dry-run' | 'skipped' | 'error'
  detail: string
  warnings: string[]
  /** Plan completo (siempre en dryRun; en insert real, lo efectivamente escrito) */
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

function log(msg: string) {
  console.log(`[costoBeneficio] ${msg}`)
}

function normPlate(s: string): string {
  return s.replace(/[\s.-]/g, '').toUpperCase()
}

function normRef(s: string): string {
  return s.replace(/[#\s.-]/g, '').toUpperCase()
}

/** Convierte índice de columna 0-based a letra A1 (0→A, 12→M). */
function colLetter(i: number): string {
  return String.fromCharCode(65 + i)
}

/**
 * Expande en una fórmula los rangos A1 cuya fila final coincide con
 * oldEndRow (1-based), sumándoles delta filas. Usado para que los totales
 * del mes (p.ej. SUM(C10:C20)) incluyan el bloque insertado al final.
 */
export function expandRangesInFormula(
  formula: string,
  oldEndRow: number,
  delta: number
): string {
  return formula.replace(
    /(\$?[A-Z]{1,2}\$?)(\d+)(:\$?[A-Z]{1,2}\$?)(\d+)/g,
    (full, c1, r1, c2, r2) => {
      const end = parseInt(r2, 10)
      if (end === oldEndRow) return `${c1}${r1}${c2}${end + delta}`
      return full
    }
  )
}

async function loadVehicleCosts(dealId: number): Promise<VehicleCostData | null> {
  const res = await pool.query(
    `SELECT v.referencia, v.marca, v.modelo, v.matricula,
            v."precioCompra", v."gastosTransporte", v."gastosMecanica",
            v."gastosPintura", v."gastosLimpieza"
       FROM "Deal" d
       JOIN "Vehiculo" v ON v.id = d."vehiculoId"
      WHERE d.id = $1`,
    [dealId]
  )
  const r = res.rows[0]
  if (!r) return null
  const num = (x: unknown) => (x != null ? Number(x) : null)
  return {
    referencia: r.referencia ?? null,
    marca: r.marca ?? null,
    modelo: r.modelo ?? null,
    matricula: r.matricula ?? null,
    precioCompra: num(r.precioCompra),
    gastosTransporte: num(r.gastosTransporte),
    gastosMecanica: num(r.gastosMecanica),
    gastosPintura: num(r.gastosPintura),
    gastosLimpieza: num(r.gastosLimpieza),
  }
}

interface SheetContext {
  api: sheets_v4.Sheets
  spreadsheetId: string
  sheetId: number
  sheetTitle: string
  /** valores con fórmulas (FORMULA render), matriz [fila][col] */
  rows: string[][]
}

async function openCostoBeneficioTab(): Promise<SheetContext | { error: string }> {
  const auth = await getGoogleSheetsAuth()
  const api = google.sheets({ version: 'v4', auth })
  const spreadsheetId =
    process.env.COSTOBENEFICIO_SPREADSHEET_ID ||
    COSTOBENEFICIO_SPREADSHEET_ID_DEFAULT

  const meta = await api.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  })
  const tabs = meta.data.sheets ?? []
  const wanted = process.env.COSTOBENEFICIO_SHEET_NAME || COSTOBENEFICIO_SHEET_NAME_DEFAULT
  const tab = wanted
    ? tabs.find((s) => s.properties?.title === wanted)
    : tabs.find((s) => /costo\s*.?\s*benefic|benefic/i.test(s.properties?.title ?? ''))
  if (!tab?.properties?.title || tab.properties.sheetId == null) {
    const names = tabs.map((s) => `"${s.properties?.title}"`).join(', ')
    return {
      error:
        `pestaña costobeneficio no encontrada (busqué ${wanted ? `"${wanted}"` : '/costo|benefic/i'}). ` +
        `Pestañas del archivo: ${names}. Configurá COSTOBENEFICIO_SHEET_NAME.`,
    }
  }
  const title = tab.properties.title
  const vr = await api.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!A1:M`,
    valueRenderOption: 'FORMULA',
  })
  return {
    api,
    spreadsheetId,
    sheetId: tab.properties.sheetId,
    sheetTitle: title,
    rows: (vr.data.values ?? []) as string[][],
  }
}

/** Fila (0-based) del encabezado del mes, o -1. */
function findMonthRow(rows: string[][], mes: string): number {
  return rows.findIndex((r) =>
    (r ?? []).slice(0, 3).some((c) => String(c ?? '').trim().toUpperCase() === mes)
  )
}

/** ¿La fila parece la fila superior de un bloque de vehículo? (col A con referencia) */
function isBlockTopRow(row: string[] | undefined): boolean {
  if (!row) return false
  const a = String(row[0] ?? '').trim()
  const b = String(row[1] ?? '').trim()
  // referencia tipo "1064", "#1064", "D32", "R-40" + algo en B (marca/modelo)
  return /^#?[A-Z]{0,2}-?\d{1,5}$/i.test(a) && b.length > 0
}

/** ¿Fila de totales / cierre de sección? */
function isTotalsRow(row: string[] | undefined): boolean {
  if (!row) return false
  return (row ?? []).some((c) => {
    const s = String(c ?? '')
    return /total|suma/i.test(s) && !/matr/i.test(s)
  }) || (row ?? []).some((c) => /^=.*(SUM|SUMA)\(/i.test(String(c ?? '')))
}

interface MonthSection {
  monthRow: number
  /** fila 0-based de la fila superior del último bloque, o -1 si el mes no tiene bloques */
  lastBlockTop: number
  /** fila 0-based donde termina la sección (primera fila de totales / próximo mes / fin) */
  sectionEnd: number
}

function analyzeMonthSection(rows: string[][], monthRow: number): MonthSection {
  const isMonthHeader = (r: string[] | undefined) =>
    (r ?? []).slice(0, 3).some((c) =>
      (MESES as readonly string[]).includes(String(c ?? '').trim().toUpperCase())
    )
  let lastBlockTop = -1
  let sectionEnd = rows.length
  for (let i = monthRow + 1; i < rows.length; i++) {
    const row = rows[i]
    // un bloque puede tener fórmulas SUM propias — chequear bloque ANTES que totales
    if (isBlockTopRow(row)) {
      lastBlockTop = i
      i++ // saltear la fila inferior del bloque (régimen/matrícula)
      continue
    }
    if (isMonthHeader(row) || isTotalsRow(row)) {
      sectionEnd = i
      break
    }
  }
  return { monthRow, lastBlockTop, sectionEnd }
}

/** Busca duplicado por matrícula o referencia en toda la pestaña. */
function findDuplicate(
  rows: string[][],
  matricula: string | null,
  referencia: string | null
): { row: number; via: string } | null {
  const plate = matricula ? normPlate(matricula) : null
  const ref = referencia ? normRef(referencia) : null
  for (let i = 0; i < rows.length; i++) {
    for (let c = 0; c < 2; c++) {
      const cell = String(rows[i]?.[c] ?? '').trim()
      if (!cell) continue
      if (plate && normPlate(cell) === plate) return { row: i + 1, via: `matrícula en ${colLetter(c)}${i + 1}` }
      if (ref && c === 0 && normRef(cell) === ref) return { row: i + 1, via: `referencia en A${i + 1}` }
    }
  }
  return null
}

export async function syncCostoBeneficio(
  opts: CostoBeneficioOptions
): Promise<CostoBeneficioResult> {
  const warnings: string[] = []
  try {
    if (process.env.COSTOBENEFICIO_DISABLED === '1') {
      return { ok: true, action: 'skipped', detail: 'COSTOBENEFICIO_DISABLED=1', warnings }
    }
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      log('sin credenciales de Google (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY) — skip')
      return { ok: true, action: 'skipped', detail: 'faltan credenciales Google', warnings }
    }

    // ---- 1. Datos del vehículo (DB) ----
    const v = await loadVehicleCosts(opts.dealId)
    if (!v) {
      return { ok: false, action: 'error', detail: `Deal ${opts.dealId} sin vehículo asociado`, warnings }
    }
    const need = { referencia: v.referencia, marca: v.marca, matricula: v.matricula }
    for (const [k, val] of Object.entries(need)) {
      if (!val) warnings.push(`vehículo sin ${k} — celda quedará vacía`)
    }

    const compra =
      v.precioCompra != null || v.gastosTransporte != null
        ? (v.precioCompra ?? 0) + (v.gastosTransporte ?? 0)
        : null
    if (v.precioCompra == null) warnings.push('precioCompra vacío en CRM (COMPRA incompleta)')
    if (v.gastosTransporte == null) warnings.push('gastosTransporte vacío en CRM (COMPRA sin porte)')
    if (v.gastosMecanica == null) warnings.push('gastosMecanica (taller/Mecauto) vacío — celda E en blanco')
    if (v.gastosPintura == null) warnings.push('gastosPintura (chapa/Fergo) vacío — celda F en blanco')
    if (v.gastosLimpieza == null) warnings.push('gastosLimpieza (limpieza/WorldDetailing) vacío — celda G en blanco')

    const mesIdx = parseInt(opts.invoiceDate.slice(5, 7), 10) - 1
    if (!(mesIdx >= 0 && mesIdx <= 11)) {
      return { ok: false, action: 'error', detail: `fecha de factura inválida: ${opts.invoiceDate}`, warnings }
    }
    const mes = MESES[mesIdx]
    const regimen = opts.invoiceType === 'REBU' ? 'rebu' : 'iva 21'

    // ---- 2. Abrir pestaña ----
    const ctx = await openCostoBeneficioTab()
    if ('error' in ctx) {
      log(ctx.error)
      return { ok: false, action: 'error', detail: ctx.error, warnings }
    }
    const { api, spreadsheetId, sheetId, sheetTitle, rows } = ctx

    // ---- 3. Duplicado ----
    const dup = findDuplicate(rows, v.matricula, v.referencia)
    if (dup) {
      log(`Vehicle already exists in costobeneficio (${dup.via}) — no se inserta`)
      return {
        ok: true,
        action: 'duplicate',
        detail: `ya existe (${dup.via})`,
        warnings,
      }
    }

    // ---- 4. Sección del mes + bloque plantilla ----
    const monthRow = findMonthRow(rows, mes)
    let createMonthHeader = false
    let section: MonthSection
    if (monthRow >= 0) {
      section = analyzeMonthSection(rows, monthRow)
    } else {
      createMonthHeader = true
      section = { monthRow: -1, lastBlockTop: -1, sectionEnd: rows.length }
      warnings.push(`sección "${mes}" no existe — se creará al final con el estilo del último mes`)
    }

    // plantilla: último bloque del mes; si el mes no tiene, el último bloque de la pestaña
    let templateTop = section.lastBlockTop
    if (templateTop < 0) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (isBlockTopRow(rows[i])) { templateTop = i; break }
      }
      if (templateTop >= 0 && monthRow >= 0) {
        warnings.push(`"${mes}" sin bloques previos — formato/fórmulas copiados del bloque de la fila ${templateTop + 1}`)
      }
    }
    if (templateTop < 0) {
      const d = 'no encontré ningún bloque de vehículo para usar como plantilla — no inserto (revisá la pestaña)'
      log(d)
      return { ok: false, action: 'error', detail: d, warnings }
    }
    const templateRows = [rows[templateTop] ?? [], rows[templateTop + 1] ?? []]

    // dónde insertar (0-based): tras el último bloque del mes; si el mes está
    // vacío, tras su encabezado; si hay que crear el mes, al final de la hoja
    const insertAt =
      section.lastBlockTop >= 0
        ? section.lastBlockTop + 2
        : monthRow >= 0
          ? monthRow + 1
          : rows.length

    // ---- 5. Totales del mes cuyo rango termina en el último bloque ----
    const oldEndRow1 = section.lastBlockTop >= 0 ? section.lastBlockTop + 2 : -1 // 1-based fila inferior del último bloque
    const totalsFixes: { row: number; col: number; from: string; to: string }[] = []
    if (oldEndRow1 > 0) {
      for (let i = insertAt; i < Math.min(section.sectionEnd + 3, rows.length); i++) {
        const row = rows[i] ?? []
        for (let c = 0; c < NUM_COLS; c++) {
          const f = String(row[c] ?? '')
          if (!f.startsWith('=')) continue
          const fixed = expandRangesInFormula(f, oldEndRow1, 2)
          if (fixed !== f) totalsFixes.push({ row: i + 1, col: c, from: f, to: fixed })
        }
      }
    }

    // ---- 6. Valores del bloque nuevo ----
    const blank = ''
    const topValues: (string | number)[] = [
      v.referencia ?? blank,                                     // A referencia
      [v.marca, v.modelo].filter(Boolean).join(' ') || blank,    // B marca+modelo
      compra ?? blank,                                           // C COMPRA
      CN_INFORME,                                                // D cn+informe
      v.gastosMecanica ?? blank,                                 // E taller
      v.gastosPintura ?? blank,                                  // F chapa
      v.gastosLimpieza ?? blank,                                 // G limpieza
      blank,                                                     // H cn+garantia+itv (manual)
      // I, J: fórmulas copiadas de la plantilla (no se pisan)
      // K: precio · L: fórmula margen (no se pisa) · M: detalle en blanco
    ]
    const bottomValues: (string | number)[] = [regimen, v.matricula ?? blank]

    const plan = {
      dealId: opts.dealId,
      numeroFactura: opts.numeroFactura,
      sheet: `${sheetTitle} (gid=${sheetId})`,
      mes,
      targetRow: insertAt + 1,
      createMonthHeader,
      templateRow: templateTop + 1,
      templateBlock: templateRows.map((r) => r.slice(0, NUM_COLS)),
      formulasCopiadas: {
        COSTE_I: String(templateRows[0][8] ?? '(vacía)'),
        IVA_J: String(templateRows[0][9] ?? '(vacía)'),
        MARGEN_L: String(templateRows[0][11] ?? '(vacía)'),
      },
      topRow: {
        referencia: v.referencia, marcaModelo: [v.marca, v.modelo].filter(Boolean).join(' '),
        COMPRA: compra, compraDesglose: { precioCompra: v.precioCompra, transporte: v.gastosTransporte, fuente: 'CRM Vehiculo.precioCompra + Vehiculo.gastosTransporte' },
        cnInforme: CN_INFORME,
        taller: v.gastosMecanica, chapa: v.gastosPintura, limpieza: v.gastosLimpieza,
        cnGarantiaItv: '(en blanco, manual)',
        PRECIO: opts.salePrice, precioFuente: `factura ${opts.numeroFactura} (${opts.invoiceDate})`,
      },
      bottomRow: { regimen, matricula: v.matricula },
      totalsFixes,
      duplicateCheck: 'no existe (ref+matrícula revisadas en toda la pestaña)',
    }

    if (opts.dryRun) {
      log(`DRY-RUN → ${JSON.stringify(plan, null, 2)}`)
      return { ok: true, action: 'dry-run', detail: `insertaría bloque en "${sheetTitle}" fila ${insertAt + 1} (${mes})`, warnings, plan }
    }

    // ---- 7. Escribir: insertar filas + copiar formato/fórmulas + valores ----
    const requests: sheets_v4.Schema$Request[] = []

    if (createMonthHeader && monthRow < 0) {
      // crear encabezado del mes al final, copiando estilo del último encabezado de mes existente
      let lastHeader = -1
      for (let i = rows.length - 1; i >= 0; i--) {
        if ((rows[i] ?? []).slice(0, 3).some((c) => (MESES as readonly string[]).includes(String(c ?? '').trim().toUpperCase()))) {
          lastHeader = i
          break
        }
      }
      requests.push({ insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: insertAt, endIndex: insertAt + 1 }, inheritFromBefore: false } })
      if (lastHeader >= 0) {
        requests.push({
          copyPaste: {
            source: { sheetId, startRowIndex: lastHeader, endRowIndex: lastHeader + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
            destination: { sheetId, startRowIndex: insertAt, endRowIndex: insertAt + 1, startColumnIndex: 0, endColumnIndex: NUM_COLS },
            pasteType: 'PASTE_NORMAL',
          },
        })
      }
      requests.push({
        updateCells: {
          range: { sheetId, startRowIndex: insertAt, endRowIndex: insertAt + 1, startColumnIndex: 0, endColumnIndex: 1 },
          rows: [{ values: [{ userEnteredValue: { stringValue: mes } }] }],
          fields: 'userEnteredValue',
        },
      })
    }

    const blockStart = createMonthHeader && monthRow < 0 ? insertAt + 1 : insertAt
    // el copyPaste de la plantilla debe apuntar a su fila REAL post-inserciones
    const shift = (r: number) => (r >= insertAt ? r + (createMonthHeader ? 3 : 2) : r)
    requests.push({ insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: blockStart, endIndex: blockStart + 2 }, inheritFromBefore: false } })
    requests.push({
      copyPaste: {
        source: { sheetId, startRowIndex: shift(templateTop), endRowIndex: shift(templateTop) + 2, startColumnIndex: 0, endColumnIndex: NUM_COLS },
        destination: { sheetId, startRowIndex: blockStart, endRowIndex: blockStart + 2, startColumnIndex: 0, endColumnIndex: NUM_COLS },
        pasteType: 'PASTE_NORMAL',
      },
    })
    await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })

    // valores (USER_ENTERED para respetar formatos numéricos del template)
    const data: sheets_v4.Schema$ValueRange[] = [
      { range: `${sheetTitle}!A${blockStart + 1}:H${blockStart + 1}`, values: [topValues] },
      { range: `${sheetTitle}!K${blockStart + 1}`, values: [[opts.salePrice]] },
      { range: `${sheetTitle}!M${blockStart + 1}`, values: [['']] },
      { range: `${sheetTitle}!A${blockStart + 2}:B${blockStart + 2}`, values: [bottomValues] },
    ]
    if (totalsFixes.length) {
      for (const fix of totalsFixes) {
        const newRow = fix.row + (createMonthHeader ? 3 : 2)
        data.push({ range: `${sheetTitle}!${colLetter(fix.col)}${newRow}`, values: [[fix.to]] })
      }
    }
    await api.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    })

    log(
      `insertado bloque ${v.referencia ?? '?'} / ${v.matricula ?? '?'} en "${sheetTitle}" ` +
      `filas ${blockStart + 1}-${blockStart + 2} (${mes}); totales ajustados: ${totalsFixes.length}` +
      (warnings.length ? `; avisos: ${warnings.join(' | ')}` : '')
    )
    return {
      ok: true,
      action: 'inserted',
      detail: `bloque insertado en "${sheetTitle}" filas ${blockStart + 1}-${blockStart + 2} (${mes})`,
      warnings,
      plan,
    }
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err)
    log(`ERROR: ${msg}`)
    return { ok: false, action: 'error', detail: msg, warnings }
  }
}

/**
 * Hook post-emisión: mismo contrato que notifyGestoriaInvoice — nunca lanza,
 * nunca bloquea la emisión. Timeout duro de 20 s.
 */
export async function notifyCostoBeneficio(opts: CostoBeneficioOptions): Promise<void> {
  try {
    await Promise.race([
      syncCostoBeneficio(opts),
      new Promise<CostoBeneficioResult>((resolve) =>
        setTimeout(() => resolve({ ok: false, action: 'error', detail: 'timeout 20s', warnings: [] }), 20_000)
      ),
    ])
  } catch (err) {
    console.error('[costoBeneficio] hook failed:', (err as Error)?.message ?? err)
  }
}
