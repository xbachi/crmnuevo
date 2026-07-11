const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } })
  const stamp = process.argv[2]
  if (!stamp) { console.error('uso: node backup-gasto-facturas.js <timestamp>'); process.exit(1) }
  const table = `gasto_facturas_bak_${stamp}`
  await pool.query(`CREATE TABLE "${table}" AS SELECT * FROM gasto_facturas`)
  const c = await pool.query(`SELECT COUNT(*) FROM "${table}"`)
  console.log(`Backup: ${table} (${c.rows[0].count} filas)`)
  await pool.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
