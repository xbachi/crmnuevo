/**
 * GET /api/admin/check-facturas?year=2026
 *
 * Check UNIFICADO (una sola llamada diaria) de facturas en Google Sheets:
 *  1. CB 2026: facturas de venta emitidas que NO están en la hoja.
 *  2. Control Facturas: recurrentes de proveedor en estado 's/archivar'
 *     (llegó el PDF, falta guardarlo) o 'descargar' (entrar al portal).
 *
 * Protegido por X-Admin-Secret. Sólo lee/reporta; no escribe nada.
 * Pensado para un cron diario que alerte si `ok === false`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getGoogleSheetsAuth } from '@/lib/googleSheets'
import { isInSheet, parseControlFacturasRows } from '@/lib/facturasMonitor'
import { getEmittedInvoices, type EmittedInvoice } from '@/lib/facturasQuery'

const SHEET_ID =
  process.env.COSTOBENEFICIO_SPREADSHEET_ID ||
  '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'
const DEFAULT_CB_TAB = 'CB 2026'

async function getTabRows(tab: string, range: string): Promise<string[][]> {
  const auth = await getGoogleSheetsAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!${range}`,
  })
  return res.data.values || []
}

export async function GET(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? ''
  const got = request.headers.get('x-admin-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(
    searchParams.get('year') || String(new Date().getFullYear()),
    10
  )
  const CB_TAB = searchParams.get('tab') || DEFAULT_CB_TAB
  const debugRows = searchParams.get('debug') === 'rows' // dump crudo de la hoja (auditoría)

  try {
    // --- 1. CB 2026: facturas faltantes ---
    const invoices = await getEmittedInvoices(year)
    const cbRows = await getTabRows(CB_TAB, 'A:E')
    const missing: EmittedInvoice[] = []
    const cbByMonth: Record<string, number> = {}
    for (const inv of invoices) {
      if (!isInSheet(inv, cbRows)) {
        missing.push(inv)
        const month = inv.invoice_date.slice(0, 7)
        cbByMonth[month] = (cbByMonth[month] || 0) + 1
      }
    }

    // --- 2. Control Facturas: pendientes ---
    let control = {
      sArchivar: [] as { mes: string; proveedor: string }[],
      descargar: [] as { mes: string; proveedor: string }[],
    }
    let controlError: string | null = null
    try {
      const ctrlRows = await getTabRows(`Control Facturas ${year}`, 'A:E')
      control = parseControlFacturasRows(ctrlRows)
    } catch (err) {
      controlError = (err as Error).message // la pestaña puede no existir aún
    }

    // ok = sin facturas faltantes en CB Y sin PDFs sin archivar (s/archivar).
    // 'descargar' es informativo (siempre requiere acción manual en el portal).
    const ok = missing.length === 0 && control.sArchivar.length === 0

    return NextResponse.json({
      ok,
      year,
      costoBeneficio: {
        ok: missing.length === 0,
        total: invoices.length,
        inSheet: invoices.length - missing.length,
        missing: missing.length,
        byMonth: cbByMonth,
        detail: missing.map((inv) => ({
          date: inv.invoice_date,
          number: inv.full_invoice_number,
          ref: inv.referencia,
          plate: inv.matricula,
          dealNumber: inv.deal_number,
        })),
      },
      controlFacturas: {
        ok: control.sArchivar.length === 0,
        error: controlError,
        counts: {
          sArchivar: control.sArchivar.length,
          descargar: control.descargar.length,
        },
        sArchivar: control.sArchivar,
        descargar: control.descargar,
      },
      // Debug opcional (?debug=rows): filas crudas A:S de CB (incluye columnas de costo).
      ...(debugRows ? { cbRowsRaw: await getTabRows(CB_TAB, 'A:S') } : {}),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
