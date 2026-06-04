import { NextRequest, NextResponse } from 'next/server'
import { getVehiculoStats, getDepositoStats } from '@/lib/direct-database'

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
        | '7_dias') || 'año'

    // Obtener estadísticas de vehículos y depósitos
    const [vehiculoStats, depositoStats] = (await Promise.all([
      getVehiculoStats(),
      getDepositoStats(),
    ])) as [
      { vendidos: number; totalActivos: number; enProceso: number },
      { totalDepositos: number; enProceso: number },
    ]

    // Calcular métricas basadas en el período seleccionado
    // Por ahora, devolvemos los datos actuales ya que las funciones de base de datos
    // no están configuradas para filtrar por período específico
    const metrics = {
      vehiculosVendidos: vehiculoStats.vendidos,
      enStock: vehiculoStats.totalActivos, // totalActivos ya excluye vendidos
      depositos: depositoStats.totalDepositos,
      enProceso: vehiculoStats.enProceso + depositoStats.enProceso,
    }

    return NextResponse.json(metrics)
  } catch (error) {
    console.error('Error fetching metrics:', error)
    return NextResponse.json(
      { error: 'Error al obtener métricas' },
      { status: 500 }
    )
  }
}
