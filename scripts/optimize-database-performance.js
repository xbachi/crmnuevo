const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Cargar variables de entorno
function loadEnvFile() {
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8')
      const lines = content.split('\n')
      lines.forEach((line) => {
        const [key, value] = line.split('=')
        if (key && value) {
          process.env[key] = value.replace(/"/g, '')
        }
      })
    }
  } catch (error) {
    console.error('Error cargando .env.local:', error)
  }
}

loadEnvFile()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

async function optimizeDatabase() {
  const client = await pool.connect()

  try {
    console.log('🚀 Iniciando optimización de base de datos...\n')

    // Leer el archivo SQL
    const sqlPath = path.join(
      process.cwd(),
      'scripts',
      'optimize-database-performance.sql'
    )
    const sqlContent = fs.readFileSync(sqlPath, 'utf8')

    // Dividir en comandos individuales
    const commands = sqlContent
      .split(';')
      .map((cmd) => cmd.trim())
      .filter((cmd) => cmd.length > 0 && !cmd.startsWith('--'))

    console.log(
      `📋 Ejecutando ${commands.length} comandos de optimización...\n`
    )

    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]

      if (command.includes('CREATE INDEX')) {
        const indexName = command.match(/idx_\w+/)?.[0] || 'unknown'
        console.log(`⏳ Creando índice: ${indexName}...`)
      } else if (command.includes('ANALYZE')) {
        const tableName =
          command.match(/"\w+"/)?.[0]?.replace(/"/g, '') || 'unknown'
        console.log(`📊 Analizando tabla: ${tableName}...`)
      } else if (command.includes('SELECT')) {
        console.log(`📋 Mostrando índices creados...`)
      }

      try {
        const startTime = Date.now()
        const result = await client.query(command)
        const duration = Date.now() - startTime

        if (command.includes('CREATE INDEX')) {
          console.log(`✅ Índice creado en ${duration}ms`)
        } else if (command.includes('ANALYZE')) {
          console.log(`✅ Tabla analizada en ${duration}ms`)
        } else if (command.includes('SELECT')) {
          console.log(`\n📋 Índices encontrados:`)
          result.rows.forEach((row) => {
            console.log(`  - ${row.tablename}.${row.indexname}`)
          })
        }

        successCount++
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️  Índice ya existe, omitiendo...`)
          successCount++
        } else {
          console.error(`❌ Error ejecutando comando ${i + 1}:`, error.message)
          errorCount++
        }
      }
    }

    console.log(`\n📊 Resumen de optimización:`)
    console.log(`  ✅ Comandos exitosos: ${successCount}`)
    console.log(`  ❌ Errores: ${errorCount}`)

    if (errorCount === 0) {
      console.log(`\n🎉 ¡Optimización completada exitosamente!`)
      console.log(
        `💡 Los tiempos de consulta deberían mejorar significativamente.`
      )
    } else {
      console.log(`\n⚠️  Optimización completada con algunos errores.`)
    }
  } catch (error) {
    console.error('❌ Error durante la optimización:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

optimizeDatabase()
