import { NextRequest, NextResponse } from 'next/server'
import { getInversorMetrics } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const inversorId = parseInt(id)

    if (isNaN(inversorId)) {
      return NextResponse.json(
        { error: 'ID de inversor inválido' },
        { status: 400 }
      )
    }

    const metrics = await getInversorMetrics(inversorId)
    return NextResponse.json(metrics)
  } catch (error) {
    console.error('Error al obtener métricas del inversor:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
