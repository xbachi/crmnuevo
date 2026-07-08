/**
 * Script de reparación: inserta facturas de venta faltantes en CB 2026.
 *
 * Busca todas las facturas emitidas que NO están en la hoja CB 2026 y las
 * inserta llamando a syncCostoBeneficio. Reporta lo que falta vs lo que se
 * sincroniza exitosamente.
 *
 * Uso:
 *   npx tsx scripts/repair-costobeneficio.ts [--year YYYY] [--dry-run]
 */

import { pool } from '@/lib/direct-database'
import { google } from 'googleapis'
import { getGoogleSheetsAuth } from '@/lib/googleSheets'
import { notifyCostoBeneficio } from '@/lib/costoBeneficio'
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

async function main() {
  const args = process.argv.slice(2)
  const yearArg = args.find((a) => a.startsWith('--year='))
  const year = yearArg ? parseInt(yearArg.split('=')[1], 10) : new Date().getFullYear()
  const dryRun = args.includes('--dry-run')

  console.log(`[repair-costobeneficio] Año: ${year}${dryRun ? ' (DRY-RUN)' : ''}`)
  console.log(`[repair-costobeneficio] Hoja: ${SHEET_NAME} en ${SHEET_ID.slice(0, 20)}...`)

  // 1. Cargar facturas emitidas de la DB
  console.log(`\n[1/4] Cargando facturas emitidas en ${year}...`)
  const invoices = await getEmittedInvoices(year)
  console.log(`      Encontradas: ${invoices.length}`)

  // 2. Cargar filas de la hoja
  console.log(`\n[2/4] Cargando filas de "${SHEET_NAME}"...`)
  const sheetRows = await getSheetRows()
  console.log(`      Filas: ${sheetRows.length}`)

  // 3. Detectar faltantes
  console.log(`\n[3/4] Detectando facturas faltantes...`)
  const missing: Invoice[] = []
  const byMonth: Record<string, Invoice[]> = {}

  for (const inv of invoices) {
    if (!isInSheet(inv, sheetRows)) {
      missing.push(inv)
      const month = inv.invoice_date.slice(0, 7) // YYYY-MM
      byMonth[month] = byMonth[month] || []
      byMonth[month].push(inv)
    }
  }

  console.log(`      Faltantes: ${missing.length}`)
  if (missing.length === 0) {
    console.log(`\n✅ Todas las facturas de ${year} están en CB 2026.`)
    await pool.end()
    return
  }

  console.log(`\n      Por mes:`)
  for (const month of Object.keys(byMonth).sort()) {
    console.log(`        ${month}: ${byMonth[month].length} facturas`)
    byMonth[month].forEach((inv) => {
      console.log(`          - ${inv.invoice_date} ${inv.full_invoice_number} ${inv.referencia || inv.matricula} (deal ${inv.deal_number})`)
    })
  }

  // 4. Reparar (insertar)
  console.log(`\n[4/4] ${dryRun ? 'Simulando' : 'Ejecutando'} reparación...`)
  let inserted = 0
  let failed = 0

  for (const inv of missing) {
    try {
      if (dryRun) {
        console.log(`      [DRY-RUN] Insertaría: ${inv.full_invoice_number}`)
        inserted++
      } else {
        console.log(`      Insertando: ${inv.full_invoice_number}...`)
        await notifyCostoBeneficio({
          dealId: inv.deal_id,
          numeroFactura: inv.full_invoice_number,
          invoiceType: inv.invoice_type,
          invoiceDate: inv.invoice_date,
          salePrice: inv.total_amount,
          dryRun: false,
        })
        inserted++
        console.log(`      ✓ Insertado`)
      }
    } catch (err) {
      console.error(`      ✗ Error: ${(err as Error).message}`)
      failed++
    }
  }

  console.log(`\n✅ Reparación completada:`)
  console.log(`   - Insertadas: ${inserted}`)
  console.log(`   - Fallidas: ${failed}`)
  console.log(`   - Total faltantes: ${missing.length}`)

  await pool.end()
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
