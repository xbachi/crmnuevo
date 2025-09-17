import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const depositoId = parseInt(id)
    
    console.log(`🔍 GET notas para depósito ${depositoId}`)
    
    if (isNaN(depositoId)) {
      console.log(`❌ ID inválido: ${id}`)
      return NextResponse.json({ error: 'ID de depósito inválido' }, { status: 400 })
    }

    console.log(`📊 Ejecutando query para obtener notas...`)
    const result = await pool.query(`
      SELECT * FROM "NotaDeposito" 
      WHERE "depositoId" = $1 
      ORDER BY fecha DESC
    `, [depositoId])
    
    console.log(`✅ Notas encontradas: ${result.rows.length}`)
    console.log(`📋 Notas:`, result.rows)
    
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ Error obteniendo notas del depósito:', error)
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
    const depositoId = parseInt(id)
    
    console.log(`📝 POST nueva nota para depósito ${depositoId}`)
    
    if (isNaN(depositoId)) {
      console.log(`❌ ID inválido: ${id}`)
      return NextResponse.json({ error: 'ID de depósito inválido' }, { status: 400 })
    }

    const data = await request.json()
    console.log(`📊 Datos recibidos:`, data)
    
    const { tipo, titulo, contenido, prioridad, usuario } = data
    
    if (!contenido || contenido.trim().length === 0) {
      console.log(`❌ Contenido vacío`)
      return NextResponse.json({ error: 'El contenido de la nota es requerido' }, { status: 400 })
    }
    
    console.log(`📊 Ejecutando INSERT en NotaDeposito...`)
    const result = await pool.query(`
      INSERT INTO "NotaDeposito" (
        "depositoId", tipo, titulo, contenido, prioridad, usuario,
        fecha, "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW()
      ) RETURNING *
    `, [
      depositoId,
      tipo || 'general',
      titulo || 'Nota general',
      contenido.trim(),
      prioridad || 'normal',
      usuario || 'Sistema'
    ])
    
    console.log(`✅ Nota creada exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('❌ Error creando nota del depósito:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Error code:', error.code)
    return NextResponse.json({ 
      error: 'Error interno del servidor',
      details: error.message,
      code: error.code
    }, { status: 500 })
  }
}
