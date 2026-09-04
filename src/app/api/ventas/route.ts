import { NextRequest, NextResponse } from 'next/server'
import {
  getVentasPorMes,
  PERIODOS_VENTAS,
  type PeriodoVentas,
} from '@/lib/direct-database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const raw = searchParams.get('periodo')
    const periodo: PeriodoVentas = PERIODOS_VENTAS.includes(
      raw as PeriodoVentas
    )
      ? (raw as PeriodoVentas)
      : 'mes_actual'

    const ventas = await getVentasPorMes(periodo)
    return NextResponse.json(ventas)
  } catch (error) {
    console.error('Error fetching ventas:', error)
    return NextResponse.json(
      { error: 'Error al obtener ventas por mes' },
      { status: 500 }
    )
  }
}
