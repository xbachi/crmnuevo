import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const interesadoId = parseInt(id)

    console.log(`🔍 GET notas para interesado ${interesadoId}`)

    if (isNaN(interesadoId)) {
      console.log(`❌ ID inválido: ${id}`)
      return NextResponse.json(
        { error: 'ID de interesado inválido' },
        { status: 400 }
      )
    }

    console.log(`📊 Ejecutando query para obtener notas...`)
    const result = await pool.query(
      `
      SELECT * FROM "NotaInteresado" 
      WHERE "interesadoId" = $1 
      ORDER BY fecha DESC
    `,
      [interesadoId]
    )

    console.log(`✅ Notas encontradas: ${result.rows.length}`)
    console.log(`📋 Notas:`, result.rows)

    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('❌ Error obteniendo notas del interesado:', error)
    console.error(
      '❌ Error stack:',
      error instanceof Error ? error.stack : 'No stack available'
    )
    console.error(
      '❌ Error code:',
      error instanceof Error && 'code' in error
        ? error.code
        : 'No code available'
    )
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido',
        code:
          error instanceof Error && 'code' in error ? error.code : undefined,
      },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const interesadoId = parseInt(id)

    console.log(`📝 POST nueva nota para interesado ${interesadoId}`)

    if (isNaN(interesadoId)) {
      console.log(`❌ ID inválido: ${id}`)
      return NextResponse.json(
        { error: 'ID de interesado inválido' },
        { status: 400 }
      )
    }

    const data = await request.json()
    console.log(`📊 Datos recibidos:`, data)

    const { tipo, titulo, contenido, prioridad, usuario } = data

    if (!contenido || contenido.trim().length === 0) {
      console.log(`❌ Contenido vacío`)
      return NextResponse.json(
        { error: 'El contenido de la nota es requerido' },
        { status: 400 }
      )
    }

    console.log(`📊 Ejecutando INSERT en NotaInteresado...`)
    const result = await pool.query(
      `
      INSERT INTO "NotaInteresado" (
        "interesadoId", tipo, titulo, contenido, prioridad, usuario,
        fecha, "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW()
      ) RETURNING *
    `,
      [
        interesadoId,
        tipo || 'general',
        titulo || 'Nota general',
        contenido.trim(),
        prioridad || 'normal',
        usuario || 'Sistema',
      ]
    )

    console.log(`✅ Nota creada exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error('❌ Error creando nota del interesado:', error)
    console.error(
      '❌ Error stack:',
      error instanceof Error ? error.stack : 'No stack available'
    )
    console.error(
      '❌ Error code:',
      error instanceof Error && 'code' in error
        ? error.code
        : 'No code available'
    )
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido',
        code:
          error instanceof Error && 'code' in error ? error.code : undefined,
      },
      { status: 500 }
    )
  }
}

// PUT - Editar nota específica
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const interesadoId = parseInt(id)
    const data = await request.json()

    console.log(`✏️ PUT editar nota para interesado ${interesadoId}`)
    console.log(`📊 Datos recibidos:`, data)

    const { notaId, contenido, tipo, titulo, prioridad } = data

    if (!notaId || !contenido || contenido.trim().length === 0) {
      console.log(`❌ Datos incompletos`)
      return NextResponse.json(
        { error: 'ID de nota y contenido son requeridos' },
        { status: 400 }
      )
    }

    console.log(`📊 Ejecutando UPDATE en NotaInteresado...`)
    const result = await pool.query(
      `
      UPDATE "NotaInteresado" 
      SET contenido = $1, tipo = $2, titulo = $3, prioridad = $4, "updatedAt" = NOW()
      WHERE id = $5 AND "interesadoId" = $6
      RETURNING *
    `,
      [
        contenido.trim(),
        tipo || 'general',
        titulo || 'Nota general',
        prioridad || 'normal',
        notaId,
        interesadoId,
      ]
    )

    if (result.rows.length === 0) {
      console.log(`❌ Nota no encontrada`)
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }

    console.log(`✅ Nota editada exitosamente:`, result.rows[0])
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('❌ Error editando nota del interesado:', error)
    const errorMessage =
      error instanceof Error ? error.message : 'Error desconocido'
    const errorCode =
      error instanceof Error && 'code' in error
        ? (error as { code: string }).code
        : 'UNKNOWN'
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: errorMessage,
        code: errorCode,
      },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar nota específica
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const interesadoId = parseInt(id)
    const url = new URL(request.url)
    const notaId = url.searchParams.get('notaId')

    console.log(`🗑️ DELETE nota ${notaId} para interesado ${interesadoId}`)

    if (!notaId) {
      console.log(`❌ notaId no proporcionado`)
      return NextResponse.json(
        { error: 'ID de nota es requerido' },
        { status: 400 }
      )
    }

    console.log(`📊 Ejecutando DELETE en NotaInteresado...`)
    const result = await pool.query(
      `
      DELETE FROM "NotaInteresado" 
      WHERE id = $1 AND "interesadoId" = $2
      RETURNING *
    `,
      [notaId, interesadoId]
    )

    if (result.rows.length === 0) {
      console.log(`❌ Nota no encontrada`)
      return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 })
    }

    console.log(`✅ Nota eliminada exitosamente:`, result.rows[0])
    return NextResponse.json({ success: true, deletedNota: result.rows[0] })
  } catch (error) {
    console.error('❌ Error eliminando nota del interesado:', error)
    const errorMessage =
      error instanceof Error ? error.message : 'Error desconocido'
    const errorCode =
      error instanceof Error && 'code' in error
        ? (error as { code: string }).code
        : 'UNKNOWN'
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: errorMessage,
        code: errorCode,
      },
      { status: 500 }
    )
  }
}
