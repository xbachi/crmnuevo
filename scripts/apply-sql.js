/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
const {
  sha256,
  tieneDirectivaNoTransaccion,
  separarSentencias,
  columnasDeclaradas,
  indicesDeclarados,
} = require('./lib/sqlUtils')

const REPO_ROOT = path.resolve(__dirname, '..')
require('dotenv').config({ path: path.join(REPO_ROOT, '.env.local') })

// Runner de migraciones SQL aditivas (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF
// NOT EXISTS, CREATE INDEX ...). Dry-run por defecto; --apply ejecuta el archivo
// en una transacción (o sentencia a sentencia si la primera línea es
// `-- apply-sql: no-transaction`, necesario para CREATE INDEX CONCURRENTLY),
// verifica columnas/índices declarados y deja constancia en schema_migrations.
//
// Uso:  node scripts/apply-sql.js add-x.sql            → dry-run (muestra el SQL)
//       node scripts/apply-sql.js add-x.sql --apply    → aplica, verifica y registra
//       node scripts/apply-sql.js --status             → estado de todos los .sql del repo
//       node scripts/apply-sql.js --backfill           → registra (sin ejecutar) los .sql sin fila
//       node scripts/apply-sql.js --check-columns Deal.clienteId,depositos.created_at
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const SQL_DIRS = ['', 'scripts/sql']
const NOTA_BACKFILL =
  'backfill 2026-09: aplicado manualmente antes del registro'

function valorFlag(nombre) {
  const conIgual = args.find((a) => a.startsWith(`${nombre}=`))
  if (conIgual) return conIgual.slice(nombre.length + 1)
  const i = args.indexOf(nombre)
  return i >= 0 ? args[i + 1] : undefined
}

// Clave en schema_migrations: ruta relativa al repo con separadores posix.
function claveMigracion(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/')
}

function listarSqlRepo() {
  const out = []
  for (const dir of SQL_DIRS) {
    const abs = path.join(REPO_ROOT, dir)
    if (!fs.existsSync(abs)) continue
    const files = fs
      .readdirSync(abs)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    for (const f of files) out.push(path.posix.join(dir, f))
  }
  return out
}

function checksumDe(relPath) {
  return sha256(fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8'))
}

function fecha(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d)
}

async function existeRegistro(q) {
  const r = await q.query(`SELECT to_regclass('public.schema_migrations') AS t`)
  return r.rows[0].t !== null
}

async function registrarAplicada(q, filename, checksum) {
  await q.query(
    `INSERT INTO schema_migrations (filename, checksum, applied_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (filename) DO UPDATE
       SET checksum = EXCLUDED.checksum,
           applied_at = now(),
           applied_by = EXCLUDED.applied_by`,
    [filename, checksum, process.env.USER ?? 'apply-sql']
  )
}

async function estadoColumnas(pool, pares) {
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

async function estadoIndices(pool, nombres) {
  if (nombres.length === 0) return []
  const r = await pool.query(
    `SELECT c.relname AS nombre, i.indisvalid AS valido
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
    [nombres]
  )
  const porNombre = new Map(r.rows.map((x) => [x.nombre, x.valido]))
  return nombres.map((nombre) => ({
    indice: nombre,
    existe: porNombre.has(nombre),
    valido: porNombre.get(nombre) ?? null,
  }))
}

// ---------- modo archivo (dry-run / --apply) ----------

async function ejecutarSql(pool, sql) {
  const client = await pool.connect()
  try {
    if (tieneDirectivaNoTransaccion(sql)) {
      const sentencias = separarSentencias(sql)
      console.log(`\nModo sin transacción: ${sentencias.length} sentencias`)
      for (let i = 0; i < sentencias.length; i++) {
        try {
          await client.query(sentencias[i])
        } catch (e) {
          const cabecera = sentencias[i].split('\n')[0]
          throw new Error(
            `sentencia ${i + 1}/${sentencias.length} falló (las anteriores quedaron aplicadas): ${e.message}\n  → ${cabecera}`
          )
        }
      }
      console.log('Aplicado: OK (sentencia a sentencia, sin transacción)')
      return
    }
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('COMMIT')
      console.log('\nAplicado: OK (transacción confirmada)')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
  } finally {
    client.release()
  }
}

async function modoArchivo(pool, file) {
  const sqlPath = path.resolve(process.cwd(), file)
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`No existe: ${sqlPath}`)
  }
  const sql = fs.readFileSync(sqlPath, 'utf8')
  const pares = columnasDeclaradas(sql)
  const indices = indicesDeclarados(sql)
  const clave = claveMigracion(sqlPath)

  console.log(`=== ${clave} ===`)
  if (pares.length > 0) {
    console.log('\n=== ANTES (columnas) ===')
    console.table(await estadoColumnas(pool, pares))
  }
  if (indices.length > 0) {
    console.log('\n=== ANTES (índices) ===')
    console.table(await estadoIndices(pool, indices))
  }

  if (!APPLY) {
    const modo = tieneDirectivaNoTransaccion(sql)
      ? `sin transacción, ${separarSentencias(sql).length} sentencias`
      : 'una transacción'
    console.log(`\nDry-run (${modo}). SQL que se ejecutaría:\n`)
    console.log(sql)
    console.log('Corré con --apply para ejecutar.')
    return
  }

  await ejecutarSql(pool, sql)

  if (pares.length > 0) {
    console.log('\n=== DESPUÉS (columnas) ===')
    const despues = await estadoColumnas(pool, pares)
    console.table(despues)
    const faltan = despues.filter((f) => !f.existe)
    if (faltan.length > 0) {
      throw new Error(
        `Columnas no verificadas: ${faltan.map((f) => `${f.tabla}.${f.columna}`).join(', ')}`
      )
    }
    console.log('Verificación: todas las columnas declaradas existen.')
  }
  if (indices.length > 0) {
    console.log('\n=== DESPUÉS (índices) ===')
    const despues = await estadoIndices(pool, indices)
    console.table(despues)
    const mal = despues.filter((f) => !f.existe || f.valido === false)
    if (mal.length > 0) {
      throw new Error(
        `Índices no verificados (inexistentes o INVALID; un CONCURRENTLY fallido deja el índice inválido y IF NOT EXISTS lo saltea: DROP INDEX y reintentar): ${mal.map((f) => f.indice).join(', ')}`
      )
    }
    console.log(
      'Verificación: todos los índices declarados existen y son válidos.'
    )
  }

  if (!(await existeRegistro(pool))) {
    console.warn(
      '\nAVISO: schema_migrations no existe; no se registró la migración (aplicá create-schema-migrations.sql).'
    )
    return
  }
  await registrarAplicada(pool, clave, sha256(sql))
  console.log(`Registrado en schema_migrations: ${clave}`)
}

// ---------- --status ----------

async function modoStatus(pool) {
  const files = listarSqlRepo()
  const registro = new Map()
  const hayTabla = await existeRegistro(pool)
  if (hayTabla) {
    const r = await pool.query(
      'SELECT filename, checksum, applied_at FROM schema_migrations'
    )
    for (const row of r.rows) registro.set(row.filename, row)
  } else {
    console.warn('AVISO: schema_migrations no existe todavía.')
  }

  const conteo = { aplicado: 0, distinto: 0, sinRegistro: 0 }
  for (const f of files) {
    const row = registro.get(f)
    let estado
    if (!row) {
      estado = 'SIN REGISTRO'
      conteo.sinRegistro++
    } else if (row.checksum !== checksumDe(f)) {
      estado = `checksum distinto (aplicado ${fecha(row.applied_at)})`
      conteo.distinto++
    } else {
      estado = `aplicado (${fecha(row.applied_at)})`
      conteo.aplicado++
    }
    console.log(`${estado.padEnd(34)} ${f}`)
    registro.delete(f)
  }
  for (const huerfano of registro.keys()) {
    console.log(`${'registrado sin archivo'.padEnd(34)} ${huerfano}`)
  }
  console.log('')
  console.log(`Total archivos: ${files.length}`)
  console.log(
    `aplicados: ${conteo.aplicado} | checksum distinto: ${conteo.distinto} | sin registro: ${conteo.sinRegistro}`
  )
}

// ---------- --backfill ----------

async function modoBackfill(pool) {
  if (!(await existeRegistro(pool))) {
    throw new Error(
      'schema_migrations no existe: aplicá antes create-schema-migrations.sql --apply'
    )
  }
  const files = listarSqlRepo()
  let insertados = 0
  for (const f of files) {
    const r = await pool.query(
      `INSERT INTO schema_migrations (filename, checksum, applied_by, notas)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (filename) DO NOTHING
       RETURNING filename`,
      [f, checksumDe(f), process.env.USER ?? 'apply-sql', NOTA_BACKFILL]
    )
    if (r.rowCount > 0) {
      insertados++
      console.log(`registrado  ${f}`)
    }
  }
  console.log(
    `\nBackfill: ${insertados} registrados, ${files.length - insertados} ya tenían fila.`
  )
}

// ---------- --check-columns ----------

async function modoCheckColumns(pool) {
  const lista = valorFlag('--check-columns')
  if (!lista) {
    throw new Error('Uso: --check-columns Tabla.columna,otra_tabla.col')
  }
  const filas = []
  for (const item of lista.split(',')) {
    const [tabla, columna] = item.trim().replace(/"/g, '').split('.')
    if (!tabla || !columna) {
      throw new Error(`Formato inválido: ${item} (esperado Tabla.columna)`)
    }
    const exacta = await pool.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [tabla, columna]
    )
    let similar = null
    if (exacta.rows.length === 0) {
      const r = await pool.query(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND LOWER(table_name) = LOWER($1) AND LOWER(column_name) = LOWER($2)`,
        [tabla, columna]
      )
      similar = r.rows[0]
        ? `${r.rows[0].table_name}.${r.rows[0].column_name}`
        : null
    }
    filas.push({
      tabla,
      columna,
      existe: exacta.rows.length > 0,
      tipo: exacta.rows[0]?.data_type ?? null,
      similar,
    })
  }
  console.table(filas)
  const faltan = filas.filter((f) => !f.existe)
  console.log(
    `${filas.length - faltan.length} existen, ${faltan.length} no: ${faltan.map((f) => `${f.tabla}.${f.columna}`).join(', ') || '-'}`
  )
}

// ---------- main ----------

async function main() {
  const file = args.find((a) => !a.startsWith('--'))
  const modo = args.includes('--status')
    ? 'status'
    : args.includes('--backfill')
      ? 'backfill'
      : args.includes('--check-columns')
        ? 'check'
        : 'archivo'
  if (modo === 'archivo' && !file) {
    console.error(
      'Uso: node scripts/apply-sql.js <archivo.sql> [--apply] | --status | --backfill | --check-columns t.c,...'
    )
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: { rejectUnauthorized: false },
  })
  try {
    if (modo === 'status') await modoStatus(pool)
    else if (modo === 'backfill') await modoBackfill(pool)
    else if (modo === 'check') await modoCheckColumns(pool)
    else await modoArchivo(pool, file)
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error('\nFALLÓ:', e.message)
  process.exit(1)
})
