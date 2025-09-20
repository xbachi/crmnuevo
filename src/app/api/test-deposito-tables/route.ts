import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET() {
  try {
    console.log('🧪 [TEST] Verificando tablas de depósitos')

    const client = await pool.connect()
    
    // Verificar qué tablas de depósitos existen
    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE '%deposito%' OR table_name LIKE '%Deposito%'
      AND table_schema = 'public'
    `)
    
    console.log('📋 Tablas de depósitos encontradas:', tablesCheck.rows.map(r => r.table_name))
    
    client.release()
    
    return NextResponse.json({
      message: 'Verificación de tablas de depósitos',
      tables: tablesCheck.rows.map(r => r.table_name)
    })
  } catch (error) {
    console.error('❌ [TEST] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
