const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'crmseven',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432'),
})

async function createTable() {
  try {
    console.log('🔧 Creando tabla VehiculoNotas...')
    
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'create-vehiculo-notas-table.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    // Ejecutar el SQL
    await pool.query(sql)
    
    console.log('✅ Tabla VehiculoNotas creada exitosamente')
  } catch (error) {
    console.error('❌ Error creando tabla VehiculoNotas:', error)
  } finally {
    await pool.end()
  }
}

createTable()
