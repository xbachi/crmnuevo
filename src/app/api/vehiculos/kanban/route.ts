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
      if (!update.id || !update.estado || typeof update.orden !== 'number') {
        return NextResponse.json(
          { error: 'Each update must have id, estado, and orden' },
          { status: 400 }
        )
      }
    }

    const updatedVehiculos = await updateVehiculosOrden(updates)

    return NextResponse.json(updatedVehiculos)
  } catch (error: any) {
    console.error('Error updating vehiculos orden:', error)
    return NextResponse.json(
      { error: 'Error updating vehiculos orden' },
      { status: 500 }
    )
  }
}
