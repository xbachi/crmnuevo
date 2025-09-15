const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Cargar variables de entorno
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
})

async function createRemindersTable() {
  const client = await pool.connect()
  try {
    console.log('🔄 Creando tabla de recordatorios...')
    
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, '..', 'create-reminders-table.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    // Ejecutar el SQL
    await client.query(sql)
    
    console.log('✅ Tabla de recordatorios creada exitosamente')
    
    // Verificar que la tabla existe
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'ClienteReminder'
    `)
    
    if (result.rows.length > 0) {
      console.log('✅ Tabla ClienteReminder verificada en la base de datos')
    } else {
      console.log('❌ Error: La tabla no se creó correctamente')
    }
    
  } catch (error) {
    console.error('❌ Error creando tabla:', error.message)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

createRemindersTable()
  .then(() => {
    console.log('🎉 Proceso completado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Error:', error)
    process.exit(1)
  })
