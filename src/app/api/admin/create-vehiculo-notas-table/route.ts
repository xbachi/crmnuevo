import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function POST() {
  try {
    console.log('🔧 Creando tabla VehiculoNotas...')
    
    const client = await pool.connect()
    
    // Crear tabla VehiculoNotas
    await client.query(`
      CREATE TABLE IF NOT EXISTS VehiculoNotas (
        id SERIAL PRIMARY KEY,
        vehiculo_id INTEGER NOT NULL,
        contenido TEXT NOT NULL,
        usuario_id INTEGER,
        usuario_nombre VARCHAR(255),
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehiculo_id) REFERENCES "Vehiculo"(id) ON DELETE CASCADE
      )
    `)
    
    // Crear índices
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vehiculonotas_vehiculo_id ON VehiculoNotas (vehiculo_id)
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vehiculonotas_fecha_creacion ON VehiculoNotas (fecha_creacion)
    `)
    
    client.release()
    
    console.log('✅ Tabla VehiculoNotas creada exitosamente')
    return NextResponse.json({ message: 'Tabla VehiculoNotas creada exitosamente' })
  } catch (error) {
    console.error('❌ Error creando tabla VehiculoNotas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
