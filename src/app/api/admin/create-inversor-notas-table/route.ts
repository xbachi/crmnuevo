import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function POST() {
  try {
    console.log('🔧 Creando tabla InversorNotas...')
    
    const client = await pool.connect()
    
    // Crear tabla para notas de inversores
    await client.query(`
      CREATE TABLE IF NOT EXISTS InversorNotas (
        id SERIAL PRIMARY KEY,
        inversor_id INTEGER NOT NULL,
        contenido TEXT NOT NULL,
        usuario_nombre VARCHAR(255),
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inversor_id) REFERENCES "Inversor"(id) ON DELETE CASCADE
      )
    `)
    
    // Crear índices para InversorNotas
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inversornotas_inversor_id ON InversorNotas (inversor_id)
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inversornotas_fecha_creacion ON InversorNotas (fecha_creacion)
    `)
    
    client.release()
    
    console.log('✅ Tabla InversorNotas creada exitosamente')
    return NextResponse.json({ 
      message: 'Tabla InversorNotas creada exitosamente',
      table: 'InversorNotas'
    })
  } catch (error) {
    console.error('❌ Error creando tabla InversorNotas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
