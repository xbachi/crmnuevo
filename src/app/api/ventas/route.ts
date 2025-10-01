import { NextRequest, NextResponse } from 'next/server'
import { getVentasPorMes } from '@/lib/direct-database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const periodo =
      (searchParams.get('periodo') as
        | 'mes_actual'
        | 'mes_anterior'
        | '3_meses'
        | '6_meses'
        | 'año'
        | '7_dias') || 'mes_actual'

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
