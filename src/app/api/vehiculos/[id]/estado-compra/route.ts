import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

// Crear pool de conexiones PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
})

// GET - Obtener estado de compra del vehículo
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('🔍 [API GET] Iniciando consulta de estado de compra')
    const { id } = await params
    const vehiculoId = parseInt(id)
    console.log('🔍 [API GET] Vehículo ID:', vehiculoId)

    if (isNaN(vehiculoId)) {
      console.log('❌ [API GET] ID de vehículo inválido:', id)
      return NextResponse.json(
        { error: 'ID de vehículo inválido' },
        { status: 400 }
      )
    }

    console.log('🔍 [API GET] Buscando vehículo en base de datos...')
    const client = await pool.connect()

    const result = await client.query(
      `SELECT id, pagado, "transporteSolicitado", recibido 
       FROM "Vehiculo" 
       WHERE id = $1`,
      [vehiculoId]
    )

    client.release()

    console.log('🔍 [API GET] Resultado de búsqueda:', result.rows[0])

    if (result.rows.length === 0) {
      console.log('❌ [API GET] Vehículo no encontrado')
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    const vehiculo = result.rows[0]
    const response = {
      pagado: vehiculo.pagado || false,
      transporteSolicitado: vehiculo.transporteSolicitado || false,
      recibido: vehiculo.recibido || false,
    }

    console.log('✅ [API GET] Respuesta:', response)
    return NextResponse.json(response)
  } catch (error) {
    console.error('❌ [API GET] Error al obtener estado de compra:', error)
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

// PUT - Actualizar estado de compra del vehículo
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const vehiculoId = parseInt(id)

    if (isNaN(vehiculoId)) {
      return NextResponse.json(
        { error: 'ID de vehículo inválido' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { pagado, transporteSolicitado, recibido } = body

    console.log('📝 [API] Datos recibidos:', {
      vehiculoId,
      pagado,
      transporteSolicitado,
      recibido,
    })

    // Validar que los campos sean booleanos
    if (
      typeof pagado !== 'boolean' ||
      typeof transporteSolicitado !== 'boolean' ||
      typeof recibido !== 'boolean'
    ) {
      console.log('❌ [API] Validación fallida:', {
        pagado: typeof pagado,
        transporteSolicitado: typeof transporteSolicitado,
        recibido: typeof recibido,
      })
      return NextResponse.json(
        { error: 'Los campos deben ser booleanos' },
        { status: 400 }
      )
    }

    const client = await pool.connect()

    const result = await client.query(
      `UPDATE "Vehiculo" 
       SET pagado = $1, "transporteSolicitado" = $2, recibido = $3, "updatedAt" = NOW()
       WHERE id = $4
       RETURNING id, pagado, "transporteSolicitado", recibido`,
      [pagado, transporteSolicitado, recibido, vehiculoId]
    )

    client.release()

    console.log('✅ [API] Vehículo actualizado:', result.rows[0])

    return NextResponse.json({
      pagado: result.rows[0].pagado,
      transporteSolicitado: result.rows[0].transporteSolicitado,
      recibido: result.rows[0].recibido,
    })
  } catch (error) {
    console.error('Error al actualizar estado de compra:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
