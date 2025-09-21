import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const clienteId = parseInt(id)
    
    console.log(`🔍 GET notas para cliente ${clienteId}`)
    
    if (isNaN(clienteId)) {
      console.log(`❌ ID inválido: ${id}`)
      return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
    }

    console.log(`📊 Ejecutando query para obtener notas...`)
    const result = await pool.query(`
      SELECT * FROM "NotaCliente" 
      WHERE "clienteId" = $1 
      ORDER BY fecha DESC
    `, [clienteId])
    
    console.log(`✅ Notas encontradas: ${result.rows.length}`)
    console.log(`📋 Notas:`, result.rows)
    
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ Error obteniendo notas del cliente:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Error code:', error.code)
    return NextResponse.json({ 
      error: 'Error interno del servidor', 
      details: error.message,
      code: error.code 
    }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const clienteId = parseInt(id)
    
    console.log(`📝 POST nueva nota para cliente ${clienteId}`)
    
    if (isNaN(clienteId)) {
      console.log(`❌ ID inválido: ${id}`)
      return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
    }

    const data = await request.json()
    console.log(`📊 Datos recibidos:`, data)
    
    const { tipo, titulo, contenido, prioridad, usuario } = data
    
    if (!contenido || contenido.trim().length === 0) {
      console.log(`❌ Contenido vacío`)
      return NextResponse.json({ error: 'El contenido de la nota es requerido' }, { status: 400 })
    }
    
    console.log(`📊 Ejecutando INSERT en NotaCliente...`)
    const result = await pool.query(`
      INSERT INTO "NotaCliente" (
        "clienteId", tipo, titulo, contenido, prioridad, usuario,
        fecha, "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW()
      ) RETURNING *
    `, [
      clienteId,
      tipo || 'general',
      titulo || 'Nota general',
      contenido.trim(),
      prioridad || 'normal',
      usuario || 'Sistema'
    ])
    
    console.log(`✅ Nota creada exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('❌ Error creando nota del cliente:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Error code:', error.code)
    return NextResponse.json({ 
      error: 'Error interno del servidor',
      details: error.message,
      code: error.code
    }, { status: 500 })
  }
}

// PUT - Editar nota específica
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const clienteId = parseInt(id)
    const data = await request.json()
    
    console.log(`✏️ PUT editar nota para cliente ${clienteId}`)
    console.log(`📊 Datos recibidos:`, data)
    
    const { notaId, contenido, tipo, titulo, prioridad } = data
    
    if (!notaId || !contenido || contenido.trim().length === 0) {
      console.log(`❌ Datos incompletos`)
      return NextResponse.json({ error: 'ID de nota y contenido son requeridos' }, { status: 400 })
    }
    
    console.log(`📊 Ejecutando UPDATE en NotaCliente...`)
    const result = await pool.query(`
      UPDATE "NotaCliente" 
      SET contenido = $1, tipo = $2, titulo = $3, prioridad = $4, "updatedAt" = NOW()
      WHERE id = $5 AND "clienteId" = $6
      RETURNING *
    `, [
      contenido.trim(),
      tipo || 'general',
      titulo || 'Nota general',
      prioridad || 'normal',
      notaId,
      clienteId
    ])
    
    if (result.rows.length === 0) {
      console.log(`❌ Nota no encontrada`)
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    console.log(`✅ Nota editada exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ Error editando nota del cliente:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Error code:', error.code)
    return NextResponse.json({ 
      error: 'Error interno del servidor',
      details: error.message,
      code: error.code
    }, { status: 500 })
  }
}

// DELETE - Eliminar nota específica  
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const clienteId = parseInt(id)
    const url = new URL(request.url)
    const notaId = url.searchParams.get('notaId')
    
    console.log(`🗑️ DELETE nota ${notaId} para cliente ${clienteId}`)
    
    if (!notaId) {
      console.log(`❌ notaId no proporcionado`)
      return NextResponse.json({ error: 'ID de nota es requerido' }, { status: 400 })
    }
    
    console.log(`📊 Ejecutando DELETE en NotaCliente...`)
    const result = await pool.query(`
      DELETE FROM "NotaCliente" 
      WHERE id = $1 AND "clienteId" = $2
      RETURNING *
    `, [notaId, clienteId])
    
    if (result.rows.length === 0) {
      console.log(`❌ Nota no encontrada`)
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }
    
    console.log(`✅ Nota eliminada exitosamente:`, result.rows[0])
    return NextResponse.json({ success: true, deletedNota: result.rows[0] })
  } catch (error) {
    console.error('❌ Error eliminando nota del cliente:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Error code:', error.code)
    return NextResponse.json({ 
      error: 'Error interno del servidor',
      details: error.message,
      code: error.code
    }, { status: 500 })
  }
}