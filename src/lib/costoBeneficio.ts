/**
 * Sincronización con la hoja de costo/beneficio (Google Sheets).
 *
 * Al emitir una factura de venta, agrega UNA fila por coche a una pestaña
 * plana (default "Propuesta A" en la planilla "Costo-Beneficio"): 1 coche =
 * 1 fila, con COSTE/IVA/MARGEN/% como fórmulas. Modelo simple y seguro
 * (append), no toca la pestaña "2026" hecha a mano.
 *
 * Best-effort: nunca lanza. No-op si faltan credenciales Google o si
 * COSTOBENEFICIO_DISABLED=1. Soporta dryRun (loguea el plan sin escribir).
 *
 * Columnas de la pestaña (A..S):
 *  A fecha · B mes(fórmula) · C ref · D marca+modelo · E matrícula ·
 *  F régimen · G compra · H porte · I cn+informe(120) · J taller(Mecauto) ·
 *  K chapa(Fergo) · L limpieza(W.Detailing) · M cn+gar+itv · N COSTE(fórmula) ·
 *  O precio · P IVA(fórmula) · Q margen(fórmula) · R %(fórmula) · S detalle
 */

import { google, type sheets_v4 } from 'googleapis'
import { pool } from '@/lib/direct-database'
import { getGoogleSheetsAuth } from '@/lib/googleSheets'

const CN_INFORME = 120
const COSTOBENEFICIO_SPREADSHEET_ID_DEFAULT = '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'
const COSTOBENEFICIO_SHEET_NAME_DEFAULT = 'Propuesta A'

// Locale es_ES: separador de argumentos ';' y decimal ',' (validado en vivo).
const MES_FORMULA = (r: number) =>
  `=IF(A${r}="";"";CHOOSE(MONTH(A${r});"ENERO";"FEBRERO";"MARZO";"ABRIL";"MAYO";"JUNIO";"JULIO";"AGOSTO";"SEPTIEMBRE";"OCTUBRE";"NOVIEMBRE";"DICIEMBRE"))`
const COSTE_FORMULA = (r: number) => `=SUM(G${r}:M${r})`
const IVA_FORMULA = (r: number) =>
  `=IF(F${r}="iva 21";ROUND(O${r}-O${r}/1,21;2);IF(F${r}="rebu";ROUND((O${r}-N${r})-(O${r}-N${r})/1,21;2);0))`
const MARGEN_FORMULA = (r: number) => `=IF(O${r}="";"";O${r}-N${r}-P${r})`
const PCT_FORMULA = (r: number) => `=IF(N${r}=0;"";Q${r}/N${r})`

/** YYYY-MM-DD → dd/mm/yyyy (formato de fecha del locale es_ES para USER_ENTERED). */
function toEsDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export interface CostoBeneficioOptions {
  dealId: number
  numeroFactura: string
  invoiceType: string // 'VAT' | 'REBU'
  invoiceDate: string // YYYY-MM-DD (fecha de la factura de venta)
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

function log(msg: string) {
  console.log(`[costoBeneficio] ${msg}`)
}
const normPlate = (s: string) => s.replace(/[\s.\-]/g, '').toUpperCase()

async function loadVehicleCosts(dealId: number): Promise<VehicleCostData | null> {
  const res = await pool.query(
    `SELECT v.referencia, v.marca, v.modelo, v.matricula,
            v."precioCompra", v."gastosTransporte", v."gastosMecanica",
            v."gastosPintura", v."gastosLimpieza"
       FROM "Deal" d JOIN "Vehiculo" v ON v.id = d."vehiculoId"
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

interface SheetCtx {
  api: sheets_v4.Sheets
  spreadsheetId: string
  sheetId: number
  sheetTitle: string
  /** columnas A..E de todas las filas (para dedup + primera fila vacía) */
  keyRows: string[][]
}

async function openTab(): Promise<SheetCtx | { error: string }> {
  const auth = await getGoogleSheetsAuth()
  const api = google.sheets({ version: 'v4', auth })
  const spreadsheetId =
    process.env.COSTOBENEFICIO_SPREADSHEET_ID || COSTOBENEFICIO_SPREADSHEET_ID_DEFAULT
  const wanted = process.env.COSTOBENEFICIO_SHEET_NAME || COSTOBENEFICIO_SHEET_NAME_DEFAULT

  const meta = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title))' })
  const tabs = meta.data.sheets ?? []
  const tab = tabs.find((s) => s.properties?.title === wanted)
  if (!tab?.properties?.title || tab.properties.sheetId == null) {
    const names = tabs.map((s) => `"${s.properties?.title}"`).join(', ')
    return { error: `pestaña "${wanted}" no encontrada. Pestañas: ${names}. Configurá COSTOBENEFICIO_SHEET_NAME.` }
  }
  const vr = await api.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab.properties.title}!A2:E`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  })
  return {
    api,
    spreadsheetId,
    sheetId: tab.properties.sheetId,
    sheetTitle: tab.properties.title,
    keyRows: (vr.data.values ?? []) as string[][],
  }
}

export async function syncCostoBeneficio(opts: CostoBeneficioOptions): Promise<CostoBeneficioResult> {
  const warnings: string[] = []
  try {
    if (process.env.COSTOBENEFICIO_DISABLED === '1') {
      return { ok: true, action: 'skipped', detail: 'COSTOBENEFICIO_DISABLED=1', warnings }
    }
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      log('sin credenciales Google — skip')
      return { ok: true, action: 'skipped', detail: 'faltan credenciales Google', warnings }
    }

    const v = await loadVehicleCosts(opts.dealId)
    if (!v) return { ok: false, action: 'error', detail: `Deal ${opts.dealId} sin vehículo`, warnings }
    if (!v.referencia) warnings.push('sin referencia')
    if (!v.matricula) warnings.push('sin matrícula')

    const compra =
      v.precioCompra != null || v.gastosTransporte != null
        ? (v.precioCompra ?? 0) + (v.gastosTransporte ?? 0)
        : null
    if (v.precioCompra == null) warnings.push('precioCompra vacío en CRM')
    if (v.gastosMecanica == null) warnings.push('taller (gastosMecanica) vacío')
    if (v.gastosPintura == null) warnings.push('chapa (gastosPintura) vacío')
    if (v.gastosLimpieza == null) warnings.push('limpieza (gastosLimpieza) vacío')

    const regimen = opts.invoiceType === 'REBU' ? 'rebu' : 'iva 21'

    const ctx = await openTab()
    if ('error' in ctx) {
      log(ctx.error)
      return { ok: false, action: 'error', detail: ctx.error, warnings }
    }
    const { api, spreadsheetId, sheetId, sheetTitle, keyRows } = ctx

    // dedup por matrícula (col E, índice 4) o referencia (col C, índice 2)
    const plate = v.matricula ? normPlate(v.matricula) : null
    const ref = v.referencia ? v.referencia.replace(/[#\s.\-]/g, '').toUpperCase() : null
    for (let i = 0; i < keyRows.length; i++) {
      const e = String(keyRows[i]?.[4] ?? '').trim()
      const c = String(keyRows[i]?.[2] ?? '').trim()
      if (plate && e && normPlate(e) === plate) {
        log(`Vehicle already exists in costobeneficio (matrícula E${i + 2}) — no se inserta`)
        return { ok: true, action: 'duplicate', detail: `ya existe (matrícula en E${i + 2})`, warnings }
      }
      if (ref && c && c.replace(/[#\s.\-]/g, '').toUpperCase() === ref) {
        return { ok: true, action: 'duplicate', detail: `ya existe (referencia en C${i + 2})`, warnings }
      }
    }

    // primera fila vacía (ref C y matrícula E vacías)
    let firstEmpty = keyRows.findIndex(
      (r) => !String(r?.[2] ?? '').trim() && !String(r?.[4] ?? '').trim()
    )
    if (firstEmpty === -1) firstEmpty = keyRows.length
    const rowNum = firstEmpty + 2 // 1-based, +1 header

    // fila A..S (fórmulas para B,N,P,Q,R; 120 en I)
    const blank = ''
    const rowValues: (string | number)[] = [
      toEsDate(opts.invoiceDate), // A fecha (dd/mm/yyyy → USER_ENTERED la parsea)
      MES_FORMULA(rowNum), // B mes
      v.referencia ?? blank, // C ref
      [v.marca, v.modelo].filter(Boolean).join(' ') || blank, // D coche
      v.matricula ?? blank, // E matrícula
      regimen, // F régimen
      compra ?? blank, // G compra
      v.gastosTransporte ?? blank, // H porte
      CN_INFORME, // I cn+informe
      v.gastosMecanica ?? blank, // J taller
      v.gastosPintura ?? blank, // K chapa
      v.gastosLimpieza ?? blank, // L limpieza
      blank, // M cn+gar+itv (manual)
      COSTE_FORMULA(rowNum), // N coste
      opts.salePrice, // O precio
      IVA_FORMULA(rowNum), // P iva
      MARGEN_FORMULA(rowNum), // Q margen
      PCT_FORMULA(rowNum), // R %
      blank, // S detalle
    ]

    const plan = {
      dealId: opts.dealId,
      numeroFactura: opts.numeroFactura,
      sheet: `${sheetTitle} (gid=${sheetId})`,
      filaDestino: rowNum,
      valores: {
        A_fecha: opts.invoiceDate,
        C_ref: v.referencia,
        D_coche: [v.marca, v.modelo].filter(Boolean).join(' '),
        E_matricula: v.matricula,
        F_regimen: regimen,
        G_compra: compra,
        'G_desglose(compra+porte)': { precioCompra: v.precioCompra, transporte: v.gastosTransporte },
        I_cnInforme: CN_INFORME,
        J_taller: v.gastosMecanica,
        K_chapa: v.gastosPintura,
        L_limpieza: v.gastosLimpieza,
        O_precio: opts.salePrice,
        'N/P/Q/R': 'fórmulas (COSTE/IVA/MARGEN/%)',
      },
      dedup: 'no existe (matrícula+ref)',
    }

    if (opts.dryRun) {
      log(`DRY-RUN → ${JSON.stringify(plan, null, 2)}`)
      return { ok: true, action: 'dry-run', detail: `agregaría fila ${rowNum} en "${sheetTitle}"`, warnings, plan }
    }

    // escribir la fila (USER_ENTERED interpreta fórmulas y la fecha ISO)
    await api.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTitle}!A${rowNum}:S${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    })
    // heredar formato de la fila de arriba (números €, fecha, etc.)
    if (rowNum > 2) {
      await api.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              copyPaste: {
                source: { sheetId, startRowIndex: rowNum - 2, endRowIndex: rowNum - 1, startColumnIndex: 0, endColumnIndex: 19 },
                destination: { sheetId, startRowIndex: rowNum - 1, endRowIndex: rowNum, startColumnIndex: 0, endColumnIndex: 19 },
                pasteType: 'PASTE_FORMAT',
              },
            },
          ],
        },
      })
    }

    log(
      `fila ${rowNum} agregada en "${sheetTitle}": ${v.referencia ?? '?'} / ${v.matricula ?? '?'} / ${opts.salePrice}` +
        (warnings.length ? ` | avisos: ${warnings.join(' | ')}` : '')
    )
    return { ok: true, action: 'inserted', detail: `fila ${rowNum} agregada en "${sheetTitle}"`, warnings, plan }
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
      new Promise<CostoBeneficioResult>((resolve) =>
        setTimeout(() => resolve({ ok: false, action: 'error', detail: 'timeout 20s', warnings: [] }), 20_000)
      ),
    ])
  } catch (err) {
    console.error('[costoBeneficio] hook failed:', (err as Error)?.message ?? err)
  }
}
