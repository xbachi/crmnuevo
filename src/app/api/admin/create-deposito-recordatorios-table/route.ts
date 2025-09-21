import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function POST() {
  try {
    console.log('🔧 Creando tabla DepositoRecordatorios...')
    
    const client = await pool.connect()
    
    // Crear tabla DepositoRecordatorios con la misma estructura que VehiculoRecordatorios
    await client.query(`
      CREATE TABLE IF NOT EXISTS DepositoRecordatorios (
        id SERIAL PRIMARY KEY,
        deposito_id INTEGER NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        tipo VARCHAR(50) DEFAULT 'general',
        prioridad VARCHAR(20) DEFAULT 'media',
        fecha_recordatorio TIMESTAMP NOT NULL,
        completado BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (deposito_id) REFERENCES "depositos"(id) ON DELETE CASCADE
      )
    `)
    
    // Crear índices para mejor rendimiento
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_deposito_recordatorio_deposito_id ON DepositoRecordatorios(deposito_id)
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_deposito_recordatorio_fecha ON DepositoRecordatorios(fecha_recordatorio)
    `)
    
    client.release()
    
    console.log('✅ Tabla DepositoRecordatorios creada exitosamente')
    return NextResponse.json({ 
      message: 'Tabla DepositoRecordatorios creada correctamente',
      structure: {
        id: 'SERIAL PRIMARY KEY',
        deposito_id: 'INTEGER NOT NULL (FK to depositos)',
        titulo: 'VARCHAR(255) NOT NULL',
        descripcion: 'TEXT',
        tipo: 'VARCHAR(50) DEFAULT general',
        prioridad: 'VARCHAR(20) DEFAULT media',
        fecha_recordatorio: 'TIMESTAMP NOT NULL',
        completado: 'BOOLEAN DEFAULT false',
        created_at: 'TIMESTAMP DEFAULT NOW()',
        updated_at: 'TIMESTAMP DEFAULT NOW()'
      }
    })
  } catch (error) {
    console.error('❌ Error creando tabla DepositoRecordatorios:', error)
    return NextResponse.json({ 
      error: 'Error interno del servidor',
      details: error.message,
      code: error.code
    }, { status: 500 })
  }
}