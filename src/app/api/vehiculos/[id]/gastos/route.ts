import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const vehiculoId = Number(id)
    if (!vehiculoId || Number.isNaN(vehiculoId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const items = await prisma.accountingVehicleExpense.findMany({
      where: { vehiculoId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    const totals: Record<string, number> = {}
    for (const it of items) {
      const cat = it.category
      const total = it.total != null ? Number(it.total) : 0
      totals[cat] = (totals[cat] || 0) + total
    }

    return NextResponse.json({ totals, items })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Error cargando gastos' },
      { status: 500 }
    )
  }
}
