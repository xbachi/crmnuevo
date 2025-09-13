import { NextRequest, NextResponse } from 'next/server'
import { getClienteById, updateCliente, deleteCliente } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
  }

  try {
    const cliente = await getClienteById(id)
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }
    return NextResponse.json(cliente)
  } catch (error) {
    console.error('Error al obtener cliente:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const updatedCliente = await updateCliente(id, body)
    return NextResponse.json(updatedCliente)
  } catch (error: any) {
    console.error('Error al actualizar cliente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
  }

  try {
    await deleteCliente(id)
    return NextResponse.json({ message: 'Cliente eliminado correctamente' })
  } catch (error: any) {
    console.error('Error al eliminar cliente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

