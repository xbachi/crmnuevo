import { NextRequest, NextResponse } from 'next/server'
import { pool, updateVehiculosOrden } from '@/lib/direct-database'
import { normalizarEstado } from '@/lib/vehiculoEstado'
import { faltantesParaPublicar } from '@/lib/vehiculoCamposDoc'
import type { Faltante } from '@/lib/camposVehiculo'

/**
 * Coches de la tanda que ENTRAN en PUBLICADO (los que ya estaban publicados y
 * sólo se reordenan no cuentan: un coche publicado antes de que existieran
 * estas reglas no puede quedarse atrapado sin poder moverse dentro de su
 * columna).
 */
async function entranEnPublicado(
  updates: { id: number; estado: unknown }[]
): Promise<number[]> {
  const candidatos = updates
    .filter((u) => normalizarEstado(u.estado as string) === 'PUBLICADO')
    .map((u) => Number(u.id))
  if (candidatos.length === 0) return []
  const r = await pool.query<{ id: number; estado: string | null }>(
    `SELECT id, estado FROM "Vehiculo" WHERE id = ANY($1::int[])`,
    [candidatos]
  )
  return r.rows
    .filter((v) => normalizarEstado(v.estado) !== 'PUBLICADO')
    .map((v) => v.id)
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { updates } = body

    if (!updates || !Array.isArray(updates)) {
      return NextResponse.json(
        { error: 'Updates array is required' },
        { status: 400 }
      )
    }

    // Validar que cada update tenga los campos requeridos
    for (const update of updates) {
      if (!update.id || typeof update.orden !== 'number') {
        return NextResponse.json(
          { error: 'Each update must have id and orden' },
          { status: 400 }
        )
      }
      // Permitir estado vacío o null para la columna "Inicial"
      if (update.estado === undefined) {
        return NextResponse.json(
          {
            error:
              'Each update must have estado field (can be empty string for initial state)',
          },
          { status: 400 }
        )
      }
    }

    // Arrastrar a la columna Publicado exige la ficha completa
    // (src/lib/camposVehiculo.ts). Se comprueba ANTES de escribir nada: la
    // tanda es atómica, así que o entra entera o no entra — si no, el coche se
    // quedaría reordenado a medias y el kanban mostraría otra cosa que la DB.
    const bloqueados: { vehiculoId: number; faltantes: Faltante[] }[] = []
    for (const id of await entranEnPublicado(updates)) {
      const faltantes = await faltantesParaPublicar(id)
      if (faltantes.length > 0) bloqueados.push({ vehiculoId: id, faltantes })
    }
    if (bloqueados.length > 0) {
      const primero = bloqueados[0]
      return NextResponse.json(
        {
          error: `No se puede publicar: faltan ${primero.faltantes.map((f) => f.etiqueta).join(', ')}`,
          vehiculoId: primero.vehiculoId,
          faltantes: primero.faltantes,
          bloqueados,
        },
        { status: 409 }
      )
    }

    await updateVehiculosOrden(updates)

    // Obtener todos los vehículos actualizados después del cambio
    const { getVehiculos } = await import('@/lib/direct-database')
    const allVehiculos = await getVehiculos()

    return NextResponse.json(allVehiculos)
  } catch (error) {
    console.error('Error updating vehiculos orden:', error)
    return NextResponse.json(
      { error: 'Error updating vehiculos orden' },
      { status: 500 }
    )
  }
}
