// Script para crear tabla de documentos usando la misma configuración que la app
const { Pool } = require('pg')

// Usar la misma configuración que direct-database.ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function createVehiculoDocumentosTable() {
  try {
    console.log('🔧 Creando tabla VehiculoDocumentos...')
    
    // Verificar conexión
    console.log('🔗 Verificando conexión a BD...')
    await pool.query('SELECT 1')
    console.log('✅ Conexión exitosa')
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS VehiculoDocumentos (
        id SERIAL PRIMARY KEY,
        vehiculo_id INTEGER NOT NULL,
        nombre_archivo VARCHAR(255) NOT NULL,
        nombre_original VARCHAR(255) NOT NULL,
        ruta_archivo VARCHAR(500) NOT NULL,
        tamaño_bytes BIGINT NOT NULL,
        tipo_mime VARCHAR(100),
        fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehiculo_id) REFERENCES "Vehiculo"(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_vehiculo_documentos_vehiculo_id ON VehiculoDocumentos(vehiculo_id);
      CREATE INDEX IF NOT EXISTS idx_vehiculo_documentos_fecha ON VehiculoDocumentos(fecha_subida);
    `
    
    await pool.query(createTableSQL)
    console.log('✅ Tabla VehiculoDocumentos creada exitosamente')
    
    // Verificar que la tabla existe
    const checkTable = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'VehiculoDocumentos'
    `)
    
    if (checkTable.rows.length > 0) {
      console.log('✅ Tabla verificada en information_schema')
    } else {
      console.log('⚠️ Tabla no encontrada en information_schema')
    }
    
  } catch (error) {
    console.error('❌ Error al crear tabla:', error)
    console.error('❌ Detalles:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    })
  } finally {
    await pool.end()
  }
}

createVehiculoDocumentosTable()
