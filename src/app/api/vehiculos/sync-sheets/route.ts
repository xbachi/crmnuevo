import { NextRequest, NextResponse } from 'next/server'
import { getVehiculos } from '@/lib/direct-database'
import { isSyncEnabled, getSyncStatusMessage } from '@/config/syncConfig'

export async function POST(request: NextRequest) {
  try {
    console.log('Iniciando sincronización...')
    
    // Obtener todos los vehículos de la base de datos local
    const vehiculos = await getVehiculos()
    console.log(`Vehículos locales encontrados: ${vehiculos.length}`)
    
    // Verificar si la sincronización está habilitada
    if (!isSyncEnabled()) {
      console.log('Sincronización con Google Sheets deshabilitada por configuración')
      
      return NextResponse.json({
        success: true,
        message: `Cargados ${vehiculos.length} vehículos (sincronización deshabilitada)`,
        vehiculos: vehiculos,
        warning: getSyncStatusMessage()
      })
    }
    
    // Si está habilitada, proceder con la sincronización normal
    // Por ahora solo retornamos los vehículos locales
    return NextResponse.json({
      success: true,
      message: `Cargados ${vehiculos.length} vehículos`,
      vehiculos: vehiculos
    })
    
  } catch (error) {
    console.error('Error en sincronización:', error)
    return NextResponse.json(
      { error: 'Error al cargar los vehículos' },
      { status: 500 }
    )
  }
}
