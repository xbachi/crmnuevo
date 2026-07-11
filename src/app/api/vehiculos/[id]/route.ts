import { NextRequest, NextResponse } from 'next/server'
import {
  getVehiculoById,
  updateVehiculo,
  deleteVehiculo,
  type Vehiculo,
} from '@/lib/direct-database'
import { handleDeleteError } from '@/lib/api-errors'
import {
  filtrarCamposEditables,
  normalizarEstado,
  transicionValida,
} from '@/lib/vehiculoEstado'
import { normPlate } from '@/lib/gastoMapping'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idString } = await params
    const id = parseInt(idString)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const vehiculo = await getVehiculoById(id)

    if (!vehiculo) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json(vehiculo)
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Error desconocido'
    console.error('Error al obtener vehículo:', errorMessage)
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
    const { id: idString } = await params
    const id = parseInt(idString)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json()

    console.log('🔍 Datos recibidos para actualizar:', body)
    console.log('🔍 body.color:', body.color)
    console.log('🔍 body.fechaMatriculacion:', body.fechaMatriculacion)
    console.log(
      '🔍 body.inversorId:',
      body.inversorId,
      'tipo:',
      typeof body.inversorId
    )
    console.log('🔍 body.tipo:', body.tipo)

    // Verificar que el vehículo existe
    const vehiculoExistente = await getVehiculoById(id)
    if (!vehiculoExistente) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    // Whitelist: solo campos que la UI edita; lo demás se ignora (id, force,
    // campos internos como dealActivoId/orden, o cualquier cosa inesperada).
    const { data: updateData, ignorados } = filtrarCamposEditables(body)
    if (ignorados.length > 0) {
      console.warn('⚠️ Campos no editables ignorados en PUT vehículo:', ignorados)
    }

    // Máquina de estados: si cambia el estado, validar la transición.
    // force=true en el body la saltea (con warn de auditoría).
    let matriculaNorm: string | undefined
    if ('estado' in updateData) {
      const estadoNorm = normalizarEstado(updateData.estado as string)
      const force = body.force === true
      if (
        !transicionValida(vehiculoExistente.estado, updateData.estado as string)
      ) {
        if (!force) {
          return NextResponse.json(
            {
              error: `Transición de estado inválida: '${vehiculoExistente.estado ?? ''}' → '${String(updateData.estado)}'`,
              hint: 'si el cambio es intencional, reenviá con force: true',
            },
            { status: 422 }
          )
        }
        console.warn(
          `⚠️ [AUDIT] Transición de estado forzada en vehículo ${id}: '${vehiculoExistente.estado ?? ''}' → '${String(updateData.estado)}'`
        )
      }
      // Guardar el estado en casing canónico (si es reconocible)
      if (estadoNorm) updateData.estado = estadoNorm
    }

    // Matrícula: normalizar espacios al guardar y exponer matriculaNorm
    if (typeof updateData.matricula === 'string') {
      const matriculaLimpia = updateData.matricula
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase()
      updateData.matricula = matriculaLimpia
      matriculaNorm = normPlate(matriculaLimpia)
    }

    // Si el tipo es 'I' (Inversor), gestionar inversorId y esCocheInversor
    if (body.tipo === 'I' || body.tipo === 'Inversor') {
      // Si viene inversorId explícitamente en el body, usarlo (puede ser null o un número)
      if ('inversorId' in body) {
        updateData.inversorId =
          body.inversorId !== undefined &&
          body.inversorId !== null &&
          body.inversorId !== ''
            ? typeof body.inversorId === 'string'
              ? parseInt(body.inversorId)
              : body.inversorId
            : null
        updateData.esCocheInversor =
          updateData.inversorId !== null &&
          updateData.inversorId !== undefined &&
          (updateData.inversorId as number) > 0
      } else {
        // Si no viene inversorId en el body, mantener el existente o establecer null si no existe
        updateData.inversorId = vehiculoExistente.inversorId || null
        updateData.esCocheInversor = vehiculoExistente.inversorId ? true : false
      }
    } else if (
      body.tipo !== undefined &&
      body.tipo !== 'I' &&
      body.tipo !== 'Inversor'
    ) {
      // Si el tipo cambia a algo que no sea Inversor, limpiar esCocheInversor e inversorId
      updateData.esCocheInversor = false
      updateData.inversorId = null
    }

    // console.log('📝 Vehículo existente:', vehiculoExistente)
    // console.log('📝 Vehículo existente.color:', vehiculoExistente.color)
    // console.log('📝 Vehículo existente.fechaMatriculacion:', vehiculoExistente.fechaMatriculacion)

    // Log para depuración
    console.log('🔍 updateData antes de guardar:', updateData)
    console.log(
      '🔍 updateData.inversorId:',
      updateData.inversorId,
      'tipo:',
      typeof updateData.inversorId
    )
    console.log('🔍 updateData.esCocheInversor:', updateData.esCocheInversor)

    // Actualizar el vehículo con los nuevos datos
    const vehiculoActualizado = await updateVehiculo(
      id,
      updateData as Partial<Vehiculo>
    )

    console.log(
      '✅ Vehículo actualizado - inversorId guardado:',
      vehiculoActualizado?.inversorId
    )
    // console.log('✅ Vehículo actualizado.color:', vehiculoActualizado?.color)
    // console.log('✅ Vehículo actualizado.fechaMatriculacion:', vehiculoActualizado?.fechaMatriculacion)

    return NextResponse.json(
      matriculaNorm !== undefined
        ? { ...vehiculoActualizado, matriculaNorm }
        : vehiculoActualizado
    )
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Error desconocido'
    console.error('Error al actualizar vehículo:', errorMessage)
    // Si el error menciona una columna que no existe, devolver un mensaje más específico
    const statusCode =
      errorMessage.includes('no existe') || errorMessage.includes('column')
        ? 400
        : 500
    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idString } = await params
    const id = parseInt(idString)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const vehiculoExistente = await getVehiculoById(id)
    if (!vehiculoExistente) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    const deleted = await deleteVehiculo(id)
    if (!deleted) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({ message: 'Vehículo eliminado correctamente' })
  } catch (error) {
    return handleDeleteError(error, 'vehículo')
  }
}
