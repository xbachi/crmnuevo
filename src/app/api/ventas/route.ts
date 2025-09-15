import { NextRequest, NextResponse } from 'next/server'
import { getVentasPorMes } from '@/lib/direct-database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const periodo = searchParams.get('periodo') as 'mes_actual' | 'mes_anterior' | 'ultimos_3_meses' | 'ultimos_6_meses' | 'año' || 'mes_actual'
    
    const ventas = await getVentasPorMes(periodo)
    return NextResponse.json(ventas)
  } catch (error) {
    console.error('Error fetching ventas:', error)
    return NextResponse.json({ error: 'Error al obtener ventas por mes' }, { status: 500 })
  }
}
