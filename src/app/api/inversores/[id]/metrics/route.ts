import { NextRequest, NextResponse } from 'next/server'
import { getInversorMetrics, getInversorById } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idString } = await params
    const id = parseInt(idString)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }
    
    // Verificar que el inversor existe
    const inversor = await getInversorById(id)
    if (!inversor) {
      return NextResponse.json({ error: 'Inversor no encontrado' }, { status: 404 })
    }
    
    // Obtener parámetros de periodo
    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    
    const periodo = desde && hasta ? { desde, hasta } : undefined
    const metrics = await getInversorMetrics(id, periodo)
    
    return NextResponse.json(metrics)
  } catch (error) {
    console.error('Error al obtener métricas del inversor:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
