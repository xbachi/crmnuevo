import { NextRequest, NextResponse } from 'next/server'
import { getVehiculoById, updateVehiculo, deleteVehiculo } from '@/lib/direct-database'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idString } = await params
    const id = parseInt(idString)
    
    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const vehiculo = await getVehiculoById(id)
    
    if (!vehiculo) {
      return NextResponse.json({ error: 'Vehículo no encontrado' }, { status: 404 })
    }

    return NextResponse.json(vehiculo)
  } catch (error) {
    console.error('Error al obtener vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idString } = await params
    const id = parseInt(idString)
    
    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json()
    
    // Verificar que el vehículo existe
    const vehiculoExistente = await getVehiculoById(id)
    if (!vehiculoExistente) {
      return NextResponse.json({ error: 'Vehículo no encontrado' }, { status: 404 })
    }

    // Actualizar el vehículo con los nuevos datos
    const vehiculoActualizado = await updateVehiculo(id, body)

    return NextResponse.json(vehiculoActualizado)
  } catch (error) {
    console.error('Error al actualizar vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idString } = await params
    const id = parseInt(idString)
    
    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    // Verificar que el vehículo existe
    const vehiculoExistente = await getVehiculoById(id)
    if (!vehiculoExistente) {
      return NextResponse.json({ error: 'Vehículo no encontrado' }, { status: 404 })
    }

    await deleteVehiculo(id)

    return NextResponse.json({ message: 'Vehículo eliminado correctamente' })
  } catch (error) {
    console.error('Error al eliminar vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
