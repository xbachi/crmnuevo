/**
 * POST /api/admin/resync-costobeneficio?year=2026
 *
 * Re-sincroniza las COLUMNAS DE COSTO de las filas YA EXISTENTES en "CB 2026"
 * con los valores actuales del CRM (Vehiculo.gastos*). Necesario porque la hoja
 * guarda valores estáticos del momento de inserción: si después se cargan costos
 * en el CRM (p.ej. backfill de compra), la hoja no se entera sola.
 *
 * FILL-ONLY: sólo escribe una celda de costo si está VACÍA en la hoja y el CRM
 * tiene un valor. Nunca pisa ni borra datos manuales existentes.
 *
 * Columnas de input (COSTE=SUM(G:M) recalcula solo): G compra · H porte ·
 * J taller · K chapa · L limpieza. Las fórmulas N/P/Q/R no se tocan.
 *
 * ?reorderApril=true además reubica la banda ABRIL entre MARZO y MAYO
 * (quedó al final porque se creó cuando los meses posteriores ya existían).
 *
 * Protegido por X-Admin-Secret. Soporta ?dryRun=true.
 */

import { NextRequest, NextResponse } from 'next/server'
import { google, type sheets_v4 } from 'googleapis'
import { getGoogleSheetsAuth } from '@/lib/googleSheets'
import { pool } from '@/lib/direct-database'
import { getEmittedInvoices } from '@/lib/facturasQuery'
import { computeCompra, isBand, isSubtotal, normPlate, normRef, MESES } from '@/lib/costoBeneficioSheet'

const SHEET_ID = process.env.COSTOBENEFICIO_SPREADSHEET_ID || '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'
const DEFAULT_TAB = 'CB 2026'

interface Costs {
  precioCompra: number | null
  gastosTransporte: number | null
  gastosMecanica: number | null
  gastosPintura: number | null
  gastosLimpieza: number | null
}

/** Costos actuales del CRM por deal_id. */
async function loadCostsByDeal(dealIds: number[]): Promise<Map<number, Costs>> {
  const map = new Map<number, Costs>()
  if (dealIds.length === 0) return map
  const res = await pool.query(
    `SELECT d.id AS deal_id, v."precioCompra", v."gastosTransporte",
            v."gastosMecanica", v."gastosPintura", v."gastosLimpieza"
       FROM "Deal" d JOIN "Vehiculo" v ON v.id = d."vehiculoId"
      WHERE d.id = ANY($1)`,
    [dealIds]
  )
  const num = (x: unknown) => (x != null ? Number(x) : null)
  for (const r of res.rows) {
    map.set(r.deal_id, {
      precioCompra: num(r.precioCompra),
      gastosTransporte: num(r.gastosTransporte),
      gastosMecanica: num(r.gastosMecanica),
      gastosPintura: num(r.gastosPintura),
      gastosLimpieza: num(r.gastosLimpieza),
    })
  }
  return map
}

interface Ctx { api: sheets_v4.Sheets; sheetId: number; title: string; rows: string[][] }
async function openTab(tab: string): Promise<Ctx> {
  const auth = await getGoogleSheetsAuth()
  const api = google.sheets({ version: 'v4', auth })
  const meta = await api.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(sheetId,title))' })
  const found = (meta.data.sheets ?? []).find((s) => s.properties?.title === tab)
  if (!found?.properties || found.properties.sheetId == null) throw new Error(`pestaña "${tab}" no encontrada`)
  const vr = await api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A1:S`, valueRenderOption: 'FORMATTED_VALUE' })
  return { api, sheetId: found.properties.sheetId, title: found.properties.title ?? tab, rows: (vr.data.values ?? []) as string[][] }
}

const cell = (r: string[], i: number) => String(r[i] ?? '').trim()
// columnas de input: idx → letra
const COST_COLS: { idx: number; col: string; label: string; get: (c: Costs) => number | null }[] = [
  { idx: 6, col: 'G', label: 'compra', get: (c) => computeCompra(c.precioCompra, c.gastosTransporte) },
  { idx: 7, col: 'H', label: 'porte', get: (c) => c.gastosTransporte },
  { idx: 9, col: 'J', label: 'taller', get: (c) => c.gastosMecanica },
  { idx: 10, col: 'K', label: 'chapa', get: (c) => c.gastosPintura },
  { idx: 11, col: 'L', label: 'limpieza', get: (c) => c.gastosLimpieza },
]

/** Bloque de una banda de mes: filas 1-based [start, end] (banda + coches + subtotal). */
function findBandBlock(rows: string[][], mes: string): { start: number; end: number } | null {
  const mesU = mes.toUpperCase()
  let start = -1
  for (let i = 0; i < rows.length; i++) {
    if (isBand(rows[i]) && cell(rows[i], 0).toUpperCase() === mesU) { start = i + 1; break }
  }
  if (start < 0) return null
  let end = start
  for (let i = start; i < rows.length; i++) {
    end = i + 1
    if (isSubtotal(rows[i])) break
    if (i + 1 >= start && isBand(rows[i]) && i + 1 !== start) { end = i; break }
  }
  return { start, end }
}

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || (request.headers.get('x-admin-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)
  const tab = searchParams.get('tab') || DEFAULT_TAB
  const dryRun = searchParams.get('dryRun') === 'true'
  const reorderApril = searchParams.get('reorderApril') === 'true'

  try {
    const invoices = await getEmittedInvoices(year)
    const costs = await loadCostsByDeal([...new Set(invoices.map((i) => i.deal_id))])
    const ctx = await openTab(tab)
    const { api, sheetId, title, rows } = ctx

    // índice matrícula/ref normalizada → fila 1-based del coche
    const plateRow = new Map<string, number>()
    const refRow = new Map<string, number>()
    rows.forEach((r, i) => {
      if (isBand(r) || isSubtotal(r)) return
      const p = cell(r, 4), rf = cell(r, 2)
      if (p) plateRow.set(normPlate(p), i + 1)
      if (rf) refRow.set(normRef(rf), i + 1)
    })

    const updates: sheets_v4.Schema$ValueRange[] = []
    const filled: string[] = []
    for (const inv of invoices) {
      const c = costs.get(inv.deal_id)
      if (!c) continue
      const rowNum =
        (inv.matricula && plateRow.get(normPlate(inv.matricula))) ||
        (inv.referencia && refRow.get(normRef(inv.referencia))) || 0
      if (!rowNum) continue
      const sheetRow = rows[rowNum - 1] ?? []
      for (const cc of COST_COLS) {
        const val = cc.get(c)
        if (val == null || val === 0) continue
        if (cell(sheetRow, cc.idx) !== '') continue // fill-only: no pisar
        updates.push({ range: `${title}!${cc.col}${rowNum}`, values: [[val]] })
        filled.push(`${inv.referencia || inv.matricula} ${cc.label}=${val} (${cc.col}${rowNum})`)
      }
    }

    // reubicar ABRIL entre MARZO y MAYO
    let reorder: Record<string, unknown> | null = null
    if (reorderApril) {
      const abril = findBandBlock(rows, 'ABRIL')
      const mayoStart = (() => {
        for (let i = 0; i < rows.length; i++) if (isBand(rows[i]) && cell(rows[i], 0).toUpperCase() === 'MAYO') return i + 1
        return -1
      })()
      if (!abril) reorder = { error: 'banda ABRIL no encontrada' }
      else if (mayoStart < 0) reorder = { error: 'banda MAYO no encontrada' }
      else if (abril.start < mayoStart) reorder = { skipped: 'ABRIL ya está antes de MAYO' }
      else {
        // mover filas [abril.start, abril.end] (1-based, incl) a antes de MAYO (0-based dest = mayoStart-1)
        reorder = { abril, mayoStart, move: `filas ${abril.start}-${abril.end} → antes de fila ${mayoStart}` }
        if (!dryRun) {
          await api.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
              requests: [{
                moveDimension: {
                  source: { sheetId, dimension: 'ROWS', startIndex: abril.start - 1, endIndex: abril.end },
                  destinationIndex: mayoStart - 1,
                },
              }],
            },
          })
        }
      }
    }

    if (!dryRun && updates.length > 0) {
      await api.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
      })
    }

    return NextResponse.json({
      ok: true,
      year, tab: title, dryRun,
      totalInvoices: invoices.length,
      cellsFilled: updates.length,
      filled,
      reorder,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
