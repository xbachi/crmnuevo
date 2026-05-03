import { NextRequest, NextResponse } from 'next/server'
import { getInversorById, updateInversor, deleteInversor } from '@/lib/direct-database'
import { handleDeleteError } from '@/lib/api-errors'

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
    
    const inversor = await getInversorById(id)
    if (!inversor) {
      return NextResponse.json({ error: 'Inversor no encontrado' }, { status: 404 })
    }
    
    return NextResponse.json(inversor)
  } catch (error) {
    console.error('Error al obtener inversor:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idString } = await params
    const id = parseInt(idString)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }
    
    const data = await request.json()
    
    // Validaciones básicas
    if (!data.nombre || data.nombre.trim() === '') {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    
    const inversor = await updateInversor(id, {
      nombre: data.nombre.trim(),
      email: data.email?.trim(),
      capitalAportado: data.capitalAportado ? Number(data.capitalAportado) : 0,
      fechaAporte: data.fechaAporte,
      capitalInvertido: data.capitalInvertido ? Number(data.capitalInvertido) : undefined,
      notasInternas: data.notasInternas?.trim()
    })
    
    return NextResponse.json(inversor)
  } catch (error) {
    console.error('Error al actualizar inversor:', error)
    if (error instanceof Error && error.message === 'Inversor no encontrado') {
      return NextResponse.json({ error: 'Inversor no encontrado' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idString } = await params
    const id = parseInt(idString)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const existing = await getInversorById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Inversor no encontrado' }, { status: 404 })
    }

    const deleted = await deleteInversor(id)
    if (!deleted) {
      return NextResponse.json({ error: 'Inversor no encontrado' }, { status: 404 })
    }
    return NextResponse.json({ message: 'Inversor eliminado correctamente' })
  } catch (error) {
    return handleDeleteError(error, 'inversor')
  }
}
