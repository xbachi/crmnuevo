import { NextRequest, NextResponse } from 'next/server'
import { getStockStats, getUltimasOperaciones } from '@/lib/direct-database'

/**
 * Resumen del home en un solo request: stats de vehículos + depósitos (una
 * query) y últimas operaciones (otra). Antes eran 3 fetches en cadena y ~11
 * queries. Secuencial a propósito: cada query concurrente ocupa un slot del
 * pool (max 3) y son dos queries rápidas.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limitRaw = parseInt(searchParams.get('limit') || '5', 10)
    const limit = Number.isFinite(limitRaw) ? limitRaw : 5

    const { vehiculos, depositos } = await getStockStats()
    const ultimasVentas = await getUltimasOperaciones(limit)

    return NextResponse.json({ vehiculos, depositos, ultimasVentas })
  } catch (error) {
    console.error('Error fetching dashboard summary:', error)
    return NextResponse.json(
      { error: 'Error al obtener el resumen del panel' },
      { status: 500 }
    )
  }
}
