const { Pool } = require('pg')
const path = require('path')
const fs = require('fs')

// Cargar .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
})

const colors = {
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
}

const log = (color, ...args) =>
  console.log(color + args.join(' ') + colors.reset)

async function createInteresadosTable() {
  log(colors.cyan + colors.bold, '🚀 CREANDO TABLA DE INTERESADOS')
  log(colors.cyan, '='.repeat(50))

  try {
    // Verificar conexión
    await pool.query('SELECT NOW()')
    log(colors.green, '✅ Conexión a base de datos exitosa')

    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'create-interesados-table.sql')
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Archivo SQL no encontrado: ${sqlPath}`)
    }

    const sqlContent = fs.readFileSync(sqlPath, 'utf8')
    log(colors.blue, '📄 Archivo SQL leído correctamente')

    // Ejecutar el SQL
    log(colors.yellow, '⚡ Ejecutando script SQL...')
    await pool.query(sqlContent)

    log(colors.green, '✅ Tabla creada exitosamente: interesados')

    // Verificar que la tabla existe
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'interesados'
    `)

    log(colors.cyan, '\n📊 VERIFICACIÓN DE TABLA:')
    if (tablesResult.rows.length > 0) {
      log(colors.green, `   ✅ ${tablesResult.rows[0].table_name}`)
    } else {
      log(colors.red, '   ❌ Tabla no encontrada')
    }

    log(
      colors.cyan + colors.bold,
      '\n🎉 CONFIGURACIÓN COMPLETADA EXITOSAMENTE!'
    )
    log(colors.cyan, 'La tabla de interesados está lista para usar.')
  } catch (error) {
    log(colors.red, '❌ Error creando tabla:', error.message)
    console.error(error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

createInteresadosTable()
