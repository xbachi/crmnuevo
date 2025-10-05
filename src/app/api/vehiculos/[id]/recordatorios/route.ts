import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

// Función para crear una nueva instancia de Prisma por request
function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = createPrismaClient()
  try {
    const { id: vehiculoId } = await params
    console.log(
      `📅 [VEHICULO RECORDATORIOS] Obteniendo recordatorios para vehículo ${vehiculoId}`
    )

    // Usar Prisma para obtener recordatorios
    const recordatorios = await prisma.$queryRaw`
      SELECT * FROM "VehiculoRecordatorios" 
      WHERE vehiculo_id = ${parseInt(vehiculoId)} 
      ORDER BY fecha_recordatorio ASC, created_at DESC
    `

    console.log(
      `📅 [VEHICULO RECORDATORIOS] Encontrados ${recordatorios.length} recordatorios`
    )
    return NextResponse.json(recordatorios)
  } catch (error) {
    console.error(
      '❌ [VEHICULO RECORDATORIOS] Error al obtener recordatorios del vehículo:',
      error
    )
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = createPrismaClient()
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

    const result = await prisma.$queryRaw`
      INSERT INTO "VehiculoRecordatorios" (vehiculo_id, titulo, descripcion, tipo, prioridad, fecha_recordatorio, completado, created_at, updated_at)
      VALUES (${parseInt(vehiculoId)}, ${titulo.trim()}, ${descripcion?.trim() || ''}, ${tipo}, ${prioridad}, ${fecha_recordatorio}, false, NOW(), NOW())
      RETURNING *
    `

    console.log(
      `✅ [VEHICULO RECORDATORIOS] Recordatorio creado exitosamente:`,
      result[0]
    )
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error(
      '❌ [VEHICULO RECORDATORIOS] Error al crear recordatorio del vehículo:',
      error
    )
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = createPrismaClient()
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

    const result = await prisma.$queryRaw`
      UPDATE "VehiculoRecordatorios" 
      SET titulo = COALESCE(${titulo}, titulo),
          descripcion = COALESCE(${descripcion}, descripcion),
          tipo = COALESCE(${tipo}, tipo),
          prioridad = COALESCE(${prioridad}, prioridad),
          fecha_recordatorio = COALESCE(${fecha_recordatorio}, fecha_recordatorio),
          completado = COALESCE(${completado}, completado),
          updated_at = NOW()
      WHERE id = ${parseInt(recordatorioId)} AND vehiculo_id = ${parseInt(vehiculoId)}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Recordatorio no encontrado' },
        { status: 404 }
      )
    }

    console.log(
      `✅ [VEHICULO RECORDATORIOS] Recordatorio actualizado exitosamente:`,
      result[0]
    )
    return NextResponse.json(result[0])
  } catch (error) {
    console.error(
      '❌ [VEHICULO RECORDATORIOS] Error al actualizar recordatorio del vehículo:',
      error
    )
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = createPrismaClient()
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

    const result = await prisma.$queryRaw`
      DELETE FROM "VehiculoRecordatorios" 
      WHERE id = ${parseInt(recordatorioId)} AND vehiculo_id = ${parseInt(vehiculoId)}
      RETURNING id
    `

    if (result.length === 0) {
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
  } finally {
    await prisma.$disconnect()
  }
}
