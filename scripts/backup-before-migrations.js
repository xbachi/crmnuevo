const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

// Backup de automation_logs antes de fix-automation-logs-unique.sql (tiene un
// DELETE de dedup). Tabla de snapshot con timestamp, nunca se borra sola.
async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: { rejectUnauthorized: false },
  })

  const stamp = process.argv[2]
  if (!stamp) {
    console.error('uso: node backup-before-migrations.js <timestamp>')
    process.exit(1)
  }
  const table = `automation_logs_bak_${stamp}`

  await pool.query(`CREATE TABLE "${table}" AS SELECT * FROM automation_logs`)
  const count = await pool.query(`SELECT COUNT(*) FROM "${table}"`)
  console.log(`Backup creado: ${table} (${count.rows[0].count} filas)`)

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
