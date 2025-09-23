import { NextRequest, NextResponse } from 'next/server'
import { getVehiculosByInversor } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const inversorId = parseInt(id)

    if (isNaN(inversorId)) {
      return NextResponse.json(
        { error: 'ID de inversor inválido' },
        { status: 400 }
      )
    }

    const vehiculos = await getVehiculosByInversor(inversorId)
    return NextResponse.json(vehiculos)
  } catch (error) {
    console.error('Error al obtener vehículos del inversor:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
