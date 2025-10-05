const { Pool } = require('pg')
const path = require('path')
const fs = require('fs')

// Cargar variables de entorno manualmente
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

async function checkRecordatoriosTable() {
  console.log('🔍 Verificando tabla de recordatorios de vehículos...\n')

  try {
    const client = await pool.connect()

    // 1. Buscar tablas relacionadas con recordatorios
    console.log('1. Buscando tablas relacionadas con recordatorios...')
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%ecordatorio%'
      ORDER BY table_name
    `)

    console.log(`Encontradas ${tablesResult.rows.length} tablas:`)
    tablesResult.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`)
    })

    // 2. Si existe VehiculoRecordatorios, mostrar su estructura
    const vehiculoRecordatoriosExists = tablesResult.rows.some(
      (row) => row.table_name === 'VehiculoRecordatorios'
    )

    if (vehiculoRecordatoriosExists) {
      console.log('\n2. Estructura de la tabla VehiculoRecordatorios:')
      const columnsResult = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'VehiculoRecordatorios'
        ORDER BY ordinal_position
      `)

      columnsResult.rows.forEach((col) => {
        console.log(
          `  - ${col.column_name} (${col.data_type}) - Nullable: ${col.is_nullable}`
        )
      })

      // 3. Contar registros
      console.log('\n3. Contando registros...')
      const countResult = await client.query(
        `SELECT COUNT(*) FROM VehiculoRecordatorios`
      )
      console.log(`  Total de recordatorios: ${countResult.rows[0].count}`)

      // 4. Mostrar algunos registros de ejemplo
      if (parseInt(countResult.rows[0].count) > 0) {
        console.log('\n4. Registros de ejemplo:')
        const sampleResult = await client.query(`
          SELECT id, vehiculo_id, titulo, fecha_recordatorio, completado
          FROM VehiculoRecordatorios
          LIMIT 5
        `)
        sampleResult.rows.forEach((rec, index) => {
          console.log(
            `  ${index + 1}. ID: ${rec.id}, Vehículo: ${rec.vehiculo_id}, Título: ${rec.titulo}`
          )
        })
      }
    } else {
      console.log('\n❌ La tabla VehiculoRecordatorios NO existe.')
      console.log('Buscando con diferentes variaciones de nombre...')

      // Probar diferentes variaciones
      const variations = [
        'vehiculorecordatorios',
        'Vehiculo_Recordatorios',
        'vehiculo_recordatorios',
        'Recordatorios',
        'recordatorios',
      ]

      for (const tableName of variations) {
        try {
          const testResult = await client.query(
            `SELECT COUNT(*) FROM "${tableName}" LIMIT 1`
          )
          console.log(`✅ Encontrada tabla: ${tableName}`)
        } catch (error) {
          // Tabla no existe con este nombre
        }
      }
    }

    client.release()
  } catch (error) {
    console.error('❌ Error al verificar tabla:', error)
  } finally {
    await pool.end()
  }
}

checkRecordatoriosTable()
