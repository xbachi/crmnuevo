import { NextResponse } from 'next/server'
import { clearVehiculos } from '@/lib/direct-database'

export async function DELETE() {
  try {
    console.log('🧹 Borrando todos los vehículos...')
    
    await clearVehiculos()
    
    console.log('✅ Todos los vehículos han sido eliminados')
    
    return NextResponse.json({
      success: true,
      message: 'Todos los vehículos han sido eliminados exitosamente'
    })

  } catch (error: any) {
    console.error('❌ Error eliminando vehículos:', error)
    return NextResponse.json(
      { error: 'Error al eliminar los vehículos' },
      { status: 500 }
    )
  }
}
