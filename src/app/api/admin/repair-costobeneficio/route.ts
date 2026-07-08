/**
 * POST /api/admin/repair-costobeneficio
 *
 * Endpoint de reparación: inserta facturas de venta faltantes en CB 2026.
 * Protegido por X-Admin-Secret (mismo que otros endpoints admin).
 *
 * Query params:
 *   - year: año a verificar (default: año actual)
 *   - dryRun: 'true' para simular sin insertar
 *
 * Responde con JSON:
 *   { ok: true, missing: Invoice[], inserted: number, failed: number, details: string[] }
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

// Función syncCostoBeneficio inline para evitar timeout del wrapper
async function syncInvoiceToSheet(inv: Invoice, dryRun: boolean): Promise<{ ok: boolean; detail: string }> {
  if (dryRun) {
    return { ok: true, detail: `[DRY-RUN] insertaría ${inv.full_invoice_number}` }
  }

  const { syncCostoBeneficio } = await import('@/lib/costoBeneficio')
  const result = await syncCostoBeneficio({
    dealId: inv.deal_id,
    numeroFactura: inv.full_invoice_number,
    invoiceType: inv.invoice_type,
    invoiceDate: inv.invoice_date,
    salePrice: inv.total_amount,
    dryRun: false,
  })

  return { ok: result.ok, detail: result.detail }
}

export async function POST(request: NextRequest) {
  // Auth
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-admin-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)
  const dryRun = searchParams.get('dryRun') === 'true'

  const details: string[] = []
  details.push(`Año: ${year}${dryRun ? ' (DRY-RUN)' : ''}`)
  details.push(`Hoja: ${SHEET_NAME}`)

  try {
    // 1. Cargar facturas emitidas
    details.push(`\n[1/4] Cargando facturas emitidas...`)
    const invoices = await getEmittedInvoices(year)
    details.push(`      Encontradas: ${invoices.length}`)

    // 2. Cargar filas de la hoja
    details.push(`\n[2/4] Cargando filas de "${SHEET_NAME}"...`)
    const sheetRows = await getSheetRows()
    details.push(`      Filas: ${sheetRows.length}`)

    // 3. Detectar faltantes
    details.push(`\n[3/4] Detectando facturas faltantes...`)
    const missing: Invoice[] = []
    const byMonth: Record<string, Invoice[]> = {}

    for (const inv of invoices) {
      if (!isInSheet(inv, sheetRows)) {
        missing.push(inv)
        const month = inv.invoice_date.slice(0, 7)
        byMonth[month] = byMonth[month] || []
        byMonth[month].push(inv)
      }
    }

    details.push(`      Faltantes: ${missing.length}`)
    if (missing.length > 0) {
      details.push(`\n      Por mes:`)
      for (const month of Object.keys(byMonth).sort()) {
        details.push(`        ${month}: ${byMonth[month].length} facturas`)
        byMonth[month].forEach((inv) => {
          details.push(`          - ${inv.invoice_date} ${inv.full_invoice_number} ${inv.referencia || inv.matricula}`)
        })
      }
    }

    // 4. Reparar
    details.push(`\n[4/4] ${dryRun ? 'Simulando' : 'Ejecutando'} reparación...`)
    let inserted = 0
    let failed = 0
    const errors: string[] = []

    for (const inv of missing) {
      try {
        const result = await syncInvoiceToSheet(inv, dryRun)
        if (result.ok) {
          details.push(`      ✓ ${inv.full_invoice_number}: ${result.detail}`)
          inserted++
        } else {
          details.push(`      ✗ ${inv.full_invoice_number}: ${result.detail}`)
          errors.push(`${inv.full_invoice_number}: ${result.detail}`)
          failed++
        }
      } catch (err) {
        const msg = (err as Error).message
        details.push(`      ✗ ${inv.full_invoice_number}: ERROR ${msg}`)
        errors.push(`${inv.full_invoice_number}: ${msg}`)
        failed++
      }
    }

    details.push(`\n✅ Completado:`)
    details.push(`   - Insertadas: ${inserted}`)
    details.push(`   - Fallidas: ${failed}`)
    details.push(`   - Total faltantes: ${missing.length}`)

    return NextResponse.json({
      ok: true,
      year,
      dryRun,
      totalInvoices: invoices.length,
      missing: missing.map((inv) => ({
        date: inv.invoice_date,
        number: inv.full_invoice_number,
        ref: inv.referencia,
        plate: inv.matricula,
      })),
      inserted,
      failed,
      errors,
      details: details.join('\n'),
    })
  } catch (err) {
    const msg = (err as Error).message
    details.push(`\n❌ Error fatal: ${msg}`)
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        details: details.join('\n'),
      },
      { status: 500 }
    )
  }
}
