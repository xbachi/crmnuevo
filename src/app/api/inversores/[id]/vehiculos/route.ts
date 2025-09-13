import { NextRequest, NextResponse } from 'next/server'
import { getVehiculosByInversor, getInversorById } from '@/lib/direct-database'

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
    
    // Verificar que el inversor existe
    const inversor = await getInversorById(id)
    if (!inversor) {
      return NextResponse.json({ error: 'Inversor no encontrado' }, { status: 404 })
    }
    
    const vehiculos = await getVehiculosByInversor(id)
    return NextResponse.json(vehiculos)
  } catch (error) {
    console.error('Error al obtener vehículos del inversor:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
