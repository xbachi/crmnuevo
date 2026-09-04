/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

// Runner genérico de una migración SQL aditiva (ADD COLUMN IF NOT EXISTS,
// CREATE TABLE IF NOT EXISTS, ...). Dry-run por defecto; --apply ejecuta el
// archivo entero en una transacción y luego verifica en information_schema
// las columnas que el SQL declara con ALTER TABLE ... ADD COLUMN.
//
// Uso:  node scripts/apply-sql.js add-x.sql            → muestra el SQL
//       node scripts/apply-sql.js add-x.sql --apply    → aplica y verifica
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const file = args.find((a) => !a.startsWith('--'))

if (!file) {
  console.error('Uso: node scripts/apply-sql.js <archivo.sql> [--apply]')
  process.exit(1)
}

const sqlPath = path.resolve(process.cwd(), file)
if (!fs.existsSync(sqlPath)) {
  console.error(`No existe: ${sqlPath}`)
  process.exit(1)
}
const sql = fs.readFileSync(sqlPath, 'utf8')

// Extrae pares (tabla, columna) de "ALTER TABLE t ADD COLUMN [IF NOT EXISTS] c".
function columnasDeclaradas(texto) {
  const pares = []
  const reAlter = /ALTER\s+TABLE\s+(?:ONLY\s+)?("?[\w.]+"?)([\s\S]*?);/gi
  let m
  while ((m = reAlter.exec(texto))) {
    const tabla = m[1].replace(/"/g, '').replace(/^public\./, '')
    const reCol = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)/gi
    let c
    while ((c = reCol.exec(m[2]))) {
      pares.push({ tabla, columna: c[1].replace(/"/g, '') })
    }
  }
  return pares
}

async function estado(pool, pares) {
  if (pares.length === 0) return []
  const filas = []
  for (const { tabla, columna } of pares) {
    const r = await pool.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [tabla, columna]
    )
    filas.push({
      tabla,
      columna,
      existe: r.rows.length > 0,
      tipo: r.rows[0]?.data_type ?? null,
    })
  }
  return filas
}

async function main() {
  const pares = columnasDeclaradas(sql)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: { rejectUnauthorized: false },
  })

  try {
    console.log(`=== ${path.basename(sqlPath)} ===`)
    if (pares.length > 0) {
      console.log('\n=== ANTES ===')
      console.table(await estado(pool, pares))
    }

    if (!APPLY) {
      console.log('\nDry-run. SQL que se ejecutaría:\n')
      console.log(sql)
      console.log('Corré con --apply para ejecutar.')
      return
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('COMMIT')
      console.log('\nAplicado: OK (transacción confirmada)')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    if (pares.length > 0) {
      console.log('\n=== DESPUÉS ===')
      const despues = await estado(pool, pares)
      console.table(despues)
      const faltan = despues.filter((f) => !f.existe)
      if (faltan.length > 0) {
        throw new Error(
          `Columnas no verificadas: ${faltan.map((f) => `${f.tabla}.${f.columna}`).join(', ')}`
        )
      }
      console.log('Verificación: todas las columnas declaradas existen.')
    }
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error('\nFALLÓ:', e.message)
  process.exit(1)
})
