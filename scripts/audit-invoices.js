#!/usr/bin/env node
/**
 * Read-only diagnostic for the invoicing module.
 *
 * Loads DATABASE_URL from .env.local (gitignored) and reports:
 *   - which invoice-related tables exist
 *   - whether the new module's tables (invoices, invoice_sequences,
 *     invoice_audit_logs) are already present
 *   - what invoice numbers are currently stored in Deal.factura
 *   - whether any rows would be picked up by the backfill
 *
 * Safe to run before AND after the migration. Never mutates data.
 *
 * Usage (PowerShell):
 *   node scripts/audit-invoices.js
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvLocal()

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Put it in .env.local.')
  process.exit(1)
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()
  console.log('=== INVOICE MODULE AUDIT ===\n')

  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (
        table_name ILIKE '%factura%' OR
        table_name ILIKE '%invoice%' OR
        table_name ILIKE 'Accounting%'
      )
    ORDER BY table_name
  `)

  console.log('1. Tables matching factura/invoice/Accounting:')
  if (tablesRes.rows.length === 0) {
    console.log('   (none)')
  } else {
    for (const t of tablesRes.rows) {
      const cnt = await client.query(`SELECT COUNT(*)::int AS c FROM "${t.table_name}"`)
      console.log(`   - ${t.table_name} (${cnt.rows[0].c} rows)`)
    }
  }

  const newTables = ['invoices', 'invoice_sequences', 'invoice_audit_logs']
  console.log('\n2. New module tables:')
  for (const name of newTables) {
    const exists = await client.query(
      `SELECT to_regclass($1) IS NOT NULL AS exists`,
      [`public.${name}`]
    )
    console.log(`   - ${name}: ${exists.rows[0].exists ? 'EXISTS' : 'missing'}`)
  }

  // If invoice_sequences exists, dump it
  const seqExists = await client.query(
    `SELECT to_regclass('public.invoice_sequences') IS NOT NULL AS exists`
  )
  if (seqExists.rows[0].exists) {
    const seq = await client.query(
      `SELECT id, invoice_type, series, year, next_number, number_format, is_active
       FROM invoice_sequences ORDER BY id`
    )
    console.log('\n3. invoice_sequences contents:')
    for (const r of seq.rows) {
      console.log(
        `   #${r.id} ${r.invoice_type} series=${r.series} next=${r.next_number} fmt=${r.number_format} active=${r.is_active}`
      )
    }
  }

  // If invoices exists, summarize
  const invExists = await client.query(
    `SELECT to_regclass('public.invoices') IS NOT NULL AS exists`
  )
  if (invExists.rows[0].exists) {
    const counts = await client.query(`
      SELECT status, COUNT(*)::int AS c
      FROM invoices
      GROUP BY status
      ORDER BY status
    `)
    console.log('\n4. invoices count by status:')
    if (counts.rows.length === 0) {
      console.log('   (no rows)')
    } else {
      for (const r of counts.rows) console.log(`   - ${r.status}: ${r.c}`)
    }

    const recent = await client.query(`
      SELECT id, full_invoice_number, invoice_type, series, number, status,
             invoice_date, deal_id
      FROM invoices
      ORDER BY id DESC
      LIMIT 10
    `)
    console.log('\n5. Last 10 invoices:')
    for (const r of recent.rows) {
      console.log(
        `   ${r.full_invoice_number}  ${r.invoice_type}  ${r.status}  date=${r.invoice_date?.toISOString?.()?.slice(0, 10) ?? r.invoice_date}  deal=${r.deal_id}`
      )
    }
  }

  // Deal.factura snapshot (legacy data we might backfill)
  const dealFacturaCount = await client.query(`
    SELECT COUNT(*)::int AS c
    FROM "Deal"
    WHERE factura IS NOT NULL AND TRIM(factura) <> ''
  `)
  console.log(
    `\n6. Deal.factura non-null rows (backfill candidates): ${dealFacturaCount.rows[0].c}`
  )

  if (dealFacturaCount.rows[0].c > 0) {
    const sampleFacturas = await client.query(`
      SELECT id, numero, factura, "fechaFacturada", "importeTotal", estado
      FROM "Deal"
      WHERE factura IS NOT NULL AND TRIM(factura) <> ''
      ORDER BY "fechaFacturada" DESC NULLS LAST, id DESC
      LIMIT 10
    `)
    console.log('   Sample (most recent 10):')
    for (const d of sampleFacturas.rows) {
      console.log(
        `     deal#${d.id} numero=${d.numero} factura=${d.factura} estado=${d.estado} importe=${d.importeTotal} fechaFacturada=${d.fechaFacturada?.toISOString?.()?.slice(0, 10) ?? d.fechaFacturada}`
      )
    }

    // Try to detect the highest manual invoice number per series prefix
    const patternCount = await client.query(`
      SELECT
        CASE
          WHEN factura ~ '^F-\\d{4}-\\d+' THEN substring(factura FROM '^F-\\d{4}')
          WHEN factura ~ '^R-\\d{4}-\\d+' THEN substring(factura FROM '^R-\\d{4}')
          ELSE 'OTHER'
        END AS pattern_prefix,
        COUNT(*)::int AS c
      FROM "Deal"
      WHERE factura IS NOT NULL AND TRIM(factura) <> ''
      GROUP BY pattern_prefix
      ORDER BY c DESC
    `)
    console.log('   Pattern prefixes detected:')
    for (const p of patternCount.rows) {
      console.log(`     ${p.pattern_prefix}: ${p.c}`)
    }
  }

  await client.end()
  console.log('\n=== DONE ===')
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
