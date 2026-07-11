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
import {
  isBand,
  isSubtotal,
  normPlate,
  normRef,
  reconcileCostCells,
} from '@/lib/costoBeneficioSheet'
import { parseResyncCostoBeneficioParams } from '@/lib/resyncCostoBeneficioParams'

const SHEET_ID =
  process.env.COSTOBENEFICIO_SPREADSHEET_ID ||
  '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'
interface Costs {
  precioCompra: number | null
  gastosTransporte: number | null
  gastosMecanica: number | null
  gastosPintura: number | null
  gastosLimpieza: number | null
  gastosOtros: number | null
}

/** Costos actuales del CRM por vehiculo_id. */
async function loadCostsByVehicle(
  vehicleIds: number[]
): Promise<Map<number, Costs>> {
  const map = new Map<number, Costs>()
  if (vehicleIds.length === 0) return map
  const res = await pool.query(
    `SELECT v.id AS vehiculo_id, v."precioCompra", v."gastosTransporte",
            v."gastosMecanica", v."gastosPintura", v."gastosLimpieza", v."gastosOtros"
       FROM "Vehiculo" v WHERE v.id = ANY($1)`,
    [vehicleIds]
  )
  const num = (x: unknown) => (x != null ? Number(x) : null)
  for (const r of res.rows) {
    map.set(r.vehiculo_id, {
      precioCompra: num(r.precioCompra),
      gastosTransporte: num(r.gastosTransporte),
      gastosMecanica: num(r.gastosMecanica),
      gastosPintura: num(r.gastosPintura),
      gastosLimpieza: num(r.gastosLimpieza),
      gastosOtros: num(r.gastosOtros),
    })
  }
  return map
}

interface Ctx {
  api: sheets_v4.Sheets
  sheetId: number
  title: string
  rows: string[][]
}
async function openTab(tab: string): Promise<Ctx> {
  const auth = await getGoogleSheetsAuth()
  const api = google.sheets({ version: 'v4', auth })
  const meta = await api.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title))',
  })
  const found = (meta.data.sheets ?? []).find(
    (s) => s.properties?.title === tab
  )
  if (!found?.properties || found.properties.sheetId == null)
    throw new Error(`pestaña "${tab}" no encontrada`)
  const vr = await api.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A1:S`,
    valueRenderOption: 'FORMATTED_VALUE',
  })
  return {
    api,
    sheetId: found.properties.sheetId,
    title: found.properties.title ?? tab,
    rows: (vr.data.values ?? []) as string[][],
  }
}

const cell = (r: string[], i: number) => String(r[i] ?? '').trim()

/** Bloque de una banda de mes: filas 1-based [start, end] (banda + coches + subtotal). */
function findBandBlock(
  rows: string[][],
  mes: string
): { start: number; end: number } | null {
  const mesU = mes.toUpperCase()
  let start = -1
  for (let i = 0; i < rows.length; i++) {
    if (isBand(rows[i]) && cell(rows[i], 0).toUpperCase() === mesU) {
      start = i + 1
      break
    }
  }
  if (start < 0) return null
  let end = start
  for (let i = start; i < rows.length; i++) {
    end = i + 1
    if (isSubtotal(rows[i])) break
    if (i + 1 >= start && isBand(rows[i]) && i + 1 !== start) {
      end = i
      break
    }
  }
  return { start, end }
}

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? ''
  if (!secret || (request.headers.get('x-admin-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  let parsed: ReturnType<typeof parseResyncCostoBeneficioParams>
  try {
    parsed = parseResyncCostoBeneficioParams(
      searchParams,
      new Date().getFullYear()
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    )
  }
  const {
    year,
    tab,
    dryRun,
    confirmed,
    mode,
    reorderApril,
    destructiveActions,
  } = parsed
  const clearCompra = parsed.clearCompra
    .split(',')
    .map((s) => normPlate(s))
    .filter(Boolean)

  try {
    const ctx = await openTab(tab)
    const { api, sheetId, title, rows } = ctx

    // índice matrícula/ref normalizada → fila 1-based del coche
    const plateRow = new Map<string, number>()
    const refRow = new Map<string, number>()
    rows.forEach((r, i) => {
      if (isBand(r) || isSubtotal(r)) return
      const p = cell(r, 4),
        rf = cell(r, 2)
      if (p) {
        const key = normPlate(p)
        if (plateRow.has(key)) {
          throw new Error(`matrícula duplicada en la hoja: ${p}`)
        }
        plateRow.set(key, i + 1)
      }
      if (rf) {
        const key = normRef(rf)
        if (refRow.has(key)) {
          throw new Error(`referencia duplicada en la hoja: ${rf}`)
        }
        refRow.set(key, i + 1)
      }
    })

    // Modo clear puntual de compra (G): limpia y sale.
    if (clearCompra.length > 0) {
      const cleared: string[] = []
      const data: sheets_v4.Schema$ValueRange[] = []
      for (const m of clearCompra) {
        const rn = plateRow.get(m)
        if (rn) {
          data.push({ range: `${title}!G${rn}`, values: [['']] })
          cleared.push(`${m} (G${rn})`)
        }
      }
      if (!dryRun && data.length) {
        await api.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data },
        })
      }
      return NextResponse.json({
        ok: true,
        action: 'clearCompra',
        dryRun,
        confirmed,
        destructiveActions,
        cleared,
      })
    }

    const invoices = await getEmittedInvoices(year)
    const vehicleIds = invoices
      .map((invoice) => invoice.vehiculo_id)
      .filter((id): id is number => id != null)
    const costs = await loadCostsByVehicle([...new Set(vehicleIds)])

    const updates: sheets_v4.Schema$ValueRange[] = []
    const filled: string[] = []
    const plannedRanges = new Set<string>()
    for (const inv of invoices) {
      const c = inv.vehiculo_id == null ? undefined : costs.get(inv.vehiculo_id)
      if (!c) continue
      const rowNum =
        (inv.matricula && plateRow.get(normPlate(inv.matricula))) ||
        (inv.referencia && refRow.get(normRef(inv.referencia))) ||
        0
      if (!rowNum) continue
      const sheetRow = rows[rowNum - 1] ?? []
      for (const u of reconcileCostCells(sheetRow, c, mode)) {
        const range = `${title}!${u.col}${rowNum}`
        if (plannedRanges.has(range)) {
          throw new Error(`destino ambiguo en resync: ${range}`)
        }
        plannedRanges.add(range)
        updates.push({
          range,
          values: [[u.value]],
        })
        filled.push(
          `${inv.referencia || inv.matricula} ${u.col}${rowNum}=${u.value === '' ? '(limpiar)' : u.value}`
        )
      }
    }

    // 1º ESCRIBIR VALORES (las direcciones se calcularon sobre las posiciones
    // actuales; hay que escribir ANTES de mover filas o quedarían desfasadas).
    if (!dryRun && updates.length > 0) {
      await api.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
      })
    }

    // 2º reubicar ABRIL entre MARZO y MAYO (mueve la banda con sus datos ya escritos)
    let reorder: Record<string, unknown> | null = null
    if (reorderApril) {
      const abril = findBandBlock(rows, 'ABRIL')
      const mayoStart = (() => {
        for (let i = 0; i < rows.length; i++)
          if (isBand(rows[i]) && cell(rows[i], 0).toUpperCase() === 'MAYO')
            return i + 1
        return -1
      })()
      if (!abril) reorder = { error: 'banda ABRIL no encontrada' }
      else if (mayoStart < 0) reorder = { error: 'banda MAYO no encontrada' }
      else if (abril.start < mayoStart)
        reorder = { skipped: 'ABRIL ya está antes de MAYO' }
      else {
        // mover filas [abril.start, abril.end] (1-based, incl) a antes de MAYO (0-based dest = mayoStart-1)
        reorder = {
          abril,
          mayoStart,
          move: `filas ${abril.start}-${abril.end} → antes de fila ${mayoStart}`,
        }
        if (!dryRun) {
          await api.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
              requests: [
                {
                  moveDimension: {
                    source: {
                      sheetId,
                      dimension: 'ROWS',
                      startIndex: abril.start - 1,
                      endIndex: abril.end,
                    },
                    destinationIndex: mayoStart - 1,
                  },
                },
              ],
            },
          })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      year,
      tab: title,
      dryRun,
      confirmed,
      mode,
      destructiveActions,
      totalInvoices: invoices.length,
      cellsFilled: updates.length,
      filled,
      reorder,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
