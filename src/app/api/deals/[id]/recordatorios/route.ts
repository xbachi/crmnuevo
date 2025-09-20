import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dealId } = await params
    console.log(`📅 [DEAL RECORDATORIOS] Obteniendo recordatorios para deal ${dealId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      SELECT * FROM DealRecordatorios 
      WHERE deal_id = $1 
      ORDER BY fecha_recordatorio ASC, created_at DESC
    `, [dealId])
    
    client.release()
    
    console.log(`📅 [DEAL RECORDATORIOS] Encontrados ${result.rows.length} recordatorios`)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ [DEAL RECORDATORIOS] Error al obtener recordatorios del deal:', error)
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
    const { titulo, descripcion, tipo = 'general', prioridad = 'media', fecha_recordatorio } = data

    console.log(`📅 [DEAL RECORDATORIOS] Creando recordatorio para deal ${dealId}:`, { titulo, descripcion, tipo, prioridad, fecha_recordatorio })

    // Validaciones
    if (!titulo || titulo.trim() === '') {
      return NextResponse.json({ error: 'El título del recordatorio es obligatorio' }, { status: 400 })
    }
    
    if (!fecha_recordatorio) {
      return NextResponse.json({ error: 'La fecha del recordatorio es obligatoria' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      INSERT INTO DealRecordatorios (deal_id, titulo, descripcion, tipo, prioridad, fecha_recordatorio, completado, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `, [dealId, titulo.trim(), descripcion?.trim() || '', tipo, prioridad, fecha_recordatorio, false])
    
    client.release()
    
    console.log(`✅ [DEAL RECORDATORIOS] Recordatorio creado exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('❌ [DEAL RECORDATORIOS] Error al crear recordatorio del deal:', error)
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
    const { id: recordatorioId, titulo, descripcion, tipo, prioridad, fecha_recordatorio, completado } = data

    console.log(`✏️ [DEAL RECORDATORIOS] Actualizando recordatorio ${recordatorioId} del deal ${dealId}`)

    // Validaciones
    if (!recordatorioId) {
      return NextResponse.json({ error: 'ID de recordatorio es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      UPDATE DealRecordatorios 
      SET titulo = COALESCE($1, titulo),
          descripcion = COALESCE($2, descripcion),
          tipo = COALESCE($3, tipo),
          prioridad = COALESCE($4, prioridad),
          fecha_recordatorio = COALESCE($5, fecha_recordatorio),
          completado = COALESCE($6, completado),
          updated_at = NOW()
      WHERE id = $7 AND deal_id = $8
      RETURNING *
    `, [titulo, descripcion, tipo, prioridad, fecha_recordatorio, completado, recordatorioId, dealId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    }
    
    console.log(`✅ [DEAL RECORDATORIOS] Recordatorio actualizado exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [DEAL RECORDATORIOS] Error al actualizar recordatorio del deal:', error)
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
    const recordatorioId = searchParams.get('recordatorioId')

    console.log(`🗑️ [DEAL RECORDATORIOS] Eliminando recordatorio ${recordatorioId} del deal ${dealId}`)

    if (!recordatorioId) {
      return NextResponse.json({ error: 'ID de recordatorio es obligatorio' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      DELETE FROM DealRecordatorios 
      WHERE id = $1 AND deal_id = $2
      RETURNING id
    `, [recordatorioId, dealId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    }
    
    console.log(`✅ [DEAL RECORDATORIOS] Recordatorio eliminado exitosamente`)
    return NextResponse.json({ message: 'Recordatorio eliminado exitosamente' })
  } catch (error) {
    console.error('❌ [DEAL RECORDATORIOS] Error al eliminar recordatorio del deal:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
