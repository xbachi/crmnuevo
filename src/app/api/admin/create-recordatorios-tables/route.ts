import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function POST() {
  try {
    console.log('🔧 [ADMIN] Creando tablas de recordatorios')

    const client = await pool.connect()
    
    // Crear tabla DealRecordatorios
    await client.query(`
      CREATE TABLE IF NOT EXISTS "DealRecordatorios" (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        prioridad VARCHAR(20) DEFAULT 'media',
        fecha_recordatorio TIMESTAMP NOT NULL,
        completado BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (deal_id) REFERENCES "Deal"(id) ON DELETE CASCADE
      )
    `)
    
    // Crear tabla VehiculoRecordatorios
    await client.query(`
      CREATE TABLE IF NOT EXISTS "VehiculoRecordatorios" (
        id SERIAL PRIMARY KEY,
        vehiculo_id INTEGER NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        prioridad VARCHAR(20) DEFAULT 'media',
        fecha_recordatorio TIMESTAMP NOT NULL,
        completado BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehiculo_id) REFERENCES "Vehiculo"(id) ON DELETE CASCADE
      )
    `)
    
    // Crear tabla ClienteReminder (si no existe)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "ClienteReminder" (
        id SERIAL PRIMARY KEY,
        "clienteId" INTEGER NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        prioridad VARCHAR(20) DEFAULT 'media',
        "fechaRecordatorio" TIMESTAMP NOT NULL,
        completado BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("clienteId") REFERENCES "Cliente"(id) ON DELETE CASCADE
      )
    `)
    
    // Crear tabla InversorRecordatorios
    await client.query(`
      CREATE TABLE IF NOT EXISTS "InversorRecordatorios" (
        id SERIAL PRIMARY KEY,
        inversor_id INTEGER NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        prioridad VARCHAR(20) DEFAULT 'media',
        fecha_recordatorio TIMESTAMP NOT NULL,
        completado BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (inversor_id) REFERENCES "Inversor"(id) ON DELETE CASCADE
      )
    `)
    
    client.release()
    
    console.log('✅ [ADMIN] Tablas de recordatorios creadas correctamente')
    return NextResponse.json({ 
      message: 'Tablas de recordatorios creadas correctamente',
      tables: ['DealRecordatorios', 'VehiculoRecordatorios', 'ClienteReminder', 'InversorRecordatorios']
    })
  } catch (error) {
    console.error('❌ [ADMIN] Error creando tablas de recordatorios:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}