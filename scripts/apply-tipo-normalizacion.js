const { Pool } = require('pg')
const fs = require('fs')
require('dotenv').config({ path: '.env.local' })

// Normalización de "Vehiculo".tipo a letra canónica ('C','I','D','R'; 'M' se
// preserva). Ver fix-vehiculo-tipo-normalizacion.sql. Idempotente, no borra filas.
//
// Uso:  node scripts/apply-tipo-normalizacion.js            → sólo inspecciona
//       node scripts/apply-tipo-normalizacion.js --apply    → aplica

const APPLY = process.argv.includes('--apply')

async function distribucion(pool) {
  const r = await pool.query(`
    SELECT tipo, COUNT(*)::int AS n,
           COUNT(*) FILTER (WHERE "esCocheInversor")::int AS inv
    FROM "Vehiculo" GROUP BY tipo ORDER BY tipo`)
  return r.rows
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: { rejectUnauthorized: false },
  })
  try {
    console.log('Distribución actual:')
    console.table(await distribucion(pool))

    if (!APPLY) return console.log('(inspección; usar --apply para aplicar)')

    const sql = fs.readFileSync('fix-vehiculo-tipo-normalizacion.sql', 'utf8')
    await pool.query(sql)

    console.log('Migración aplicada. Distribución final:')
    console.table(await distribucion(pool))

    const raras = await pool.query(`
      SELECT tipo, COUNT(*)::int AS n FROM "Vehiculo"
      WHERE tipo IS NOT NULL AND tipo NOT IN ('C','I','D','R','M')
      GROUP BY tipo`)
    console.log('Variantes no mapeadas (esperado []):', raras.rows)
    const huerfanos = await pool.query(`
      SELECT id, referencia FROM "Vehiculo"
      WHERE tipo = 'I' AND "inversorId" IS NULL`)
    console.log('Inversor sin inversorId (esperado []):', huerfanos.rows)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
