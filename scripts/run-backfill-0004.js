const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
  max: 1,
})

async function run() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'sql', '0004-backfill-deal-factura-from-invoices.sql'),
    'utf8'
  )

  const client = await pool.connect()
  try {
    console.log('→ Estado ANTES del backfill:')
    const before = await client.query(`
      SELECT COUNT(*)::INT AS pending
        FROM "Deal" d
        JOIN invoices i ON i.deal_id = d.id AND i.status NOT IN ('VOIDED')
       WHERE d.estado <> 'facturado' OR d.factura IS NULL OR d.factura = ''
    `)
    console.log('  Deals con factura emitida pero stale:', before.rows[0].pending)

    const sampleBefore = await client.query(`
      SELECT d.id, d.numero, d.estado, d.factura, i.full_invoice_number
        FROM "Deal" d
        JOIN invoices i ON i.deal_id = d.id AND i.status NOT IN ('VOIDED')
       WHERE d.estado <> 'facturado' OR d.factura IS NULL OR d.factura = ''
       ORDER BY d.id DESC
       LIMIT 10
    `)
    if (sampleBefore.rows.length > 0) {
      console.log('  Muestra (últimos 10):')
      sampleBefore.rows.forEach((r) =>
        console.log(
          `    #${r.id} (${r.numero}) estado=${r.estado} factura=${r.factura ?? 'NULL'} → invoice=${r.full_invoice_number}`
        )
      )
    }

    console.log('\n→ Ejecutando 0004-backfill-deal-factura-from-invoices.sql...')
    await client.query(sql)
    console.log('  ✓ SQL ejecutado')

    console.log('\n→ Estado DESPUÉS del backfill:')
    const after = await client.query(`
      SELECT COUNT(*)::INT AS pending
        FROM "Deal" d
        JOIN invoices i ON i.deal_id = d.id AND i.status NOT IN ('VOIDED')
       WHERE d.estado <> 'facturado' OR d.factura IS NULL OR d.factura = ''
    `)
    console.log('  Deals con factura emitida pero stale:', after.rows[0].pending)

    const fixed = before.rows[0].pending - after.rows[0].pending
    console.log(`\n✓ Backfill OK — ${fixed} deal(s) reparado(s).`)

    if (sampleBefore.rows.length > 0) {
      const ids = sampleBefore.rows.map((r) => r.id)
      const verify = await client.query(
        `SELECT id, numero, estado, factura, "fechaFacturada"
           FROM "Deal" WHERE id = ANY($1::int[]) ORDER BY id DESC`,
        [ids]
      )
      console.log('\n  Verificación de muestra:')
      verify.rows.forEach((r) =>
        console.log(
          `    #${r.id} (${r.numero}) estado=${r.estado} factura=${r.factura} fechaFacturada=${r.fechaFacturada?.toISOString?.() ?? r.fechaFacturada}`
        )
      )
    }
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((err) => {
  console.error('✗ Error en backfill:', err)
  process.exit(1)
})
