import { NextRequest, NextResponse } from 'next/server'
import { cleanupOrphanVehicles } from '@/lib/direct-database'

export async function POST(request: NextRequest) {
  try {
    console.log('🧹 Iniciando limpieza de vehículos huérfanos desde API...')
    
    const result = await cleanupOrphanVehicles()
    
    return NextResponse.json({
      success: true,
      message: `Limpieza completada. ${result.cleanedCount} vehículos liberados de ${result.orphanCount} encontrados.`,
      data: result
    })
  } catch (error) {
    console.error('Error en limpieza de vehículos huérfanos:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Verificando vehículos huérfanos...')
    
    const result = await cleanupOrphanVehicles()
    
    return NextResponse.json({
      success: true,
      message: `Verificación completada. ${result.orphanCount} vehículos huérfanos encontrados.`,
      data: result
    })
  } catch (error) {
    console.error('Error verificando vehículos huérfanos:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
