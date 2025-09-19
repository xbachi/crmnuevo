import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'crmseven',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const vehiculoId = params.id

  try {
    const client = await pool.connect()
    
    const result = await client.query(`
      SELECT * FROM VehiculoNotas 
      WHERE vehiculoId = $1 
      ORDER BY createdAt DESC
    `, [vehiculoId])
    
    client.release()
    
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error al obtener notas del vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const vehiculoId = params.id

  try {
    const data = await request.json()
    const { contenido, tipo, prioridad, usuario } = data

    // Validaciones
    if (!contenido || contenido.trim() === '') {
      return NextResponse.json({ error: 'El contenido de la nota es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      INSERT INTO VehiculoNotas (
        vehiculoId, contenido, fecha, usuario, tipo, prioridad, completada, createdAt, updatedAt
      ) VALUES ($1, $2, NOW(), $3, $4, $5, false, NOW(), NOW())
      RETURNING *
    `, [vehiculoId, contenido.trim(), usuario || 'Usuario', tipo || 'general', prioridad || 'media'])
    
    client.release()
    
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('Error al crear nota del vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const vehiculoId = params.id

  try {
    const data = await request.json()
    const { notaId, contenido, tipo, prioridad, completada } = data

    if (!notaId) {
      return NextResponse.json({ error: 'ID de nota es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      UPDATE VehiculoNotas 
      SET contenido = $1, tipo = $2, prioridad = $3, completada = $4, updatedAt = NOW()
      WHERE id = $5 AND vehiculoId = $6
      RETURNING *
    `, [contenido, tipo, prioridad, completada, notaId, vehiculoId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error al actualizar nota del vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const vehiculoId = params.id
  const { searchParams } = new URL(request.url)
  const notaId = searchParams.get('notaId')

  if (!notaId) {
    return NextResponse.json({ error: 'ID de nota es obligatorio' }, { status: 400 })
  }

  try {
    const client = await pool.connect()
    
    const result = await client.query(`
      DELETE FROM VehiculoNotas 
      WHERE id = $1 AND vehiculoId = $2
      RETURNING id
    `, [notaId, vehiculoId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    return NextResponse.json({ message: 'Nota eliminada exitosamente' })
  } catch (error) {
    console.error('Error al eliminar nota del vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
