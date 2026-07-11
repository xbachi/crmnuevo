/**
 * GET /api/admin/check-costobeneficio
 *
 * Endpoint de monitoreo: verifica que todas las facturas emitidas estén en CB 2026.
 * Protegido por X-Admin-Secret. NO inserta nada, solo reporta inconsistencias.
 *
 * Query params:
 *   - year: año a verificar (default: año actual)
 *   - tab: pestaña destino (default 'CB 2026')
 *
 * Responde con JSON:
 *   { ok: boolean, missing: Invoice[], summary: { total, inSheet, missing } }
 *
 * Se puede llamar desde un cron diario para alertar si hay desincronización.
 */

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getGoogleSheetsAuth } from '@/lib/googleSheets'
import { isInSheet } from '@/lib/facturasMonitor'
import { getEmittedInvoices, type EmittedInvoice } from '@/lib/facturasQuery'

const SHEET_ID =
  process.env.COSTOBENEFICIO_SPREADSHEET_ID ||
  '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'
const DEFAULT_TAB = 'CB 2026'

async function getSheetRows(tab: string): Promise<string[][]> {
  const auth = await getGoogleSheetsAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A:E`,
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
  const tab = searchParams.get('tab') || DEFAULT_TAB

  try {
    const invoices = await getEmittedInvoices(year)
    const sheetRows = await getSheetRows(tab)

    const missing: EmittedInvoice[] = []
    const byMonth: Record<string, number> = {}
    for (const inv of invoices) {
      if (!isInSheet(inv, sheetRows)) {
        missing.push(inv)
        const month = inv.invoice_date.slice(0, 7)
        byMonth[month] = (byMonth[month] || 0) + 1
      }
    }

    return NextResponse.json({
      ok: missing.length === 0,
      summary: {
        year,
        tab,
        total: invoices.length,
        inSheet: invoices.length - missing.length,
        missing: missing.length,
        byMonth,
      },
      missing: missing.map((inv) => ({
        date: inv.invoice_date,
        number: inv.full_invoice_number,
        ref: inv.referencia,
        plate: inv.matricula,
        dealNumber: inv.deal_number,
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
