import { NextRequest, NextResponse } from 'next/server'
import { getClientes, createClienteReminder, getClienteReminders } from '@/lib/direct-database'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const clienteId = parseInt(id)
    
    if (isNaN(clienteId)) {
      return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
    }

    const reminders = await getClienteReminders(clienteId)
    return NextResponse.json(reminders)
  } catch (error) {
    console.error('Error fetching client reminders:', error)
    return NextResponse.json({ error: 'Error al obtener recordatorios' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const clienteId = parseInt(id)
    
    if (isNaN(clienteId)) {
      return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
    }

    const body = await request.json()
    const { titulo, descripcion, tipo, prioridad, fechaRecordatorio, dealId } = body

    if (!titulo || !fechaRecordatorio) {
      return NextResponse.json({ error: 'Título y fecha son requeridos' }, { status: 400 })
    }

    const reminder = await createClienteReminder({
      clienteId,
      titulo,
      descripcion: descripcion || '',
      tipo: tipo || 'llamada',
      prioridad: prioridad || 'media',
      fechaRecordatorio: new Date(fechaRecordatorio).toISOString(),
      dealId: dealId || undefined
    })

    return NextResponse.json(reminder, { status: 201 })
  } catch (error) {
    console.error('Error creating client reminder:', error)
    return NextResponse.json({ error: 'Error al crear recordatorio' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const clienteId = parseInt(id)
    
    if (isNaN(clienteId)) {
      return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
    }

    const data = await request.json()
    console.log(`📅 [CLIENTE RECORDATORIOS] Actualizando recordatorio ${data.id} del cliente ${clienteId}`)
    
    if (!data.id) {
      return NextResponse.json({ error: 'ID de recordatorio es requerido' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      UPDATE "ClienteReminder" 
      SET titulo = $1, descripcion = $2, tipo = $3, prioridad = $4, "fechaRecordatorio" = $5, completado = $6
      WHERE id = $7 AND "clienteId" = $8
      RETURNING *
    `, [
      data.titulo, 
      data.descripcion || '', 
      data.tipo || 'llamada', 
      data.prioridad || 'media', 
      data.fechaRecordatorio, 
      data.completado || false,
      data.id, 
      clienteId
    ])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    }
    
    console.log(`✅ [CLIENTE RECORDATORIOS] Recordatorio actualizado:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [CLIENTE RECORDATORIOS] Error actualizando recordatorio:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const clienteId = parseInt(id)
    
    if (isNaN(clienteId)) {
      return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const recordatorioId = searchParams.get('recordatorioId')
    
    if (!recordatorioId) {
      return NextResponse.json({ error: 'ID de recordatorio es requerido' }, { status: 400 })
    }

    console.log(`🗑️ [CLIENTE RECORDATORIOS] Eliminando recordatorio ${recordatorioId} del cliente ${clienteId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      DELETE FROM "ClienteReminder" 
      WHERE id = $1 AND "clienteId" = $2
      RETURNING *
    `, [recordatorioId, clienteId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    }
    
    console.log(`✅ [CLIENTE RECORDATORIOS] Recordatorio eliminado`)
    return NextResponse.json({ message: 'Recordatorio eliminado correctamente' })
  } catch (error) {
    console.error('❌ [CLIENTE RECORDATORIOS] Error eliminando recordatorio:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
