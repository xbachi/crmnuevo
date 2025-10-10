import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

// Crear pool de conexiones PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

export async function GET(request: NextRequest) {
  try {
    console.log('🚗 [COCHES R API] Obteniendo lista de Coches R')
    console.log(
      '🚗 [COCHES R API] DATABASE_URL existe?',
      !!process.env.DATABASE_URL
    )

    const client = await pool.connect()
    console.log('🚗 [COCHES R API] Conexión a BD establecida')

    const result = await client.query(
      `SELECT 
        id, referencia, marca, modelo, matricula, bastidor, color, año, 
        kms, estado, tipo, "createdAt", "updatedAt"
       FROM "Vehiculo" 
       WHERE tipo = 'Coche R'
       ORDER BY "createdAt" DESC`
    )

    client.release()
    console.log('🚗 [COCHES R API] Conexión liberada')

    console.log(`🚗 [COCHES R API] Encontrados ${result.rows.length} Coches R`)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ [COCHES R API] Error al obtener Coches R:', error)
    console.error('❌ [COCHES R API] Error stack:', error.stack)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  }
}
