import { NextRequest, NextResponse } from 'next/server'
import {
  getClienteB2BById,
  updateClienteB2B,
  archiveClienteB2B,
} from '@/lib/b2b-database'

async function parseId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id: raw } = await params
  const n = parseInt(raw, 10)
  return Number.isNaN(n) ? null : n
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = await parseId(params)
  if (id == null) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    const row = await getClienteB2BById(id)
    if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json(row)
  } catch (err) {
    console.error('[GET /api/clientes-b2b/[id]]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = await parseId(params)
  if (id == null) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    const body = await request.json()
    const updated = await updateClienteB2B(id, body)
    if (!updated) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PUT /api/clientes-b2b/[id]]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = await parseId(params)
  if (id == null) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    const ok = await archiveClienteB2B(id)
    if (!ok) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ archived: true })
  } catch (err) {
    console.error('[DELETE /api/clientes-b2b/[id]]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
