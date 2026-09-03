import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(request: NextRequest) {
  try {
    console.log('🚗 [COCHES R API] Obteniendo lista de Coches R')
    console.log(
      '🚗 [COCHES R API] DATABASE_URL existe?',
      !!process.env.DATABASE_URL
    )

    const result = await pool.query(
      `SELECT 
        id, referencia, marca, modelo, matricula, bastidor, color, año, 
        kms, estado, tipo, "createdAt", "updatedAt"
       FROM "Vehiculo" 
       WHERE tipo = 'R'
       ORDER BY "createdAt" DESC`
    )

    console.log(`🚗 [COCHES R API] Encontrados ${result.rows.length} Coches R`)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ [COCHES R API] Error al obtener Coches R:', error)
    console.error(
      '❌ [COCHES R API] Error stack:',
      error instanceof Error ? error.stack : undefined
    )
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
