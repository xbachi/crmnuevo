const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 })
;(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'sql', '0006-invoices-b2b-link.sql'), 'utf8')
  const c = await pool.connect()
  try {
    await c.query(sql)
    console.log('✓ 0006 aplicada')
    const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='invoices' AND column_name='b2b_venta_id'`)
    console.log('  b2b_venta_id column:', r.rows.length === 1 ? 'OK' : 'MISSING')
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error(e); process.exit(1) })
