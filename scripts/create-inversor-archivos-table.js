const { Pool } = require('pg')
require('dotenv').config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

async function createTable() {
  const client = await pool.connect()
  try {
    console.log('Creando tabla InversorArchivo...')
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS "InversorArchivo" (
        id SERIAL PRIMARY KEY,
        "inversorId" INTEGER NOT NULL REFERENCES "Inversor"(id) ON DELETE CASCADE,
        nombre VARCHAR(255) NOT NULL,
        url VARCHAR(500) NOT NULL,
        tipo VARCHAR(100) NOT NULL,
        tamaño INTEGER NOT NULL,
        descripcion TEXT,
        "fechaSubida" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "fechaActualizacion" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `)

    console.log('Creando índices...')
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inversor_archivo_inversor_id ON "InversorArchivo"("inversorId")
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inversor_archivo_fecha_subida ON "InversorArchivo"("fechaSubida")
    `)

    console.log('✅ Tabla InversorArchivo creada exitosamente')
    
  } catch (error) {
    console.error('❌ Error al crear tabla:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

createTable()
