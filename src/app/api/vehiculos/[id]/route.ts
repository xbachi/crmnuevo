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
  normalizarTipo,
  transicionValida,
} from '@/lib/vehiculoEstado'
import { normPlate } from '@/lib/gastoMapping'
import { esFechaYMD } from '@/lib/fechas'

const CAMPOS_FECHA_VENCIMIENTO = [
  'itvVence',
  'seguroVence',
  'garantiaVence',
] as const

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

    // Tipo: sanear cualquier variante (palabra/letra, con/sin tilde) a la
    // letra canónica ANTES de la whitelist y de la lógica de inversor. Un
    // cliente viejo que mande 'Compra'/'Inversor' queda saneado en un solo punto.
    if (body.tipo !== undefined && body.tipo !== null && body.tipo !== '') {
      const tipoNorm = normalizarTipo(body.tipo)
      if (!tipoNorm) {
        return NextResponse.json(
          { error: `Tipo de vehículo no reconocido: '${body.tipo}'` },
          { status: 400 }
        )
      }
      body.tipo = tipoNorm
    }

    // Whitelist: solo campos que la UI edita; lo demás se ignora (id, force,
    // campos internos como dealActivoId/orden, o cualquier cosa inesperada).
    const { data: updateData, ignorados } = filtrarCamposEditables(body)
    if (ignorados.length > 0) {
      console.warn('⚠️ Campos no editables ignorados en PUT vehículo:', ignorados)
    }

    // Fechas de vencimiento: 'YYYY-MM-DD' o null ('' cuenta como null).
    for (const campo of CAMPOS_FECHA_VENCIMIENTO) {
      if (!(campo in updateData)) continue
      const v = updateData[campo]
      if (v === null || v === '') {
        updateData[campo] = null
        continue
      }
      if (!esFechaYMD(v)) {
        return NextResponse.json(
          {
            error: `${campo} inválida: '${String(v)}' (formato esperado YYYY-MM-DD o null)`,
          },
          { status: 400 }
        )
      }
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
              hint: 'si el cambio es intencional, reenvía con force: true',
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

    // Matrícula: normalizar espacios al guardar y exponer matriculaNorm.
    // Un CAMBIO real de matrícula no pasa por acá: pisaría el historial y
    // dejaría las facturas/carpetas/CB ya emitidas colgadas de la vieja.
    if (typeof updateData.matricula === 'string') {
      const matriculaLimpia = updateData.matricula
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase()
      matriculaNorm = normPlate(matriculaLimpia)
      if (matriculaNorm !== normPlate(vehiculoExistente.matricula ?? '')) {
        return NextResponse.json(
          {
            error: 'La matrícula no se cambia por este endpoint',
            hint: `usa POST /api/vehiculos/${id}/matricula { matricula, motivo } — deja historial y mantiene los cruces por la matrícula anterior`,
          },
          { status: 409 }
        )
      }
      updateData.matricula = matriculaLimpia
    }

    // Si el tipo es 'I' (Inversor), gestionar inversorId y esCocheInversor.
    // body.tipo ya está normalizado a letra en este punto.
    if (body.tipo === 'I') {
      // Resolver el inversorId efectivo: el del body si viene, si no el existente.
      const inversorIdRaw =
        'inversorId' in body ? body.inversorId : vehiculoExistente.inversorId
      const inversorIdNum =
        inversorIdRaw !== undefined &&
        inversorIdRaw !== null &&
        inversorIdRaw !== ''
          ? typeof inversorIdRaw === 'string'
            ? parseInt(inversorIdRaw)
            : (inversorIdRaw as number)
          : null

      // Un vehículo de tipo Inversor DEBE tener un inversor asignado (>0).
      if (!inversorIdNum || inversorIdNum <= 0 || Number.isNaN(inversorIdNum)) {
        return NextResponse.json(
          {
            error: 'Un vehículo de tipo Inversor requiere un inversor asignado',
            hint: 'envía inversorId (> 0) junto con tipo: "I"',
          },
          { status: 400 }
        )
      }

      updateData.inversorId = inversorIdNum
      updateData.esCocheInversor = true
    } else if (body.tipo !== undefined) {
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

    // Aviso automático al inversor si el estado pasó a RESERVADO/VENDIDO por
    // edición manual (el flujo de deals tiene su propio hook en updateDeal).
    const estadoNuevoNorm = updateData.estado
      ? normalizarEstado(String(updateData.estado))
      : null
    const estadoPrevioNorm = normalizarEstado(vehiculoExistente.estado)
    if (
      estadoNuevoNorm &&
      estadoNuevoNorm !== estadoPrevioNorm &&
      (estadoNuevoNorm === 'RESERVADO' || estadoNuevoNorm === 'VENDIDO')
    ) {
      try {
        const { notifyInversorVehiculoEvento } = await import('@/lib/inversorNotify')
        await notifyInversorVehiculoEvento(
          id,
          estadoNuevoNorm === 'RESERVADO' ? 'reservado' : 'vendido'
        )
      } catch (err) {
        console.error('notify inversor:', (err as Error)?.message ?? err)
      }
    }
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
