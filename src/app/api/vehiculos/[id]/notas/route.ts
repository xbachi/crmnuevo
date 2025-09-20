import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vehiculoId } = await params
    console.log(`📝 [NOTAS] Obteniendo notas para vehículo ${vehiculoId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      SELECT * FROM VehiculoNotas 
      WHERE vehiculo_id = $1 
      ORDER BY fecha_creacion DESC
    `, [vehiculoId])
    
    client.release()
    
    console.log(`📝 [NOTAS] Encontradas ${result.rows.length} notas`)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ [NOTAS] Error al obtener notas del vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vehiculoId } = await params
    const data = await request.json()
    const { contenido, usuario_nombre = 'Usuario' } = data

    console.log(`📝 [NOTAS] Creando nota para vehículo ${vehiculoId}:`, { contenido, usuario_nombre })

    // Validaciones
    if (!contenido || contenido.trim() === '') {
      return NextResponse.json({ error: 'El contenido de la nota es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      INSERT INTO VehiculoNotas (vehiculo_id, contenido, usuario_nombre, fecha_creacion)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `, [vehiculoId, contenido.trim(), usuario_nombre])
    
    client.release()
    
    console.log(`✅ [NOTAS] Nota creada exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('❌ [NOTAS] Error al crear nota del vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vehiculoId } = await params
    const data = await request.json()
    const { id: notaId, contenido } = data

    console.log(`✏️ [NOTAS] Actualizando nota ${notaId} del vehículo ${vehiculoId}`)

    // Validaciones
    if (!notaId) {
      return NextResponse.json({ error: 'ID de nota es obligatorio' }, { status: 400 })
    }
    if (!contenido || contenido.trim() === '') {
      return NextResponse.json({ error: 'El contenido de la nota es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      UPDATE VehiculoNotas 
      SET contenido = $1, fecha_creacion = NOW()
      WHERE id = $2 AND vehiculo_id = $3
      RETURNING *
    `, [contenido.trim(), notaId, vehiculoId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    console.log(`✅ [NOTAS] Nota actualizada exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [NOTAS] Error al actualizar nota del vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vehiculoId } = await params
    const { searchParams } = new URL(request.url)
    const notaId = searchParams.get('notaId')

    console.log(`🗑️ [NOTAS] Eliminando nota ${notaId} del vehículo ${vehiculoId}`)

    if (!notaId) {
      return NextResponse.json({ error: 'ID de nota es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      DELETE FROM VehiculoNotas 
      WHERE id = $1 AND vehiculo_id = $2
      RETURNING id
    `, [notaId, vehiculoId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    console.log(`✅ [NOTAS] Nota eliminada exitosamente`)
    return NextResponse.json({ message: 'Nota eliminada exitosamente' })
  } catch (error) {
    console.error('❌ [NOTAS] Error al eliminar nota del vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}