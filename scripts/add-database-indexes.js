const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

// Configuración de la base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
})

async function addDatabaseIndexes() {
  const client = await pool.connect()

  try {
    console.log('🚀 Iniciando creación de índices de base de datos...')

    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'add-database-indexes.sql')
    const sqlContent = fs.readFileSync(sqlPath, 'utf8')

    // Dividir en statements individuales
    const statements = sqlContent
      .split(';')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith('--'))

    console.log(`📝 Ejecutando ${statements.length} statements...`)

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (statement.trim()) {
        try {
          console.log(
            `⏳ Ejecutando statement ${i + 1}/${statements.length}...`
          )
          await client.query(statement)
          console.log(`✅ Statement ${i + 1} ejecutado correctamente`)
        } catch (error) {
          if (error.message.includes('already exists')) {
            console.log(`⚠️  Statement ${i + 1}: Índice ya existe (ignorando)`)
          } else {
            console.error(`❌ Error en statement ${i + 1}:`, error.message)
            throw error
          }
        }
      }
    }

    console.log('🎉 ¡Índices creados exitosamente!')

    // Verificar índices creados
    console.log('\n📊 Verificando índices creados...')
    const result = await client.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE tablename IN ('Deal', 'Cliente', 'Vehiculo')
      ORDER BY tablename, indexname
    `)

    console.log(`\n📈 Total de índices encontrados: ${result.rows.length}`)
    result.rows.forEach((row) => {
      console.log(`  - ${row.tablename}.${row.indexname}`)
    })
  } catch (error) {
    console.error('❌ Error creando índices:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  addDatabaseIndexes()
    .then(() => {
      console.log('✅ Script completado exitosamente')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Script falló:', error)
      process.exit(1)
    })
}

module.exports = { addDatabaseIndexes }
