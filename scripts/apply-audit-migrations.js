const { Pool } = require('pg')
const fs = require('fs')
require('dotenv').config({ path: '.env.local' })

// Aplica las migraciones nuevas de la auditoría, en orden de dependencia.
// fix-automation-logs-unique.sql DEBE ir antes del deploy que usa ON CONFLICT.
const FILES = [
  'fix-automation-logs-unique.sql',
  'fix-gasto-facturas-dedup.sql',
  'create-webhook-outbox.sql',
  'fix-costobeneficio-logs-columns.sql',
]

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: { rejectUnauthorized: false },
  })

  for (const file of FILES) {
    const sql = fs.readFileSync(file, 'utf8')
    console.log(`\n=== ${file} ===`)
    try {
      await pool.query(sql)
      console.log(`OK: ${file}`)
    } catch (err) {
      console.error(`FALLO en ${file}: ${err.message}`)
      await pool.end()
      process.exit(1)
    }
  }

  await pool.end()
  console.log('\nTodas las migraciones aplicadas.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
