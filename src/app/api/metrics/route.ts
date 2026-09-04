import { NextResponse } from 'next/server'
import { getStockStats } from '@/lib/direct-database'

/**
 * Métricas del gráfico del home. El home ya no lo llama (recibe los datos por
 * props desde /api/dashboard/summary); se mantiene por compatibilidad con una
 * sola query en vez de 10. El `periodo` de la URL nunca se aplicó: las stats
 * son una foto del estado actual del stock.
 */
export async function GET() {
  try {
    const { vehiculos, depositos } = await getStockStats()

    const metrics = {
      vehiculosVendidos: vehiculos.vendidos,
      enStock: vehiculos.totalActivos, // totalActivos ya excluye vendidos
      depositos: depositos.totalDepositos,
      enProceso: vehiculos.enProceso + depositos.enProceso,
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
