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
    
    console.log('🔍 Datos recibidos para actualizar:', body)
    console.log('🔍 body.color:', body.color)
    console.log('🔍 body.fechaMatriculacion:', body.fechaMatriculacion)
    
    // Verificar que el vehículo existe
    const vehiculoExistente = await getVehiculoById(id)
    if (!vehiculoExistente) {
      return NextResponse.json({ error: 'Vehículo no encontrado' }, { status: 404 })
    }

    console.log('📝 Vehículo existente:', vehiculoExistente)
    console.log('📝 Vehículo existente.color:', vehiculoExistente.color)
    console.log('📝 Vehículo existente.fechaMatriculacion:', vehiculoExistente.fechaMatriculacion)
    
    // Actualizar el vehículo con los nuevos datos
    const vehiculoActualizado = await updateVehiculo(id, body)
    
    console.log('✅ Vehículo actualizado:', vehiculoActualizado)
    console.log('✅ Vehículo actualizado.color:', vehiculoActualizado?.color)
    console.log('✅ Vehículo actualizado.fechaMatriculacion:', vehiculoActualizado?.fechaMatriculacion)

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
