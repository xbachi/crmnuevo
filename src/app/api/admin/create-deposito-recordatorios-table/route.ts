import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function POST() {
  try {
    console.log('🔧 [ADMIN] Creando tabla de recordatorios de depósitos')

    const client = await pool.connect()
    
    // Crear tabla DepositoRecordatorios
    await client.query(`
      CREATE TABLE IF NOT EXISTS "DepositoRecordatorios" (
        id SERIAL PRIMARY KEY,
        deposito_id INTEGER NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        prioridad VARCHAR(20) DEFAULT 'media',
        fecha_recordatorio TIMESTAMP NOT NULL,
        completado BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (deposito_id) REFERENCES "depositos"(id) ON DELETE CASCADE
      )
    `)
    
    client.release()
    
    console.log('✅ [ADMIN] Tabla DepositoRecordatorios creada correctamente')
    return NextResponse.json({ 
      message: 'Tabla DepositoRecordatorios creada correctamente'
    })
  } catch (error) {
    console.error('❌ [ADMIN] Error creando tabla DepositoRecordatorios:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
