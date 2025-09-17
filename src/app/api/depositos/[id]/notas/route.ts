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

    const result = await pool.query(`
      SELECT * FROM "NotaDeposito" 
      WHERE "depositoId" = $1 
      ORDER BY fecha DESC
    `, [depositoId])
    
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error obteniendo notas del depósito:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
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

    const data = await request.json()
    const { tipo, titulo, contenido, prioridad, usuario } = data
    
    if (!contenido || contenido.trim().length === 0) {
      return NextResponse.json({ error: 'El contenido de la nota es requerido' }, { status: 400 })
    }
    
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
    
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('Error creando nota del depósito:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
