/**
 * GET /api/admin/check-costobeneficio
 *
 * Endpoint de monitoreo: verifica que todas las facturas emitidas estén en CB 2026.
 * Protegido por X-Admin-Secret. NO inserta nada, solo reporta inconsistencias.
 *
 * Query params:
 *   - year: año a verificar (default: año actual)
 *
 * Responde con JSON:
 *   { ok: boolean, missing: Invoice[], summary: { total, inSheet, missing } }
 *
 * Se puede llamar desde un cron diario para alertar si hay desincronización.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { google } from 'googleapis'
import { getGoogleSheetsAuth } from '@/lib/googleSheets'
import { normPlate, normRef } from '@/lib/costoBeneficioSheet'

interface Invoice {
  id: number
  full_invoice_number: string
  invoice_date: string
  invoice_type: string
  total_amount: number
  deal_id: number
  deal_number: string
  referencia: string | null
  matricula: string | null
}

const SHEET_ID = process.env.COSTOBENEFICIO_SPREADSHEET_ID || '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'
const SHEET_NAME = process.env.COSTOBENEFICIO_SHEET_NAME || 'CB 2026'

async function getSheetRows(): Promise<string[][]> {
  const auth = await getGoogleSheetsAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:E`,
  })
  return res.data.values || []
}

async function getEmittedInvoices(year: number): Promise<Invoice[]> {
  const res = await pool.query<Invoice>(
    `SELECT i.id, i.full_invoice_number, i.invoice_date, i.invoice_type, i.total_amount, i.deal_id,
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

function isInSheet(inv: Invoice, rows: string[][]): boolean {
  const plate = inv.matricula ? normPlate(inv.matricula) : null
  const ref = inv.referencia ? normRef(inv.referencia) : null

  for (const row of rows) {
    const sheetPlate = row[4] ? normPlate(row[4]) : null
    const sheetRef = row[2] ? normRef(row[2]) : null

    if (plate && sheetPlate && plate === sheetPlate) return true
    if (ref && sheetRef && ref === sheetRef) return true
  }
  return false
}

export async function GET(request: NextRequest) {
  // Auth
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-admin-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)

  try {
    const invoices = await getEmittedInvoices(year)
    const sheetRows = await getSheetRows()

    const missing: Invoice[] = []
    const byMonth: Record<string, number> = {}

    for (const inv of invoices) {
      if (!isInSheet(inv, sheetRows)) {
        missing.push(inv)
        const month = inv.invoice_date.slice(0, 7)
        byMonth[month] = (byMonth[month] || 0) + 1
      }
    }

    const summary = {
      year,
      total: invoices.length,
      inSheet: invoices.length - missing.length,
      missing: missing.length,
      byMonth,
    }

    return NextResponse.json({
      ok: missing.length === 0,
      summary,
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
      {
        ok: false,
        error: (err as Error).message,
      },
      { status: 500 }
    )
  }
}
