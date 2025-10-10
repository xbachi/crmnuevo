import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

// Crear pool de conexiones PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vehiculoId } = await params
    console.log(`🚗 [COCHE R API] Obteniendo Coche R ${vehiculoId}`)

    const client = await pool.connect()

    const result = await client.query(
      `SELECT 
        id, referencia, marca, modelo, matricula, bastidor, color, año, 
        kms, "precioCompra", "precioVenta", estado, tipo, tipo_vehiculo,
        "fechaCompra", "fechaMatriculacion", combustible, cambio, potencia, 
        cilindrada, itv, "createdAt", "updatedAt"
       FROM "Vehiculo" 
       WHERE id = $1 AND tipo = 'Coche R'`,
      [parseInt(vehiculoId)]
    )

    client.release()

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Coche R no encontrado' },
        { status: 404 }
      )
    }

    console.log(
      `🚗 [COCHE R API] Coche R encontrado: ${result.rows[0].marca} ${result.rows[0].modelo}`
    )
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [COCHE R API] Error al obtener Coche R:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
