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

async function checkColumnNames() {
  const client = await pool.connect()

  try {
    console.log('🔍 Verificando nombres de columnas en la tabla Vehiculo...\n')

    // Obtener información de las columnas de la tabla Vehiculo
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'Vehiculo' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `)

    console.log('📋 Columnas de la tabla Vehiculo:')
    console.log('=================================')
    columnsResult.rows.forEach((col) => {
      console.log(
        `- ${col.column_name} (${col.data_type}) - Nullable: ${col.is_nullable}`
      )
    })

    // Verificar específicamente la columna fechaMatriculacion
    const fechaMatriculacionCol = columnsResult.rows.find(
      (col) =>
        col.column_name.toLowerCase().includes('fecha') ||
        col.column_name.toLowerCase().includes('matriculacion')
    )

    console.log(
      '\n🔍 Búsqueda de columnas relacionadas con fecha de matriculación:'
    )
    console.log(
      '================================================================'
    )
    if (fechaMatriculacionCol) {
      console.log(`✅ Encontrada: ${fechaMatriculacionCol.column_name}`)
    } else {
      console.log(
        '❌ No se encontró columna relacionada con fecha de matriculación'
      )
    }

    // Probar diferentes formas de referenciar la columna
    console.log('\n🧪 Probando diferentes formas de referenciar la columna:')
    console.log('======================================================')

    const testQueries = [
      'SELECT "fechaMatriculacion" FROM "Vehiculo" WHERE id = 316',
      'SELECT fechaMatriculacion FROM "Vehiculo" WHERE id = 316',
      'SELECT "fecha_matriculacion" FROM "Vehiculo" WHERE id = 316',
      'SELECT fecha_matriculacion FROM "Vehiculo" WHERE id = 316',
    ]

    for (const query of testQueries) {
      try {
        const result = await client.query(query)
        console.log(
          `✅ ${query}: ${result.rows[0] ? Object.values(result.rows[0])[0] : 'null'}`
        )
      } catch (error) {
        console.log(`❌ ${query}: ${error.message}`)
      }
    }

    // Verificar el esquema de Prisma
    console.log('\n📄 Verificando esquema de Prisma...')
    console.log('===================================')
    try {
      const prismaSchema = fs.readFileSync('prisma/schema.prisma', 'utf8')
      const vehiculoModel = prismaSchema.match(/model Vehiculo\s*\{[^}]*\}/s)
      if (vehiculoModel) {
        console.log('Modelo Vehiculo en Prisma:')
        console.log(vehiculoModel[0])
      }
    } catch (error) {
      console.log('❌ Error leyendo schema.prisma:', error.message)
    }
  } catch (error) {
    console.error('❌ Error durante la verificación:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

checkColumnNames()
