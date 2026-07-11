/**
 * POST /api/admin/repair-costobeneficio
 *
 * Endpoint de reparación: inserta facturas de venta faltantes en la hoja CB.
 * Protegido por X-Admin-Secret (mismo que otros endpoints admin).
 *
 * Query params:
 *   - year: año a verificar (default: año actual)
 *   - month: 1..12 opcional (limita la reparación a ese mes)
 *   - tab: pestaña destino (default 'CB 2026'; NO usa el env, que está mal seteado)
 *   - dryRun: 'true' para simular sin insertar
 *
 * Responde con JSON:
 *   { ok: true, missing: Invoice[], inserted: number, failed: number, details: string[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getGoogleSheetsAuth } from '@/lib/googleSheets'
import { isInSheet } from '@/lib/facturasMonitor'
import { getEmittedInvoices, type EmittedInvoice } from '@/lib/facturasQuery'
import { AdminParamError, assertKnownParams, parseStrictBool } from '@/lib/adminParams'

const SHEET_ID = process.env.COSTOBENEFICIO_SPREADSHEET_ID || '1o0GRJKvzjiDl7dQSdRzxy6jWIT1Ll7fAIKx4yGjYhwM'
// Pestaña canónica de costo/beneficio. NO leemos COSTOBENEFICIO_SHEET_NAME acá:
// en prod está mal seteado a "2026" (otra hoja). Overridable por ?tab=.
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

async function syncInvoiceToSheet(
  inv: EmittedInvoice & { deal_id: number },
  tab: string,
  dryRun: boolean
): Promise<{ ok: boolean; detail: string }> {
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
    sheetName: tab, // fuerza la pestaña destino (ignora el env mal seteado)
    dryRun: false,
  })
  return { ok: result.ok, detail: result.detail }
}

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-admin-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  // Validación estricta de params (400 en vez de comportamiento silencioso).
  let params: { year: number; month: number | undefined; tab: string; dryRun: boolean }
  try {
    assertKnownParams(searchParams, ['year', 'month', 'tab', 'dryRun'])
    const monthRaw = searchParams.get('month')
    params = {
      year: parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10),
      month: monthRaw ? parseInt(monthRaw, 10) : undefined,
      tab: searchParams.get('tab') || DEFAULT_TAB,
      dryRun: parseStrictBool(searchParams, 'dryRun', false),
    }
  } catch (e) {
    if (e instanceof AdminParamError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
  const { year, month, tab, dryRun } = params

  const details: string[] = []
  details.push(`Año: ${year}${month ? ` · Mes: ${month}` : ''}${dryRun ? ' (DRY-RUN)' : ''}`)
  details.push(`Hoja: ${tab}`)

  try {
    // 1. Cargar facturas emitidas (status ISSUED/IMPORTED, fecha casteada a texto)
    details.push(`\n[1/4] Cargando facturas emitidas...`)
    const invoices = await getEmittedInvoices(year, month)
    details.push(`      Encontradas: ${invoices.length}`)

    // 2. Cargar filas de la hoja
    details.push(`\n[2/4] Cargando filas de "${tab}"...`)
    const sheetRows = await getSheetRows(tab)
    details.push(`      Filas: ${sheetRows.length}`)

    // 3. Detectar faltantes (dedup por matrícula col E / referencia col C)
    details.push(`\n[3/4] Detectando facturas faltantes...`)
    const missing: EmittedInvoice[] = []
    const byMonth: Record<string, EmittedInvoice[]> = {}
    for (const inv of invoices) {
      if (!isInSheet(inv, sheetRows)) {
        missing.push(inv)
        const m = inv.invoice_date.slice(0, 7)
        byMonth[m] = byMonth[m] || []
        byMonth[m].push(inv)
      }
    }

    details.push(`      Faltantes: ${missing.length}`)
    if (missing.length > 0) {
      details.push(`\n      Por mes:`)
      for (const m of Object.keys(byMonth).sort()) {
        details.push(`        ${m}: ${byMonth[m].length} facturas`)
        byMonth[m].forEach((inv) => {
          details.push(`          - ${inv.invoice_date} ${inv.full_invoice_number} ${inv.referencia || inv.matricula}`)
        })
      }
    }

    // 4. Reparar (secuencial: cada inserción desplaza filas en la hoja)
    details.push(`\n[4/4] ${dryRun ? 'Simulando' : 'Ejecutando'} reparación...`)
    let inserted = 0
    let failed = 0
    const errors: string[] = []
    for (const inv of missing) {
      if (inv.deal_id == null) {
        details.push(`      ⚠ ${inv.full_invoice_number}: sin deal asociado, no se puede reparar automáticamente`)
        errors.push(`${inv.full_invoice_number}: sin deal_id`)
        failed++
        continue
      }
      try {
        const result = await syncInvoiceToSheet(
          inv as EmittedInvoice & { deal_id: number },
          tab,
          dryRun
        )
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
      month: month ?? null,
      tab,
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
    return NextResponse.json({ ok: false, error: msg, details: details.join('\n') }, { status: 500 })
  }
}
