/**
 * Reconstruye la traza de los renombrados del 2T 2026 que se aplicaron en
 * OneDrive pero no llegaron a `expedientes_renombres` (la función de Vercel
 * murió por timeout DESPUÉS de renombrar → archivos nuevos, cero registro).
 *
 * Compara el snapshot previo (expedientes_carpetas, tomado antes del renombrado)
 * con el listado actual del server, y registra cada par nombre_original →
 * nombre_nuevo emparejando por HASH (identidad de contenido), que es lo único
 * fiable: los nombres cambiaron justamente.
 *
 *   node scripts/backfill-renombres-2t.js            → dry-run
 *   node scripts/backfill-renombres-2t.js --apply
 */
require('dotenv').config({ path: '.env.local' })
const { execFileSync } = require('child_process')
const { Pool } = require('pg')

const APPLY = process.argv.includes('--apply')
const ANIO = 2026
const TRIMESTRE = 2
const HOST = 'root@178.104.72.37'
const BASE = `/mnt/onedrive/GESTORIA/${ANIO}/2do trimestre/Expedientes`

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
})

/** Listado actual con hash md5, leído del server. */
function listarActual() {
  const script = `
    cd "${BASE}" || exit 1
    for m in */; do
      for c in "$m"*/; do
        for f in "$c"*; do
          [ -f "$f" ] || continue
          echo "$(md5sum "$f" | cut -d' ' -f1)|$(basename "$m")|$(basename "$c")|$(basename "$f")"
        done
      done
    done`
  const out = execFileSync('ssh', ['-i', process.env.HOME + '/.ssh/id_rsa', '-o', 'StrictHostKeyChecking=no', HOST, script], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, mes, carpeta, nombre] = l.split('|')
      return { hash, mes: mes.replace(/\/$/, ''), carpeta: carpeta.replace(/\/$/, ''), nombre }
    })
}

async function main() {
  const prev = await pool.query(
    `SELECT mes, carpeta, archivos FROM expedientes_carpetas WHERE anio = $1 AND trimestre = $2`,
    [ANIO, TRIMESTRE]
  )
  // hash → nombre previo (dentro de la misma carpeta)
  const previos = new Map()
  for (const row of prev.rows) {
    for (const a of row.archivos || []) {
      if (a.hash) previos.set(`${row.carpeta}|${a.hash}`, a.nombre)
    }
  }

  const actual = listarActual()
  const pares = []
  for (const f of actual) {
    const anterior = previos.get(`${f.carpeta}|${f.hash}`)
    if (anterior && anterior !== f.nombre) {
      pares.push({ ...f, anterior })
    }
  }

  console.log(`archivos hoy: ${actual.length} · renombrados detectados: ${pares.length}\n`)
  for (const p of pares) console.log(`  [${p.mes}] ${p.carpeta}\n      ${p.anterior}\n   →  ${p.nombre}`)

  if (!APPLY) {
    console.log('\n[dry-run] nada escrito. Correr con --apply para registrar la traza.')
    await pool.end()
    return
  }

  let n = 0
  for (const p of pares) {
    const ya = await pool.query(
      `SELECT 1 FROM expedientes_renombres
        WHERE anio = $1 AND trimestre = $2 AND carpeta = $3 AND nombre_nuevo = $4`,
      [ANIO, TRIMESTRE, p.carpeta, p.nombre]
    )
    if (ya.rows.length > 0) continue
    await pool.query(
      `INSERT INTO expedientes_renombres
         (anio, trimestre, mes, carpeta, nombre_original, nombre_nuevo, hash, accion, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'renombrado', 'backfill-502')`,
      [ANIO, TRIMESTRE, p.mes, p.carpeta, p.anterior, p.nombre, p.hash]
    )
    n++
  }
  console.log(`\ntraza registrada: ${n} filas nuevas`)
  await pool.end()
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
