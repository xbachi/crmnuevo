// Aplica las migraciones de la feature de comisiones (idempotentes).
//   node scripts/apply-comisiones-migrations.js          → dry-run (solo lista)
//   node scripts/apply-comisiones-migrations.js --apply  → ejecuta
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const FILES = ['create-venta-condiciones-pago.sql', 'create-comision-config.sql']
const APPLY = process.argv.includes('--apply')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  for (const f of FILES) {
    const sql = fs.readFileSync(path.join(process.cwd(), f), 'utf8')
    console.log(`\n--- ${f} (${sql.length} bytes) ---`)
    if (!APPLY) {
      console.log('[dry-run] no ejecutado')
      continue
    }
    await pool.query(sql)
    console.log('OK aplicado')
  }

  if (APPLY) {
    const t = await pool.query(
      `SELECT to_regclass('public.venta_condiciones_pago') AS vcp,
              to_regclass('public.comision_config') AS cfg`
    )
    console.log('\ntablas:', t.rows[0])
    const c = await pool.query(`SELECT config FROM comision_config WHERE id = 1`)
    console.log('config seed:', JSON.stringify(c.rows[0]?.config))
  }
  await pool.end()
}
main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
