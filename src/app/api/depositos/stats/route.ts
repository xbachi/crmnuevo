import { NextResponse } from 'next/server'
import { getDepositoStats } from '@/lib/direct-database'

export async function GET() {
  try {
    const stats = await getDepositoStats()
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching deposito stats:', error)
    return NextResponse.json({ error: 'Error al obtener estadísticas de depósitos' }, { status: 500 })
  }
}
