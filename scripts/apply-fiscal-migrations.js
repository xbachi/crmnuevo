const { Pool } = require('pg')
const fs = require('fs')
require('dotenv').config({ path: '.env.local' })

// Migraciones de la base fiscal (gestoría interna, Fase 0). Todas aditivas:
// CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. El único UPDATE es el
// backfill de anio_declarado/trimestre_declarado = período natural, que sólo
// toca filas sin imputar.
//
// El orden importa: add-facturas-registro-fiscal.sql referencia proveedores(id).
//
// Uso:  node scripts/apply-fiscal-migrations.js            → sólo inspecciona
//       node scripts/apply-fiscal-migrations.js --apply    → aplica
const FILES = [
  'create-proveedores.sql',
  'add-facturas-registro-fiscal.sql',
  'create-facturas-registro-lineas.sql',
  'create-fiscal-audit.sql',
]

const APPLY = process.argv.includes('--apply')

async function estado(pool) {
  const t = await pool.query(`
    SELECT to_regclass('public.proveedores')::text              AS proveedores,
           to_regclass('public.facturas_registro_lineas')::text AS lineas,
           to_regclass('public.fiscal_audit_log')::text         AS audit`)
  const c = await pool.query(`
    SELECT count(*)::int AS n FROM information_schema.columns
     WHERE table_name = 'facturas_registro'
       AND column_name IN ('estado','base_total','proveedor_id','tipo_operacion','anio_declarado')`)
  const f = await pool.query(`SELECT count(*)::int AS n FROM facturas_registro`)
  return { ...t.rows[0], colsFiscales: `${c.rows[0].n}/5`, filasRegistro: f.rows[0].n }
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: { rejectUnauthorized: false },
  })

  try {
    console.log('=== ANTES ===')
    console.table(await estado(pool))

    if (!APPLY) {
      console.log('\nDry-run. Se aplicarían, en orden:')
      FILES.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
      console.log('\nCorré con --apply para ejecutar.')
      return
    }

    for (const file of FILES) {
      const sql = fs.readFileSync(file, 'utf8')
      process.stdout.write(`\n=== ${file} ... `)
      await pool.query(sql)
      console.log('OK')
    }

    console.log('\n=== DESPUÉS ===')
    console.table(await estado(pool))
    console.log('\nSiguiente: node scripts/backfill-proveedores.js (dry-run) y luego --apply')
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error('\nFALLÓ:', e.message)
  process.exit(1)
})
