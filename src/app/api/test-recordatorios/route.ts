import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  try {
    console.log('🧪 [TEST RECORDATORIOS] Verificando tablas de recordatorios')

    const client = await pool.connect()
    
    // Verificar si las tablas existen
    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('DealRecordatorios', 'VehiculoRecordatorios', 'ClienteReminder')
      AND table_schema = 'public'
    `)
    
    console.log('📋 Tablas encontradas:', tablesCheck.rows.map(r => r.table_name))
    
    // Verificar datos en cada tabla
    const results: any = {}
    
    for (const table of ['DealRecordatorios', 'VehiculoRecordatorios', 'ClienteReminder']) {
      try {
        const count = await client.query(`SELECT COUNT(*) as count FROM "${table}"`)
        results[table] = {
          exists: true,
          count: parseInt(count.rows[0].count)
        }
      } catch (error) {
        results[table] = {
          exists: false,
          error: error.message
        }
      }
    }
    
    client.release()
    
    return NextResponse.json({
      message: 'Verificación de tablas de recordatorios',
      tables: results
    })
  } catch (error) {
    console.error('❌ [TEST RECORDATORIOS] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
