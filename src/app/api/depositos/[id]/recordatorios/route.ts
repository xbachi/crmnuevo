import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const depositoId = parseInt(params.id)
    console.log(`📅 [DEPOSITO RECORDATORIOS] Obteniendo recordatorios para depósito ${depositoId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      SELECT * FROM "DepositoRecordatorios" 
      WHERE deposito_id = $1 
      ORDER BY fecha_recordatorio ASC
    `, [depositoId])
    
    client.release()
    
    console.log(`✅ [DEPOSITO RECORDATORIOS] Encontrados ${result.rows.length} recordatorios`)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ [DEPOSITO RECORDATORIOS] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const depositoId = parseInt(params.id)
    const body = await request.json()
    console.log(`📅 [DEPOSITO RECORDATORIOS] Creando recordatorio para depósito ${depositoId}`)

    const { titulo, descripcion, tipo, prioridad, fecha_recordatorio } = body

    if (!titulo || !fecha_recordatorio) {
      return NextResponse.json({ error: 'Título y fecha son requeridos' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      INSERT INTO "DepositoRecordatorios" 
      (deposito_id, titulo, descripcion, tipo, prioridad, fecha_recordatorio)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [depositoId, titulo, descripcion || '', tipo || 'general', prioridad || 'media', fecha_recordatorio])
    
    client.release()
    
    console.log(`✅ [DEPOSITO RECORDATORIOS] Recordatorio creado:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [DEPOSITO RECORDATORIOS] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const depositoId = parseInt(params.id)
    const body = await request.json()
    console.log(`📅 [DEPOSITO RECORDATORIOS] Actualizando recordatorio para depósito ${depositoId}`)

    const { id, titulo, descripcion, tipo, prioridad, fecha_recordatorio, completado } = body

    if (!id) {
      return NextResponse.json({ error: 'ID del recordatorio es requerido' }, { status: 400 })
    }

    const client = await pool.connect()
    
    let query = 'UPDATE "DepositoRecordatorios" SET '
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
    if (tipo !== undefined) {
      query += `tipo = $${paramCount++}, `
      values.push(tipo)
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

    query += `updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount++} AND deposito_id = $${paramCount++} RETURNING *`
    values.push(id, depositoId)
    
    const result = await client.query(query, values)
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    }
    
    console.log(`✅ [DEPOSITO RECORDATORIOS] Recordatorio actualizado:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [DEPOSITO RECORDATORIOS] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const depositoId = parseInt(params.id)
    const { searchParams } = new URL(request.url)
    const recordatorioId = searchParams.get('recordatorioId')
    
    if (!recordatorioId) {
      return NextResponse.json({ error: 'ID del recordatorio es requerido' }, { status: 400 })
    }

    console.log(`📅 [DEPOSITO RECORDATORIOS] Eliminando recordatorio ${recordatorioId} del depósito ${depositoId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      DELETE FROM "DepositoRecordatorios" 
      WHERE id = $1 AND deposito_id = $2
      RETURNING *
    `, [recordatorioId, depositoId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    }
    
    console.log(`✅ [DEPOSITO RECORDATORIOS] Recordatorio eliminado`)
    return NextResponse.json({ message: 'Recordatorio eliminado correctamente' })
  } catch (error) {
    console.error('❌ [DEPOSITO RECORDATORIOS] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
