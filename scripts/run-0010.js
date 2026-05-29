const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 })
;(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'sql', '0010-invoice-deletion-reuse.sql'), 'utf8')
  const c = await pool.connect()
  try {
    await c.query(sql)
    console.log('✓ 0010 aplicada')
    const col = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='invoice_sequences' AND column_name='start_number'`)
    console.log('  invoice_sequences.start_number:', col.rows.length === 1 ? 'OK' : 'MISSING')
    const tbl = await c.query(`SELECT to_regclass('public.invoice_deletion_logs') AS t`)
    console.log('  invoice_deletion_logs table:', tbl.rows[0].t ? 'OK' : 'MISSING')
    const seqs = await c.query(`SELECT invoice_type, series, next_number, start_number FROM invoice_sequences ORDER BY id`)
    for (const r of seqs.rows) console.log(`  ${r.invoice_type} ${r.series}: next=${r.next_number} start=${r.start_number}`)
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error(e); process.exit(1) })
