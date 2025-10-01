import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vehiculoId } = await params
    console.log(
      `📅 [VEHICULO RECORDATORIOS] Obteniendo recordatorios para vehículo ${vehiculoId}`
    )

    const client = await pool.connect()

    try {
      const result = await client.query(
        `
        SELECT * FROM VehiculoRecordatorios 
        WHERE vehiculo_id = $1 
        ORDER BY fecha_recordatorio ASC, created_at DESC
      `,
        [vehiculoId]
      )

      console.log(
        `📅 [VEHICULO RECORDATORIOS] Encontrados ${result.rows.length} recordatorios`
      )
      return NextResponse.json(result.rows)
    } catch (queryError: any) {
      // Si la tabla no existe, devolver array vacío en lugar de error
      if (queryError.code === '42P01') {
        // Código de error de PostgreSQL para "tabla no existe"
        console.log(
          `⚠️ [VEHICULO RECORDATORIOS] Tabla VehiculoRecordatorios no existe, devolviendo array vacío`
        )
        return NextResponse.json([])
      }
      throw queryError
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(
      '❌ [VEHICULO RECORDATORIOS] Error al obtener recordatorios del vehículo:',
      error
    )
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vehiculoId } = await params
    const data = await request.json()
    const {
      titulo,
      descripcion,
      tipo = 'general',
      prioridad = 'media',
      fecha_recordatorio,
    } = data

    console.log(
      `📅 [VEHICULO RECORDATORIOS] Creando recordatorio para vehículo ${vehiculoId}:`,
      { titulo, descripcion, tipo, prioridad, fecha_recordatorio }
    )

    // Validaciones
    if (!titulo || titulo.trim() === '') {
      return NextResponse.json(
        { error: 'El título del recordatorio es obligatorio' },
        { status: 400 }
      )
    }

    if (!fecha_recordatorio) {
      return NextResponse.json(
        { error: 'La fecha del recordatorio es obligatoria' },
        { status: 400 }
      )
    }

    const client = await pool.connect()

    const result = await client.query(
      `
      INSERT INTO VehiculoRecordatorios (vehiculo_id, titulo, descripcion, tipo, prioridad, fecha_recordatorio, completado, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `,
      [
        vehiculoId,
        titulo.trim(),
        descripcion?.trim() || '',
        tipo,
        prioridad,
        fecha_recordatorio,
        false,
      ]
    )

    client.release()

    console.log(
      `✅ [VEHICULO RECORDATORIOS] Recordatorio creado exitosamente:`,
      result.rows[0]
    )
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error(
      '❌ [VEHICULO RECORDATORIOS] Error al crear recordatorio del vehículo:',
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
    const { id: vehiculoId } = await params
    const data = await request.json()
    const {
      id: recordatorioId,
      titulo,
      descripcion,
      tipo,
      prioridad,
      fecha_recordatorio,
      completado,
    } = data

    console.log(
      `✏️ [VEHICULO RECORDATORIOS] Actualizando recordatorio ${recordatorioId} del vehículo ${vehiculoId}`
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
      UPDATE VehiculoRecordatorios 
      SET titulo = COALESCE($1, titulo),
          descripcion = COALESCE($2, descripcion),
          tipo = COALESCE($3, tipo),
          prioridad = COALESCE($4, prioridad),
          fecha_recordatorio = COALESCE($5, fecha_recordatorio),
          completado = COALESCE($6, completado),
          updated_at = NOW()
      WHERE id = $7 AND vehiculo_id = $8
      RETURNING *
    `,
      [
        titulo,
        descripcion,
        tipo,
        prioridad,
        fecha_recordatorio,
        completado,
        recordatorioId,
        vehiculoId,
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
      `✅ [VEHICULO RECORDATORIOS] Recordatorio actualizado exitosamente:`,
      result.rows[0]
    )
    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error(
      '❌ [VEHICULO RECORDATORIOS] Error al actualizar recordatorio del vehículo:',
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
    const { id: vehiculoId } = await params
    const { searchParams } = new URL(request.url)
    const recordatorioId = searchParams.get('recordatorioId')

    console.log(
      `🗑️ [VEHICULO RECORDATORIOS] Eliminando recordatorio ${recordatorioId} del vehículo ${vehiculoId}`
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
      DELETE FROM VehiculoRecordatorios 
      WHERE id = $1 AND vehiculo_id = $2
      RETURNING id
    `,
      [recordatorioId, vehiculoId]
    )

    client.release()

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Recordatorio no encontrado' },
        { status: 404 }
      )
    }

    console.log(
      `✅ [VEHICULO RECORDATORIOS] Recordatorio eliminado exitosamente`
    )
    return NextResponse.json({ message: 'Recordatorio eliminado exitosamente' })
  } catch (error) {
    console.error(
      '❌ [VEHICULO RECORDATORIOS] Error al eliminar recordatorio del vehículo:',
      error
    )
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
