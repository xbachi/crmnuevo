const { Pool } = require('pg')
const fs = require('fs')
require('dotenv').config({ path: '.env.local' })

// Tabla de dedup/registro de avisos por email al inversor (reserva/venta).
// Aditiva e idempotente (CREATE TABLE IF NOT EXISTS).
//
// Uso:  node scripts/apply-inversor-notificaciones.js            → inspecciona
//       node scripts/apply-inversor-notificaciones.js --apply    → aplica

const APPLY = process.argv.includes('--apply')

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: { rejectUnauthorized: false },
  })
  try {
    const t = await pool.query(
      `SELECT to_regclass('public.inversor_notificaciones')::text AS tabla`
    )
    console.log('Estado:', t.rows[0])
    if (!APPLY) return console.log('(inspección; usar --apply para aplicar)')

    const sql = fs.readFileSync('create-inversor-notificaciones.sql', 'utf8')
    await pool.query(sql)
    const t2 = await pool.query(
      `SELECT to_regclass('public.inversor_notificaciones')::text AS tabla`
    )
    console.log('Aplicada:', t2.rows[0])
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
