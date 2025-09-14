import { NextRequest, NextResponse } from 'next/server'
import { updateVehiculosOrden } from '@/lib/direct-database'

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
          { error: 'Each update must have estado field (can be empty string for initial state)' },
          { status: 400 }
        )
      }
    }

    await updateVehiculosOrden(updates)

    // Obtener todos los vehículos actualizados después del cambio
    const { getVehiculos } = await import('@/lib/direct-database')
    const allVehiculos = await getVehiculos()

    return NextResponse.json(allVehiculos)
  } catch (error: any) {
    console.error('Error updating vehiculos orden:', error)
    return NextResponse.json(
      { error: 'Error updating vehiculos orden' },
      { status: 500 }
    )
  }
}
