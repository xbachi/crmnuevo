import { NextRequest, NextResponse } from 'next/server'
import { getDealById, updateDeal, deleteDeal } from '@/lib/direct-database'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idString } = await params
    const id = parseInt(idString)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 })
    }

    console.log(`🔍 Obteniendo deal con ID: ${id}`)
    
    const deal = await getDealById(id)

    if (!deal) {
      return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })
    }

    console.log(`✅ Deal encontrado: ${deal.numero}`)
    return NextResponse.json(deal)
  } catch (error) {
    console.error('❌ Error obteniendo deal:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idString } = await params
    const id = parseInt(idString)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 })
    }

    const body = await request.json()
    console.log(`📝 Actualizando deal ${id}:`, body)
    
    const updatedDeal = await updateDeal(id, body)

    if (!updatedDeal) {
      return NextResponse.json({ error: 'Deal no encontrado o no se pudo actualizar' }, { status: 404 })
    }

    console.log(`✅ Deal actualizado: ${updatedDeal.numero}`)
    return NextResponse.json(updatedDeal)
  } catch (error) {
    console.error('❌ Error actualizando deal:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idString } = await params
    const id = parseInt(idString)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 })
    }

    console.log(`🗑️ Eliminando deal con ID: ${id}`)
    
    const success = await deleteDeal(id)

    if (!success) {
      return NextResponse.json({ error: 'Deal no encontrado o no se pudo eliminar' }, { status: 404 })
    }

    console.log(`✅ Deal eliminado exitosamente`)
    return NextResponse.json({ message: 'Deal eliminado exitosamente' }, { status: 200 })
  } catch (error) {
    console.error('❌ Error eliminando deal:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}