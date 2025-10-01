import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: depositoId } = await params
    console.log(
      `📅 [DEPOSITO RECORDATORIOS] Obteniendo recordatorios para depósito ${depositoId}`
    )

    const client = await pool.connect()

    try {
      const result = await client.query(
        `
        SELECT * FROM "Recordatorio"
        WHERE "depositoId" = $1 
        ORDER BY fecha ASC, "createdAt" DESC
      `,
        [depositoId]
      )

      console.log(
        `📅 [DEPOSITO RECORDATORIOS] Encontrados ${result.rows.length} recordatorios`
      )
      return NextResponse.json(result.rows)
    } catch (queryError: any) {
      console.error('❌ [DEPOSITO RECORDATORIOS] Error en query:', queryError)
      // Si hay error, devolver array vacío
      return NextResponse.json([])
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(
      '❌ [DEPOSITO RECORDATORIOS] Error al obtener recordatorios del depósito:',
      error
    )
    return NextResponse.json([])
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: depositoId } = await params
    const data = await request.json()
    const {
      titulo,
      descripcion,
      tipo = 'general',
      prioridad = 'media',
      fecha,
    } = data

    console.log(
      `📅 [DEPOSITO RECORDATORIOS] Creando recordatorio para depósito ${depositoId}:`,
      { titulo, descripcion, tipo, prioridad, fecha }
    )

    // Validaciones
    if (!titulo || titulo.trim() === '') {
      return NextResponse.json(
        { error: 'El título del recordatorio es obligatorio' },
        { status: 400 }
      )
    }

    if (!fecha) {
      return NextResponse.json(
        { error: 'La fecha del recordatorio es obligatoria' },
        { status: 400 }
      )
    }

    const client = await pool.connect()

    const result = await client.query(
      `
      INSERT INTO "Recordatorio" ("depositoId", titulo, descripcion, tipo, prioridad, fecha, completado, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `,
      [
        depositoId,
        titulo.trim(),
        descripcion?.trim() || '',
        tipo,
        prioridad,
        fecha,
        false,
      ]
    )

    client.release()

    console.log(
      `✅ [DEPOSITO RECORDATORIOS] Recordatorio creado exitosamente:`,
      result.rows[0]
    )
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error(
      '❌ [DEPOSITO RECORDATORIOS] Error al crear recordatorio del depósito:',
      error
    )
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: depositoId } = await params
    const data = await request.json()
    const {
      id: recordatorioId,
      titulo,
      descripcion,
      tipo,
      prioridad,
      fecha,
      completado,
    } = data

    console.log(
      `✏️ [DEPOSITO RECORDATORIOS] Actualizando recordatorio ${recordatorioId} del depósito ${depositoId}`
    )

    // Validaciones
    if (!recordatorioId) {
      return NextResponse.json(
        { error: 'ID de recordatorio es obligatorio' },
        { status: 400 }
      )
    }

    const client = await pool.connect()

    const result = await client.query(
      `
      UPDATE "Recordatorio"
      SET titulo = COALESCE($1, titulo),
          descripcion = COALESCE($2, descripcion),
          tipo = COALESCE($3, tipo),
          prioridad = COALESCE($4, prioridad),
          fecha = COALESCE($5, fecha),
          completado = COALESCE($6, completado),
          "updatedAt" = NOW()
      WHERE id = $7 AND "depositoId" = $8
      RETURNING *
    `,
      [
        titulo,
        descripcion,
        tipo,
        prioridad,
        fecha,
        completado,
        recordatorioId,
        depositoId,
      ]
    )

    client.release()

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Recordatorio no encontrado' },
        { status: 404 }
      )
    }

    console.log(
      `✅ [DEPOSITO RECORDATORIOS] Recordatorio actualizado exitosamente:`,
      result.rows[0]
    )
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(
      '❌ [DEPOSITO RECORDATORIOS] Error al actualizar recordatorio del depósito:',
      error
    )
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: depositoId } = await params
    const { searchParams } = new URL(request.url)
    const recordatorioId = searchParams.get('recordatorioId')

    console.log(
      `🗑️ [DEPOSITO RECORDATORIOS] Eliminando recordatorio ${recordatorioId} del depósito ${depositoId}`
    )

    if (!recordatorioId) {
      return NextResponse.json(
        { error: 'ID de recordatorio es obligatorio' },
        { status: 400 }
      )
    }

    const client = await pool.connect()

    const result = await client.query(
      `
      DELETE FROM "Recordatorio"
      WHERE id = $1 AND "depositoId" = $2
      RETURNING id
    `,
      [recordatorioId, depositoId]
    )

    client.release()

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Recordatorio no encontrado' },
        { status: 404 }
      )
    }

    console.log(
      `✅ [DEPOSITO RECORDATORIOS] Recordatorio eliminado exitosamente`
    )
    return NextResponse.json({ message: 'Recordatorio eliminado exitosamente' })
  } catch (error) {
    console.error(
      '❌ [DEPOSITO RECORDATORIOS] Error al eliminar recordatorio del depósito:',
      error
    )
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
