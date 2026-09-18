// Levanta el esquema completo del CRM en una base vacía (CI: integración y E2E)
// aplicando los .sql del repo, y siembra un usuario para los tests E2E.
//
// Orden: create-tables.sql → create-deal-table.sql → depositos/NotaDeposito
// (DDL de abajo) → scripts/sql/NNNN-*.sql → create-*.sql → add-*.sql → fix-*.sql.
// Algunos add-*/fix-* dependen de tablas que crea un archivo posterior en ese
// orden, así que se reintenta lo que falla hasta que no haya progreso; si al
// final queda algo sin aplicar, el setup falla. Cada archivo aplicado se
// registra en schema_migrations (misma clave que scripts/apply-sql.js) y se
// salta en ejecuciones posteriores: no todos los .sql son idempotentes.
//
// Uso: node scripts/setup-test-database.js
//   TEST_DATABASE_URL (o TEST_DB_HOST/PORT/NAME/USER/PASSWORD)
//   E2E_USER_EMAIL / E2E_USER_PASSWORD: usuario admin sembrado (por defecto
//   e2e@sevencars.test / e2e-password)
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const {
  separarSentencias,
  sha256,
  tieneDirectivaNoTransaccion,
} = require('./lib/sqlUtils')

const ROOT = path.resolve(__dirname, '..')

// Archivos que no pueden aplicarse a una base vacía (documentado en cada caso).
const OMITIDOS = new Set([
  // Esquema antiguo (tablas clientes/vehiculos en minúscula): la tabla real
  // se crea abajo con el DDL que usa la app.
  'create-depositos-table.sql',
  // Sus UPDATE referencian columnas snake_case que Deal no tiene; las
  // columnas las añade add-deal-action-timestamps-columns.sql.
  'add-action-timestamps.sql',
])

const DEPOSITOS_SQL = `
  CREATE TABLE IF NOT EXISTS depositos (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES "Cliente"(id) ON DELETE CASCADE,
    vehiculo_id INTEGER UNIQUE NOT NULL REFERENCES "Vehiculo"(id) ON DELETE CASCADE,
    estado VARCHAR(50) DEFAULT 'BORRADOR',
    monto_recibir DECIMAL(10,2),
    dias_gestion INTEGER,
    multa_retiro_anticipado DECIMAL(10,2),
    numero_cuenta VARCHAR(100),
    fecha_inicio TIMESTAMP DEFAULT NOW(),
    fecha_fin TIMESTAMP,
    contrato_deposito TEXT,
    contrato_compra TEXT,
    precio_venta DECIMAL(10,2),
    comision_porcentaje DECIMAL(5,2),
    notas TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS "NotaDeposito" (
    id SERIAL PRIMARY KEY,
    "depositoId" INTEGER NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
    contenido TEXT NOT NULL,
    fecha TIMESTAMP DEFAULT NOW(),
    usuario VARCHAR(100) DEFAULT 'Sistema',
    tipo VARCHAR(50) DEFAULT 'general',
    titulo VARCHAR(200) DEFAULT 'Nota general',
    prioridad VARCHAR(50) DEFAULT 'normal',
    completada BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_notadeposito_depositoId ON "NotaDeposito" ("depositoId");
  CREATE INDEX IF NOT EXISTS idx_notadeposito_fecha ON "NotaDeposito" (fecha DESC);
`

const REQUERIDAS = [
  'Cliente',
  'Vehiculo',
  'Deal',
  'Inversor',
  'depositos',
  'NotaDeposito',
  'users',
  'invoices',
  'presupuestos',
]

function listar(dir, filtro) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && filtro(f))
    .sort()
    .map((f) => path.join(dir, f))
}

function archivosEnOrden() {
  const raiz = (f) => path.join(ROOT, f)
  const esSample = (f) => /sample/i.test(f)
  return [
    raiz('create-deal-table.sql'),
    // Tablas cuyo DDL vive en scripts/ (las creó un script, no una migración).
    path.join(ROOT, 'scripts', 'create-interesados-table.sql'),
    path.join(ROOT, 'scripts', 'create-vehiculo-notas-table.sql'),
    ...listar(path.join(ROOT, 'scripts', 'sql'), () => true),
    ...listar(
      ROOT,
      (f) =>
        f.startsWith('create-') &&
        !['create-tables.sql', 'create-deal-table.sql'].includes(f)
    ),
    ...listar(ROOT, (f) => f.startsWith('add-') && !esSample(f)),
    ...listar(ROOT, (f) => f.startsWith('fix-')),
  ].filter((f) => !OMITIDOS.has(path.basename(f)))
}

async function ejecutarArchivo(pool, archivo) {
  const sql = fs.readFileSync(archivo, 'utf8')
  if (tieneDirectivaNoTransaccion(sql)) {
    for (const sentencia of separarSentencias(sql)) await pool.query(sentencia)
    return
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

function claveMigracion(archivo) {
  return path.relative(ROOT, archivo).split(path.sep).join('/')
}

async function yaAplicados(pool) {
  const r = await pool.query(`SELECT filename FROM schema_migrations`)
  return new Set(r.rows.map((x) => x.filename))
}

async function registrar(pool, archivo, sql) {
  await pool.query(
    `INSERT INTO schema_migrations (filename, checksum, applied_by)
     VALUES ($1, $2, 'setup-test-database')
     ON CONFLICT (filename) DO NOTHING`,
    [claveMigracion(archivo), sha256(sql)]
  )
}

async function aplicarTodos(pool) {
  await ejecutarArchivo(pool, path.join(ROOT, 'create-schema-migrations.sql'))
  const hechos = await yaAplicados(pool)
  const todos = archivosEnOrden()
  let pendientes = todos.filter((f) => !hechos.has(claveMigracion(f)))
  console.log(
    `✅ ${todos.length - pendientes.length} archivos ya registrados en schema_migrations`
  )
  let pasada = 0
  while (pendientes.length) {
    pasada += 1
    const fallidos = []
    for (const archivo of pendientes) {
      try {
        await ejecutarArchivo(pool, archivo)
        await registrar(pool, archivo, fs.readFileSync(archivo, 'utf8'))
      } catch (e) {
        fallidos.push({ archivo, error: e.message.split('\n')[0] })
      }
    }
    console.log(
      `✅ Pasada ${pasada}: ${pendientes.length - fallidos.length} aplicados, ${fallidos.length} pendientes`
    )
    if (fallidos.length === pendientes.length) {
      for (const f of fallidos) {
        console.error(`   ✗ ${path.relative(ROOT, f.archivo)} → ${f.error}`)
      }
      throw new Error(`${fallidos.length} archivos SQL no se pudieron aplicar`)
    }
    pendientes = fallidos.map((f) => f.archivo)
  }
}

// Mismo formato que hashPassword en src/lib/auth-server.ts.
function hashPassword(plain) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

async function sembrarUsuarioE2E(pool) {
  const email = process.env.E2E_USER_EMAIL || 'e2e@sevencars.test'
  const password = process.env.E2E_USER_PASSWORD || 'e2e-password'
  await pool.query(
    `INSERT INTO users (email, password_hash, role, display_name, active)
     VALUES ($1, $2, 'admin', 'E2E', TRUE)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = TRUE`,
    [email, hashPassword(password)]
  )
  console.log(`✅ Usuario E2E: ${email}`)
}

function configDb() {
  if (process.env.TEST_DATABASE_URL) {
    return { connectionString: process.env.TEST_DATABASE_URL }
  }
  return {
    user: process.env.TEST_DB_USER || 'postgres',
    host: process.env.TEST_DB_HOST || 'localhost',
    database: process.env.TEST_DB_NAME || 'crm_test',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
    port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
  }
}

async function setupTestDatabase() {
  console.log('Setting up test database...')
  const pool = new Pool(configDb())
  try {
    await pool.query('SELECT NOW()')
    console.log('✅ Database connection established')

    // create-tables.sql no es idempotente (CREATE TRIGGER): solo en base vacía.
    const base = await pool.query(
      `SELECT to_regclass('public."Inversor"') AS t`
    )
    if (!base.rows[0].t) {
      await ejecutarArchivo(pool, path.join(ROOT, 'create-tables.sql'))
    }
    await ejecutarArchivo(pool, path.join(ROOT, 'create-deal-table.sql'))
    await pool.query(DEPOSITOS_SQL)
    await aplicarTodos(pool)
    await sembrarUsuarioE2E(pool)

    const r = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`
    )
    const tablas = r.rows.map((x) => x.table_name)
    const faltan = REQUERIDAS.filter((t) => !tablas.includes(t))
    if (faltan.length) {
      throw new Error(`Missing required tables: ${faltan.join(', ')}`)
    }
    console.log(`✅ ${tablas.length} tablas disponibles`)
    console.log('✅ Test database setup completed successfully')
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  setupTestDatabase()
    .then(() => {
      console.log('Test database setup complete')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Test database setup failed:', error.message)
      process.exit(1)
    })
}

module.exports = { setupTestDatabase }
