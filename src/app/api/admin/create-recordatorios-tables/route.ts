import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function POST() {
  try {
    console.log('🔧 Creando tablas de recordatorios...')
    
    const client = await pool.connect()
    
    // Crear tabla para recordatorios de deals
    await client.query(`
      CREATE TABLE IF NOT EXISTS DealRecordatorios (
        id SERIAL PRIMARY KEY,
        deal_id INTEGER NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        tipo VARCHAR(50) DEFAULT 'general',
        prioridad VARCHAR(20) DEFAULT 'media',
        fecha_recordatorio TIMESTAMP WITH TIME ZONE NOT NULL,
        completado BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (deal_id) REFERENCES "Deal"(id) ON DELETE CASCADE
      )
    `)
    
    // Crear tabla para recordatorios de vehículos
    await client.query(`
      CREATE TABLE IF NOT EXISTS VehiculoRecordatorios (
        id SERIAL PRIMARY KEY,
        vehiculo_id INTEGER NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        tipo VARCHAR(50) DEFAULT 'general',
        prioridad VARCHAR(20) DEFAULT 'media',
        fecha_recordatorio TIMESTAMP WITH TIME ZONE NOT NULL,
        completado BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehiculo_id) REFERENCES "Vehiculo"(id) ON DELETE CASCADE
      )
    `)
    
    // Verificar si existe la tabla ClienteReminder
    const clienteReminderExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'ClienteReminder'
      )
    `)
    
    if (!clienteReminderExists.rows[0].exists) {
      // Crear tabla para recordatorios de clientes
      await client.query(`
        CREATE TABLE IF NOT EXISTS "ClienteReminder" (
          id SERIAL PRIMARY KEY,
          "clienteId" INTEGER NOT NULL,
          titulo VARCHAR(255) NOT NULL,
          descripcion TEXT,
          tipo VARCHAR(50) DEFAULT 'llamada',
          prioridad VARCHAR(20) DEFAULT 'media',
          "fechaRecordatorio" TIMESTAMP WITH TIME ZONE NOT NULL,
          completado BOOLEAN DEFAULT FALSE,
          "deal_id" INTEGER,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("clienteId") REFERENCES "Cliente"(id) ON DELETE CASCADE,
          FOREIGN KEY ("deal_id") REFERENCES "Deal"(id) ON DELETE SET NULL
        )
      `)
    }
    
    // Crear índices para DealRecordatorios
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealrecordatorios_deal_id ON DealRecordatorios (deal_id)
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dealrecordatorios_fecha ON DealRecordatorios (fecha_recordatorio)
    `)
    
    // Crear índices para VehiculoRecordatorios
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vehiculorecordatorios_vehiculo_id ON VehiculoRecordatorios (vehiculo_id)
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vehiculorecordatorios_fecha ON VehiculoRecordatorios (fecha_recordatorio)
    `)
    
    // Crear índices para ClienteReminder si no existen
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clientereminder_cliente_id ON "ClienteReminder" ("clienteId")
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clientereminder_fecha ON "ClienteReminder" ("fechaRecordatorio")
    `)
    
    client.release()
    
    console.log('✅ Tablas de recordatorios creadas exitosamente')
    return NextResponse.json({ 
      message: 'Tablas de recordatorios creadas exitosamente',
      tables: ['DealRecordatorios', 'VehiculoRecordatorios', 'ClienteReminder']
    })
  } catch (error) {
    console.error('❌ Error creando tablas de recordatorios:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
