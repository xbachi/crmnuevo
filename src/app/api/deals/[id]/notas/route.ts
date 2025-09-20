import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dealId } = await params
    console.log(`📝 [DEAL NOTAS] Obteniendo notas para deal ${dealId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      SELECT * FROM DealNotas 
      WHERE deal_id = $1 
      ORDER BY fecha_creacion DESC
    `, [dealId])
    
    client.release()
    
    console.log(`📝 [DEAL NOTAS] Encontradas ${result.rows.length} notas`)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ [DEAL NOTAS] Error al obtener notas del deal:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dealId } = await params
    const data = await request.json()
    const { contenido, usuario_nombre = 'Admin' } = data

    console.log(`📝 [DEAL NOTAS] Creando nota para deal ${dealId}:`, { contenido, usuario_nombre })

    // Validaciones
    if (!contenido || contenido.trim() === '') {
      return NextResponse.json({ error: 'El contenido de la nota es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      INSERT INTO DealNotas (deal_id, contenido, usuario_nombre, fecha_creacion)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `, [dealId, contenido.trim(), usuario_nombre])
    
    client.release()
    
    console.log(`✅ [DEAL NOTAS] Nota creada exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('❌ [DEAL NOTAS] Error al crear nota del deal:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dealId } = await params
    const data = await request.json()
    const { id: notaId, contenido } = data

    console.log(`✏️ [DEAL NOTAS] Actualizando nota ${notaId} del deal ${dealId}`)

    // Validaciones
    if (!notaId) {
      return NextResponse.json({ error: 'ID de nota es obligatorio' }, { status: 400 })
    }
    if (!contenido || contenido.trim() === '') {
      return NextResponse.json({ error: 'El contenido de la nota es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      UPDATE DealNotas 
      SET contenido = $1, fecha_creacion = NOW()
      WHERE id = $2 AND deal_id = $3
      RETURNING *
    `, [contenido.trim(), notaId, dealId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    console.log(`✅ [DEAL NOTAS] Nota actualizada exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [DEAL NOTAS] Error al actualizar nota del deal:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dealId } = await params
    const { searchParams } = new URL(request.url)
    const notaId = searchParams.get('notaId')

    console.log(`🗑️ [DEAL NOTAS] Eliminando nota ${notaId} del deal ${dealId}`)

    if (!notaId) {
      return NextResponse.json({ error: 'ID de nota es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      DELETE FROM DealNotas 
      WHERE id = $1 AND deal_id = $2
      RETURNING id
    `, [notaId, dealId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    console.log(`✅ [DEAL NOTAS] Nota eliminada exitosamente`)
    return NextResponse.json({ message: 'Nota eliminada exitosamente' })
  } catch (error) {
    console.error('❌ [DEAL NOTAS] Error al eliminar nota del deal:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
