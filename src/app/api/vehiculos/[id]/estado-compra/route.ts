import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

// Función para crear una nueva instancia de Prisma por request
function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })
}

// GET - Obtener estado de compra del vehículo
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = createPrismaClient()
  try {
    console.log('🔍 [API GET] Iniciando consulta de estado de compra')
    const { id } = await params
    const vehiculoId = parseInt(id)
    console.log('🔍 [API GET] Vehículo ID:', vehiculoId)

    if (isNaN(vehiculoId)) {
      console.log('❌ [API GET] ID de vehículo inválido:', id)
      return NextResponse.json(
        { error: 'ID de vehículo inválido' },
        { status: 400 }
      )
    }

    console.log('🔍 [API GET] Buscando vehículo en base de datos...')
    const vehiculo = await prisma.vehiculo.findUnique({
      where: { id: vehiculoId },
      select: {
        id: true,
        pagado: true,
        transporteSolicitado: true,
        recibido: true,
      },
    })

    console.log('🔍 [API GET] Resultado de búsqueda:', vehiculo)

    if (!vehiculo) {
      console.log('❌ [API GET] Vehículo no encontrado')
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    const response = {
      pagado: vehiculo.pagado || false,
      transporteSolicitado: vehiculo.transporteSolicitado || false,
      recibido: vehiculo.recibido || false,
    }

    console.log('✅ [API GET] Respuesta:', response)
    return NextResponse.json(response)
  } catch (error) {
    console.error('❌ [API GET] Error al obtener estado de compra:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

// PUT - Actualizar estado de compra del vehículo
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = createPrismaClient()
  try {
    const { id } = await params
    const vehiculoId = parseInt(id)

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
  } finally {
    await prisma.$disconnect()
  }
}
