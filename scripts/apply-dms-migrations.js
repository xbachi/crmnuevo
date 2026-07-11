const { Pool } = require('pg')
const fs = require('fs')
require('dotenv').config({ path: '.env.local' })

// Migraciones de las mejoras DMS (2026-07-11, segunda tanda). Todas aditivas:
// CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — sin DELETE/UPDATE de datos.
// create-facturacion-registros.sql debe estar aplicada ANTES del deploy: el hook
// de la cadena corre en la misma transacción de emisión.
const FILES = [
  'create-facturacion-registros.sql',
  'fix-vehiculo-identidad.sql',
  'create-revision-items.sql',
  'create-firma-solicitudes.sql',
  'create-expedientes.sql',
  'create-periodos-contables.sql',
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

  // Verificación
  const checks = [
    ['facturacion_registros', `SELECT to_regclass('public.facturacion_registros') t`],
    ['Vehiculo.matricula_norm', `SELECT column_name FROM information_schema.columns WHERE table_name='Vehiculo' AND column_name='matricula_norm'`],
    ['revision_items', `SELECT to_regclass('public.revision_items') t`],
    ['firma_solicitudes', `SELECT to_regclass('public.firma_solicitudes') t`],
    ['expedientes', `SELECT to_regclass('public.expedientes') t`],
    ['periodos_contables', `SELECT to_regclass('public.periodos_contables') t`],
  ]
  console.log('\n=== verificación ===')
  for (const [name, q] of checks) {
    const r = await pool.query(q)
    const ok = r.rows.length > 0 && Object.values(r.rows[0])[0] !== null
    console.log(`${ok ? 'OK' : 'FALTA'}: ${name}`)
  }

  await pool.end()
  console.log('\nListo.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
