import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const depositoId = parseInt(id)
    
    if (isNaN(depositoId)) {
      return NextResponse.json({ error: 'ID de depósito inválido' }, { status: 400 })
    }

    console.log(`📅 [DEPOSITO RECORDATORIOS] Obteniendo recordatorios para depósito ${depositoId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      SELECT 
        id,
        deposito_id as "depositoId",
        titulo,
        descripcion,
        tipo,
        prioridad,
        fecha_recordatorio as "fechaRecordatorio",
        completado,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM DepositoRecordatorios 
      WHERE deposito_id = $1 
      ORDER BY fecha_recordatorio ASC, created_at DESC
    `, [depositoId])
    
    client.release()
    
    console.log(`✅ [DEPOSITO RECORDATORIOS] Encontrados ${result.rows.length} recordatorios`)
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ [DEPOSITO RECORDATORIOS] Error al obtener recordatorios del depósito:', error)
    return NextResponse.json({ error: 'Error al obtener recordatorios' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const depositoId = parseInt(id)
    
    if (isNaN(depositoId)) {
      return NextResponse.json({ error: 'ID de depósito inválido' }, { status: 400 })
    }

    const body = await request.json()
    const { titulo, descripcion, tipo, prioridad, fechaRecordatorio } = body

    console.log(`📅 [DEPOSITO RECORDATORIOS] Creando recordatorio para depósito ${depositoId}:`, body)

    if (!titulo || !fechaRecordatorio) {
      return NextResponse.json({ error: 'Título y fecha son requeridos' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      INSERT INTO DepositoRecordatorios (deposito_id, titulo, descripcion, tipo, prioridad, fecha_recordatorio, completado, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING 
        id,
        deposito_id as "depositoId",
        titulo,
        descripcion,
        tipo,
        prioridad,
        fecha_recordatorio as "fechaRecordatorio",
        completado,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [
      depositoId, 
      titulo.trim(), 
      descripcion?.trim() || '', 
      tipo || 'llamada', 
      prioridad || 'media', 
      new Date(fechaRecordatorio).toISOString(), 
      false
    ])
    
    client.release()
    
    console.log(`✅ [DEPOSITO RECORDATORIOS] Recordatorio creado exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('❌ [DEPOSITO RECORDATORIOS] Error al crear recordatorio del depósito:', error)
    return NextResponse.json({ error: 'Error al crear recordatorio' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const depositoId = parseInt(id)
    
    if (isNaN(depositoId)) {
      return NextResponse.json({ error: 'ID de depósito inválido' }, { status: 400 })
    }

    const data = await request.json()
    console.log(`📅 [DEPOSITO RECORDATORIOS] Actualizando recordatorio ${data.id} del depósito ${depositoId}`)
    
    if (!data.id) {
      return NextResponse.json({ error: 'ID de recordatorio es requerido' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      UPDATE DepositoRecordatorios 
      SET titulo = $1, 
          descripcion = $2, 
          tipo = $3, 
          prioridad = $4, 
          fecha_recordatorio = $5, 
          completado = $6,
          updated_at = NOW()
      WHERE id = $7 AND deposito_id = $8
      RETURNING 
        id,
        deposito_id as "depositoId",
        titulo,
        descripcion,
        tipo,
        prioridad,
        fecha_recordatorio as "fechaRecordatorio",
        completado,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [
      data.titulo, 
      data.descripcion || '', 
      data.tipo || 'llamada', 
      data.prioridad || 'media', 
      data.fechaRecordatorio, 
      data.completado || false,
      data.id, 
      depositoId
    ])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    }
    
    console.log(`✅ [DEPOSITO RECORDATORIOS] Recordatorio actualizado:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [DEPOSITO RECORDATORIOS] Error actualizando recordatorio:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const depositoId = parseInt(id)
    
    if (isNaN(depositoId)) {
      return NextResponse.json({ error: 'ID de depósito inválido' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const recordatorioId = searchParams.get('recordatorioId')
    
    if (!recordatorioId) {
      return NextResponse.json({ error: 'ID de recordatorio es requerido' }, { status: 400 })
    }

    console.log(`🗑️ [DEPOSITO RECORDATORIOS] Eliminando recordatorio ${recordatorioId} del depósito ${depositoId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      DELETE FROM DepositoRecordatorios 
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
    console.error('❌ [DEPOSITO RECORDATORIOS] Error eliminando recordatorio:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}