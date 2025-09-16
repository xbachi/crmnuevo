import { NextResponse } from 'next/server'
import { getUltimasOperaciones } from '@/lib/direct-database'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '5')
    
    const operaciones = await getUltimasOperaciones(limit)
    return NextResponse.json(operaciones)
  } catch (error) {
    console.error('Error fetching ultimas operaciones:', error)
    return NextResponse.json({ error: 'Error al obtener últimas operaciones' }, { status: 500 })
  }
}
