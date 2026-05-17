import { NextRequest, NextResponse } from 'next/server'
import { getVentaB2BById } from '@/lib/b2b-database'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params
  const id = parseInt(raw, 10)
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }
  try {
    const venta = await getVentaB2BById(id)
    if (!venta) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }
    return NextResponse.json(venta)
  } catch (err) {
    console.error('[GET /api/ventas-b2b/[id]]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
