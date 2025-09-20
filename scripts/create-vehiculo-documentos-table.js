const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Configuración de la base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function createVehiculoDocumentosTable() {
  try {
    console.log('🔧 Creando tabla VehiculoDocumentos...')
    
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'create-vehiculo-documentos-table.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    // Ejecutar el SQL
    await pool.query(sql)
    
    console.log('✅ Tabla VehiculoDocumentos creada exitosamente')
    
  } catch (error) {
    console.error('❌ Error al crear tabla VehiculoDocumentos:', error)
    throw error
  } finally {
    await pool.end()
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  createVehiculoDocumentosTable()
    .then(() => {
      console.log('🎉 Script completado')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Error:', error)
      process.exit(1)
    })
}

module.exports = { createVehiculoDocumentosTable }
