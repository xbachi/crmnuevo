const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function createTable() {
  try {
    console.log('🔧 Creando tabla VehiculoDocumentos...')
    
    const sql = `
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
        FOREIGN KEY (vehiculo_id) REFERENCES Vehiculos(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_vehiculo_documentos_vehiculo_id ON VehiculoDocumentos(vehiculo_id);
      CREATE INDEX IF NOT EXISTS idx_vehiculo_documentos_fecha ON VehiculoDocumentos(fecha_subida);
    `
    
    await pool.query(sql)
    console.log('✅ Tabla VehiculoDocumentos creada exitosamente')
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await pool.end()
  }
}

createTable()
