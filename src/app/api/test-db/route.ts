import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    console.log('🔍 [TEST DB] Iniciando test de conexión...')

    // Test 1: Conexión básica
    await prisma.$queryRaw`SELECT 1`
    console.log('✅ [TEST DB] Conexión básica OK')

    // Test 2: Contar vehículos
    const vehiculosCount = await prisma.vehiculo.count()
    console.log('✅ [TEST DB] Total vehículos:', vehiculosCount)

    // Test 3: Obtener un vehículo con los nuevos campos
    const vehiculo = await prisma.vehiculo.findFirst({
      select: {
        id: true,
        marca: true,
        modelo: true,
        pagado: true,
        transporteSolicitado: true,
        recibido: true,
      },
    })

    console.log('✅ [TEST DB] Primer vehículo:', vehiculo)

    return NextResponse.json({
      success: true,
      vehiculosCount,
      primerVehiculo: vehiculo,
      message: 'Database connection and queries working correctly',
    })
  } catch (error) {
    console.error('❌ [TEST DB] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    )
  }
}
