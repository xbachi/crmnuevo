import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const inversorId = parseInt(params.id)
    console.log(`📅 [INVERSOR RECORDATORIOS] Obteniendo recordatorios para inversor ${inversorId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      SELECT * FROM "InversorRecordatorios" 
      WHERE inversor_id = $1 
      ORDER BY fecha_recordatorio ASC
    `, [inversorId])
    
    client.release()
    
    console.log(`✅ [INVERSOR RECORDATORIOS] Encontrados ${result.rows.length} recordatorios`)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ [INVERSOR RECORDATORIOS] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const inversorId = parseInt(params.id)
    const body = await request.json()
    console.log(`📅 [INVERSOR RECORDATORIOS] Creando recordatorio para inversor ${inversorId}`)

    const { titulo, descripcion, tipo, prioridad, fecha_recordatorio } = body

    if (!titulo || !fecha_recordatorio) {
      return NextResponse.json({ error: 'Título y fecha son requeridos' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      INSERT INTO "InversorRecordatorios" 
      (inversor_id, titulo, descripcion, prioridad, fecha_recordatorio)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [inversorId, titulo, descripcion || '', prioridad || 'media', fecha_recordatorio])
    
    client.release()
    
    console.log(`✅ [INVERSOR RECORDATORIOS] Recordatorio creado:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [INVERSOR RECORDATORIOS] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const inversorId = parseInt(params.id)
    const body = await request.json()
    console.log(`📅 [INVERSOR RECORDATORIOS] Actualizando recordatorio para inversor ${inversorId}`)

    const { id, titulo, descripcion, prioridad, fecha_recordatorio, completado } = body

    if (!id) {
      return NextResponse.json({ error: 'ID del recordatorio es requerido' }, { status: 400 })
    }

    const client = await pool.connect()
    
    let query = 'UPDATE "InversorRecordatorios" SET '
    const values = []
    let paramCount = 1

    if (titulo !== undefined) {
      query += `titulo = $${paramCount++}, `
      values.push(titulo)
    }
    if (descripcion !== undefined) {
      query += `descripcion = $${paramCount++}, `
      values.push(descripcion)
    }
    if (prioridad !== undefined) {
      query += `prioridad = $${paramCount++}, `
      values.push(prioridad)
    }
    if (fecha_recordatorio !== undefined) {
      query += `fecha_recordatorio = $${paramCount++}, `
      values.push(fecha_recordatorio)
    }
    if (completado !== undefined) {
      query += `completado = $${paramCount++}, `
      values.push(completado)
    }

    query += `updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount++} AND inversor_id = $${paramCount++} RETURNING *`
    values.push(id, inversorId)
    
    const result = await client.query(query, values)
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    }
    
    console.log(`✅ [INVERSOR RECORDATORIOS] Recordatorio actualizado:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [INVERSOR RECORDATORIOS] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const inversorId = parseInt(params.id)
    const { searchParams } = new URL(request.url)
    const recordatorioId = searchParams.get('recordatorioId')
    
    if (!recordatorioId) {
      return NextResponse.json({ error: 'ID del recordatorio es requerido' }, { status: 400 })
    }

    console.log(`📅 [INVERSOR RECORDATORIOS] Eliminando recordatorio ${recordatorioId} del inversor ${inversorId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      DELETE FROM "InversorRecordatorios" 
      WHERE id = $1 AND inversor_id = $2
      RETURNING *
    `, [recordatorioId, inversorId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    }
    
    console.log(`✅ [INVERSOR RECORDATORIOS] Recordatorio eliminado`)
    return NextResponse.json({ message: 'Recordatorio eliminado correctamente' })
  } catch (error) {
    console.error('❌ [INVERSOR RECORDATORIOS] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
