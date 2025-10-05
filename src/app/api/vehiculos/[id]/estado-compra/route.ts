import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Obtener estado de compra del vehículo
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const vehiculoId = parseInt(params.id)

    if (isNaN(vehiculoId)) {
      return NextResponse.json(
        { error: 'ID de vehículo inválido' },
        { status: 400 }
      )
    }

    const vehiculo = await prisma.vehiculo.findUnique({
      where: { id: vehiculoId },
      select: {
        id: true,
        pagado: true,
        transporteSolicitado: true,
        recibido: true,
      },
    })

    if (!vehiculo) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      pagado: vehiculo.pagado || false,
      transporteSolicitado: vehiculo.transporteSolicitado || false,
      recibido: vehiculo.recibido || false,
    })
  } catch (error) {
    console.error('Error al obtener estado de compra:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// PUT - Actualizar estado de compra del vehículo
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const vehiculoId = parseInt(params.id)

    if (isNaN(vehiculoId)) {
      return NextResponse.json(
        { error: 'ID de vehículo inválido' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { pagado, transporteSolicitado, recibido } = body

    console.log('📝 [API] Datos recibidos:', {
      vehiculoId,
      pagado,
      transporteSolicitado,
      recibido,
    })

    // Validar que los campos sean booleanos
    if (
      typeof pagado !== 'boolean' ||
      typeof transporteSolicitado !== 'boolean' ||
      typeof recibido !== 'boolean'
    ) {
      console.log('❌ [API] Validación fallida:', {
        pagado: typeof pagado,
        transporteSolicitado: typeof transporteSolicitado,
        recibido: typeof recibido,
      })
      return NextResponse.json(
        { error: 'Los campos deben ser booleanos' },
        { status: 400 }
      )
    }

    const vehiculo = await prisma.vehiculo.update({
      where: { id: vehiculoId },
      data: {
        pagado,
        transporteSolicitado,
        recibido,
      },
      select: {
        id: true,
        pagado: true,
        transporteSolicitado: true,
        recibido: true,
      },
    })

    console.log('✅ [API] Vehículo actualizado:', vehiculo)

    return NextResponse.json({
      pagado: vehiculo.pagado,
      transporteSolicitado: vehiculo.transporteSolicitado,
      recibido: vehiculo.recibido,
    })
  } catch (error) {
    console.error('Error al actualizar estado de compra:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
