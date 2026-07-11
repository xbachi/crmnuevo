// Reporte READ-ONLY de identidad de vehículos:
// 1) grupos de "Vehiculo" con la misma matrícula normalizada (duplicados),
// 2) estados con casing/valor no canónico.
// Solo imprime, no modifica nada. Uso: node scripts/check-vehiculo-dups.js
/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

// Espejo de ESTADOS_VEHICULO en src/lib/vehiculoEstado.ts (script JS, no importa TS)
const ESTADOS_CANONICOS = [
  'SIN_ESTADO',
  'REVI_INIC',
  'MECAUTO',
  'REVI_PINTURA',
  'PINTURA',
  'LIMPIEZA',
  'FOTOS',
  'PUBLICADO',
  'RESERVADO',
  'VENDIDO',
  'DISPONIBLE',
]

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  })

  try {
    console.log('🔍 Duplicados por matrícula normalizada...\n')
    // Normalización query-time (no depende de que exista matricula_norm)
    const dups = await pool.query(`
      SELECT REPLACE(REPLACE(REPLACE(UPPER(COALESCE(matricula, '')), ' ', ''), '-', ''), '.', '') AS norm,
             COUNT(*)::int AS n,
             ARRAY_AGG(id ORDER BY id) AS ids,
             ARRAY_AGG(matricula ORDER BY id) AS matriculas,
             ARRAY_AGG(referencia ORDER BY id) AS referencias,
             ARRAY_AGG(estado ORDER BY id) AS estados
        FROM "Vehiculo"
       WHERE COALESCE(matricula, '') <> ''
       GROUP BY 1
      HAVING COUNT(*) > 1
       ORDER BY 2 DESC, 1
    `)

    if (dups.rows.length === 0) {
      console.log('✅ Sin duplicados de matrícula')
    } else {
      console.log(`❌ ${dups.rows.length} grupo(s) duplicado(s):`)
      for (const g of dups.rows) {
        console.log(`\n  ${g.norm} (${g.n} filas)`)
        g.ids.forEach((id, i) => {
          console.log(
            `    - id=${id} matricula=${JSON.stringify(g.matriculas[i])} ref=${g.referencias[i]} estado=${JSON.stringify(g.estados[i])}`
          )
        })
      }
    }

    console.log('\n🔍 Estados con valor/casing no canónico...\n')
    const estados = await pool.query(`
      SELECT COALESCE(estado, '(null)') AS estado, COUNT(*)::int AS n
        FROM "Vehiculo"
       GROUP BY 1
       ORDER BY 2 DESC
    `)

    const noCanonicos = estados.rows.filter(
      (r) => !ESTADOS_CANONICOS.includes(r.estado)
    )
    if (noCanonicos.length === 0) {
      console.log('✅ Todos los estados son canónicos')
    } else {
      console.log('❌ Estados no canónicos encontrados:')
      for (const r of noCanonicos) {
        const sugerido = ESTADOS_CANONICOS.find(
          (c) => c === String(r.estado).trim().toUpperCase()
        )
        console.log(
          `  - ${JSON.stringify(r.estado)} × ${r.n}${sugerido ? `  → canónico: ${sugerido}` : ''}`
        )
      }
    }

    console.log('\nResumen de estados:')
    for (const r of estados.rows) {
      console.log(`  ${JSON.stringify(r.estado)}: ${r.n}`)
    }
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
