const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 })
;(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'sql', '0008-deal-indexes.sql'), 'utf8')
  const c = await pool.connect()
  try {
    await c.query(sql)
    console.log('✓ 0008 aplicada')
    const r = await c.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'Deal' AND indexname LIKE 'idx_deal_%'
      ORDER BY indexname
    `)
    console.log('  índices:')
    r.rows.forEach((row) => console.log('   -', row.indexname))
  } finally {
    c.release()
    await pool.end()
  }
})().catch((e) => {
  console.error('✗ Error:', e.message)
  process.exit(1)
})
