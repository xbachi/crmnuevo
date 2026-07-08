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
import { pool } from '@/lib/direct-database'
import { google } from 'googleapis'
import { getGoogleSheetsAuth } from '@/lib/googleSheets'
import { isInSheet, parseControlFacturasRows } from '@/lib/facturasMonitor'

interface Invoice {
  full_invoice_number: string
  invoice_date: string
  invoice_type: string
  deal_number: string
  referencia: string | null
  matricula: string | null
}

const SHEET_ID = process.env.COSTOBENEFICIO_SPREADSHEET_ID || '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'
const CB_TAB = process.env.COSTOBENEFICIO_SHEET_NAME || 'CB 2026'

async function getTabRows(tab: string, range: string): Promise<string[][]> {
  const auth = await getGoogleSheetsAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!${range}`,
  })
  return res.data.values || []
}

async function getEmittedInvoices(year: number): Promise<Invoice[]> {
  const res = await pool.query<Invoice>(
    `SELECT i.full_invoice_number, i.invoice_date, i.invoice_type,
            d.numero as deal_number, v.referencia, v.matricula
     FROM invoices i
     JOIN "Deal" d ON d.id = i.deal_id
     JOIN "Vehiculo" v ON v.id = d."vehiculoId"
     WHERE i.invoice_date >= $1 AND i.invoice_date < $2
       AND i.status = 'ACTIVE'
     ORDER BY i.invoice_date`,
    [`${year}-01-01`, `${year + 1}-01-01`]
  )
  return res.rows
}

export async function GET(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-admin-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)

  try {
    // --- 1. CB 2026: facturas faltantes ---
    const invoices = await getEmittedInvoices(year)
    const cbRows = await getTabRows(CB_TAB, 'A:E')
    const missing: Invoice[] = []
    const cbByMonth: Record<string, number> = {}
    for (const inv of invoices) {
      if (!isInSheet(inv, cbRows)) {
        missing.push(inv)
        const month = inv.invoice_date.slice(0, 7)
        cbByMonth[month] = (cbByMonth[month] || 0) + 1
      }
    }

    // --- 2. Control Facturas: pendientes ---
    let control = { sArchivar: [] as { mes: string; proveedor: string }[], descargar: [] as { mes: string; proveedor: string }[] }
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
        counts: { sArchivar: control.sArchivar.length, descargar: control.descargar.length },
        sArchivar: control.sArchivar,
        descargar: control.descargar,
      },
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
