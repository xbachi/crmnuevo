import { NextResponse } from 'next/server'
import { getVehiculoStats } from '@/lib/direct-database'

export async function GET() {
  try {
    const stats = await getVehiculoStats()
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching vehiculo stats:', error)
    return NextResponse.json({ error: 'Error al obtener estadísticas de vehículos' }, { status: 500 })
  }
}
