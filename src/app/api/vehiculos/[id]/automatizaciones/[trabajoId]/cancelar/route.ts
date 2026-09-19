/**
 * POST /api/vehiculos/[id]/automatizaciones/[trabajoId]/cancelar — cancela un
 * pedido que la PC todavía no tomó (sólo estado pendiente). Sesión: middleware.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cancelar } from '@/lib/automatizaciones'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; trabajoId: string }> }

function parseId(id: string): number | null {
  const n = parseInt(id, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id, trabajoId } = await params
  const vehiculoId = parseId(id)
  const trabajo = parseId(trabajoId)
  if (vehiculoId == null || trabajo == null) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }
  try {
    if (!(await cancelar(trabajo, vehiculoId))) {
      return NextResponse.json(
        {
          error:
            'Sólo se puede cancelar un pedido pendiente (la PC ya lo tomó o terminó).',
        },
        { status: 409 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[automatizaciones cancelar]', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
