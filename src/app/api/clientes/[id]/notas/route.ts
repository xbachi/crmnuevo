import { NextRequest, NextResponse } from 'next/server'
import { getNotasByCliente, addNotaCliente } from '@/lib/direct-database'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const id = parseInt(idParam)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
  }

  try {
    const notas = await getNotasByCliente(id)
    return NextResponse.json(notas)
  } catch (error) {
    console.error('Error al obtener notas del cliente:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const id = parseInt(idParam)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
  }

  try {
    const data = await request.json()
    
    if (!data.titulo || data.titulo.trim() === '') {
      return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 })
    }
    
    if (!data.contenido || data.contenido.trim() === '') {
      return NextResponse.json({ error: 'El contenido es obligatorio' }, { status: 400 })
    }
    
    const nota = await addNotaCliente({
      clienteId: id,
      fecha: data.fecha || new Date().toISOString(),
      tipo: data.tipo || 'otro',
      titulo: data.titulo.trim(),
      contenido: data.contenido.trim(),
      archivos: data.archivos || [],
      recordatorio: data.recordatorio?.trim()
    })
    
    return NextResponse.json(nota, { status: 201 })
  } catch (error) {
    console.error('Error al crear nota:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const clienteId = parseInt(idParam)
  if (isNaN(clienteId)) {
    return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
  }

  try {
    const data = await request.json()
    console.log(`📝 [CLIENTE NOTAS] Actualizando nota ${data.id} del cliente ${clienteId}`)
    
    if (!data.id) {
      return NextResponse.json({ error: 'ID de nota es requerido' }, { status: 400 })
    }

    const client = await pool.connect()
    
    const result = await client.query(`
      UPDATE "NotaCliente" 
      SET contenido = $1, tipo = $2
      WHERE id = $3 AND "clienteId" = $4
      RETURNING *
    `, [data.contenido, data.tipo, data.id, clienteId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    console.log(`✅ [CLIENTE NOTAS] Nota actualizada:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ [CLIENTE NOTAS] Error actualizando nota:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const clienteId = parseInt(idParam)
  if (isNaN(clienteId)) {
    return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const notaId = searchParams.get('notaId')
    
    if (!notaId) {
      return NextResponse.json({ error: 'ID de nota es requerido' }, { status: 400 })
    }

    console.log(`🗑️ [CLIENTE NOTAS] Eliminando nota ${notaId} del cliente ${clienteId}`)

    const client = await pool.connect()
    
    const result = await client.query(`
      DELETE FROM "NotaCliente" 
      WHERE id = $1 AND "clienteId" = $2
      RETURNING *
    `, [notaId, clienteId])
    
    client.release()
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    console.log(`✅ [CLIENTE NOTAS] Nota eliminada`)
    return NextResponse.json({ message: 'Nota eliminada correctamente' })
  } catch (error) {
    console.error('❌ [CLIENTE NOTAS] Error eliminando nota:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

