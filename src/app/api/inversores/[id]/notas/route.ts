import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inversorId } = await params
    console.log(`📝 [INVERSOR NOTAS] Obteniendo notas para inversor ${inversorId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      SELECT * FROM InversorNotas 
      WHERE inversor_id = $1 
      ORDER BY fecha_creacion DESC
    `, [inversorId])
    
    client.release()
    
    console.log(`📝 [INVERSOR NOTAS] Encontradas ${result.rows.length} notas`)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ [INVERSOR NOTAS] Error al obtener notas del inversor:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inversorId } = await params
    const data = await request.json()
    const { contenido, usuario_nombre = 'Admin' } = data

    console.log(`📝 [INVERSOR NOTAS] Creando nota para inversor ${inversorId}:`, { contenido, usuario_nombre })

    // Validaciones
    if (!contenido || contenido.trim() === '') {
      return NextResponse.json({ error: 'El contenido de la nota es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      INSERT INTO InversorNotas (inversor_id, contenido, usuario_nombre, fecha_creacion)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `, [inversorId, contenido.trim(), usuario_nombre])
    
    client.release()
    
    console.log(`✅ [INVERSOR NOTAS] Nota creada exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('❌ [INVERSOR NOTAS] Error al crear nota del inversor:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inversorId } = await params
    const data = await request.json()
    const { id: notaId, contenido } = data

    console.log(`✏️ [INVERSOR NOTAS] Actualizando nota ${notaId} del inversor ${inversorId}`)

    // Validaciones
    if (!notaId) {
      return NextResponse.json({ error: 'ID de nota es obligatorio' }, { status: 400 })
    }
    if (!contenido || contenido.trim() === '') {
      return NextResponse.json({ error: 'El contenido de la nota es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      UPDATE InversorNotas 
      SET contenido = $1, fecha_creacion = NOW()
      WHERE id = $2 AND inversor_id = $3
      RETURNING *
    `, [contenido.trim(), notaId, inversorId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    console.log(`✅ [INVERSOR NOTAS] Nota actualizada exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [INVERSOR NOTAS] Error al actualizar nota del inversor:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inversorId } = await params
    const { searchParams } = new URL(request.url)
    const notaId = searchParams.get('notaId')

    console.log(`🗑️ [INVERSOR NOTAS] Eliminando nota ${notaId} del inversor ${inversorId}`)

    if (!notaId) {
      return NextResponse.json({ error: 'ID de nota es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      DELETE FROM InversorNotas 
      WHERE id = $1 AND inversor_id = $2
      RETURNING id
    `, [notaId, inversorId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    console.log(`✅ [INVERSOR NOTAS] Nota eliminada exitosamente`)
    return NextResponse.json({ message: 'Nota eliminada exitosamente' })
  } catch (error) {
    console.error('❌ [INVERSOR NOTAS] Error al eliminar nota del inversor:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
