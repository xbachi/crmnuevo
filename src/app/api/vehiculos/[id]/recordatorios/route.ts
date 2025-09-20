import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const vehiculoId = params.id

  try {
    const client = await pool.connect()
    
    const result = await client.query(`
      SELECT * FROM VehiculoRecordatorios 
      WHERE vehiculoId = $1 
      ORDER BY fechaRecordatorio ASC
    `, [vehiculoId])
    
    client.release()
    
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error al obtener recordatorios del vehículo:', error)
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
    const { titulo, descripcion, fechaRecordatorio, tipo, prioridad } = data

    // Validaciones
    if (!titulo || titulo.trim() === '') {
      return NextResponse.json({ error: 'El título del recordatorio es obligatorio' }, { status: 400 })
    }

    if (!fechaRecordatorio) {
      return NextResponse.json({ error: 'La fecha del recordatorio es obligatoria' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      INSERT INTO VehiculoRecordatorios (
        vehiculoId, titulo, descripcion, fechaRecordatorio, tipo, prioridad, completado, createdAt
      ) VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
      RETURNING *
    `, [vehiculoId, titulo.trim(), descripcion?.trim() || '', fechaRecordatorio, tipo || 'otro', prioridad || 'media'])
    
    client.release()
    
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('Error al crear recordatorio del vehículo:', error)
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
    const { recordatorioId, titulo, descripcion, fechaRecordatorio, tipo, prioridad, completado } = data

    if (!recordatorioId) {
      return NextResponse.json({ error: 'ID de recordatorio es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      UPDATE VehiculoRecordatorios 
      SET titulo = $1, descripcion = $2, fechaRecordatorio = $3, tipo = $4, prioridad = $5, completado = $6
      WHERE id = $7 AND vehiculoId = $8
      RETURNING *
    `, [titulo, descripcion, fechaRecordatorio, tipo, prioridad, completado, recordatorioId, vehiculoId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    }
    
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Error al actualizar recordatorio del vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const vehiculoId = params.id
  const { searchParams } = new URL(request.url)
  const recordatorioId = searchParams.get('recordatorioId')

  if (!recordatorioId) {
    return NextResponse.json({ error: 'ID de recordatorio es obligatorio' }, { status: 400 })
  }

  try {
    const client = await pool.connect()
    
    const result = await client.query(`
      DELETE FROM VehiculoRecordatorios 
      WHERE id = $1 AND vehiculoId = $2
      RETURNING id
    `, [recordatorioId, vehiculoId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    }
    
    return NextResponse.json({ message: 'Recordatorio eliminado exitosamente' })
  } catch (error) {
    console.error('Error al eliminar recordatorio del vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
