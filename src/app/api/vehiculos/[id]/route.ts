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
import { normalizarMatricula, normalizarReferencia } from '@/lib/normalizacion'
import { esFechaYMD } from '@/lib/fechas'
import {
  esPasoVehiculo,
  getPasos,
  upsertPasos,
  type PasoInput,
} from '@/lib/vehiculoPasos'

// Fechas 'YYYY-MM-DD' o null: vencimientos + fecha de recepción del coche.
const CAMPOS_FECHA_VENCIMIENTO = [
  'itvVence',
  'seguroVence',
  'garantiaVence',
  'recibidoFecha',
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

    let pasos: Awaited<ReturnType<typeof getPasos>> = []
    try {
      pasos = await getPasos(id)
    } catch (err) {
      console.error('pasos vehículo:', (err as Error)?.message ?? err)
    }
    return NextResponse.json({ ...vehiculo, pasos })
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

    // Checklist de preparación (vehiculo_pasos): va aparte de la whitelist.
    let pasosBody: PasoInput[] | null = null
    if ('pasos' in body) {
      if (!Array.isArray(body.pasos)) {
        return NextResponse.json(
          { error: 'pasos debe ser un array de {paso, texto, fecha}' },
          { status: 400 }
        )
      }
      pasosBody = []
      for (const p of body.pasos as unknown[]) {
        const item = (p ?? {}) as Record<string, unknown>
        if (!esPasoVehiculo(item.paso)) {
          return NextResponse.json(
            { error: `Paso no reconocido: '${String(item.paso)}'` },
            { status: 400 }
          )
        }
        const fecha = item.fecha
        if (fecha != null && fecha !== '' && !esFechaYMD(fecha)) {
          return NextResponse.json(
            {
              error: `Fecha inválida en paso ${item.paso}: '${String(fecha)}' (formato esperado YYYY-MM-DD o null)`,
            },
            { status: 400 }
          )
        }
        pasosBody.push({
          paso: item.paso,
          texto: item.texto == null ? null : String(item.texto),
          fecha: fecha == null || fecha === '' ? null : (fecha as string),
        })
      }
      delete body.pasos
    }

    // Whitelist: solo campos que la UI edita; lo demás se ignora (id, force,
    // campos internos como dealActivoId/orden, o cualquier cosa inesperada).
    const { data: updateData, ignorados } = filtrarCamposEditables(body)
    if (ignorados.length > 0) {
      console.warn(
        '⚠️ Campos no editables ignorados en PUT vehículo:',
        ignorados
      )
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
      matriculaNorm = normalizarMatricula(matriculaLimpia)
      if (
        matriculaNorm !== normalizarMatricula(vehiculoExistente.matricula ?? '')
      ) {
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

    // Referencia sin cambios (vehículo legacy) → se deja tal cual, sin normalizar
    // ni validar (no se borra: un body con sólo ese campo dejaría el SET vacío).
    const referenciaSinCambios =
      typeof updateData.referencia === 'string' &&
      updateData.referencia.trim() ===
        String(vehiculoExistente.referencia ?? '').trim()
    if (typeof updateData.referencia === 'string' && !referenciaSinCambios) {
      const tipoEf = (body.tipo as string | undefined) ?? vehiculoExistente.tipo
      const referenciaCanon = normalizarReferencia(
        updateData.referencia,
        tipoEf
      )
      if (!referenciaCanon) {
        return NextResponse.json(
          { error: `Referencia no reconocida: '${updateData.referencia}'` },
          { status: 400 }
        )
      }
      updateData.referencia = referenciaCanon
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

    // Actualizar el vehículo con los nuevos datos (un body con sólo `pasos`
    // no toca "Vehiculo": el SET quedaría vacío).
    const vehiculoActualizado =
      Object.keys(updateData).length > 0
        ? await updateVehiculo(id, updateData as Partial<Vehiculo>)
        : vehiculoExistente

    if (pasosBody && pasosBody.length > 0) {
      await upsertPasos(id, pasosBody, 'crm')
    }

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
        const { notifyInversorVehiculoEvento } = await import(
          '@/lib/inversorNotify'
        )
        await notifyInversorVehiculoEvento(
          id,
          estadoNuevoNorm === 'RESERVADO' ? 'reservado' : 'vendido'
        )
      } catch (err) {
        console.error('notify inversor:', (err as Error)?.message ?? err)
      }
    }

    // Aviso a la web (ficha pública) en paralelo al del inversor, pero para
    // TODOS los coches y también al volver a PUBLICADO/DISPONIBLE: si no, un
    // coche que se desreserva se queda "reservado" en la web para siempre.
    if (estadoNuevoNorm && estadoNuevoNorm !== estadoPrevioNorm) {
      try {
        const { notifyWebVehiculoEstado } = await import('@/lib/webSync')
        await notifyWebVehiculoEstado(
          id,
          estadoNuevoNorm,
          vehiculoActualizado?.matricula ?? vehiculoExistente.matricula ?? null
        )
      } catch (err) {
        console.error('notify web:', (err as Error)?.message ?? err)
      }
      // Checklist de preparación: fecha de hoy en el paso al que entra.
      try {
        const { registrarPasoEstado } = await import('@/lib/vehiculoPasos')
        await registrarPasoEstado(id, estadoNuevoNorm)
      } catch (err) {
        console.error('registrar paso:', (err as Error)?.message ?? err)
      }
    }
    // Fila del vehículo en las hojas (upsert por referencia, en background).
    if (Object.keys(updateData).length > 0 || (pasosBody?.length ?? 0) > 0) {
      try {
        const { encolarSheetsVehiculo } = await import('@/lib/sheetsVehiculo')
        await encolarSheetsVehiculo(
          id,
          estadoNuevoNorm && estadoNuevoNorm !== estadoPrevioNorm
            ? 'estado'
            : 'update'
        )
      } catch (err) {
        console.error('encolar sheets:', (err as Error)?.message ?? err)
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
