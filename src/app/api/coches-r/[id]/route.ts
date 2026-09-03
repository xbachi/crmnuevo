import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vehiculoId } = await params
    console.log(`🚗 [COCHE R API] Obteniendo Coche R ${vehiculoId}`)
    console.log(
      `🚗 [COCHE R API] DATABASE_URL existe?`,
      !!process.env.DATABASE_URL
    )

    const result = await pool.query(
      `SELECT 
        id, referencia, marca, modelo, matricula, bastidor, color, año, 
        kms, "precioCompra", "precioVenta", estado, tipo, tipo_vehiculo,
        "fechaCompra", "fechaMatriculacion", combustible, cambio, potencia, 
        cilindrada, itv, "createdAt", "updatedAt"
       FROM "Vehiculo" 
       WHERE id = $1 AND tipo = 'R'`,
      [parseInt(vehiculoId)]
    )

    console.log(
      `🚗 [COCHE R API] Consulta ejecutada, ${result.rows.length} resultados`
    )
    if (result.rows.length > 0) {
      console.log(`🚗 [COCHE R API] Vehículo encontrado:`, result.rows[0])
    }

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
