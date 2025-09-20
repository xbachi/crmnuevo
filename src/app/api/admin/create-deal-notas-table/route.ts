import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function POST() {
  try {
    console.log('🔧 Creando tabla DealNotas...')
    
    const client = await pool.connect()
    
    // Crear tabla DealNotas
    await client.query(`
      CREATE TABLE IF NOT EXISTS DealNotas (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL,
        contenido TEXT NOT NULL,
        usuario_nombre VARCHAR(255),
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (deal_id) REFERENCES "Deal"(id) ON DELETE CASCADE
      )
    `)
    
    // Crear índices
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealnotas_deal_id ON DealNotas (deal_id)
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealnotas_fecha_creacion ON DealNotas (fecha_creacion)
    `)
    
    client.release()
    
    console.log('✅ Tabla DealNotas creada exitosamente')
    return NextResponse.json({ message: 'Tabla DealNotas creada exitosamente' })
  } catch (error) {
    console.error('❌ Error creando tabla DealNotas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
