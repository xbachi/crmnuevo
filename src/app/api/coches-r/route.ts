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

    const client = await pool.connect()

    const result = await client.query(
      `SELECT 
        id, referencia, marca, modelo, matricula, bastidor, color, año, 
        kilometraje, precio_compra, precio_venta, estado, tipo, tipo_vehiculo,
        fecha_compra, fecha_matriculacion, combustible, cambio, potencia, 
        cilindrada, itv_vencimiento, created_at, updated_at
       FROM "Vehiculo" 
       WHERE tipo_vehiculo = 'coche_r'
       ORDER BY created_at DESC`
    )

    client.release()

    console.log(`🚗 [COCHES R API] Encontrados ${result.rows.length} Coches R`)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ [COCHES R API] Error al obtener Coches R:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
