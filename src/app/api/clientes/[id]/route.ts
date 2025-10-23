import { NextRequest, NextResponse } from 'next/server'
import {
  getClienteById,
  updateCliente,
  deleteCliente,
} from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const id = parseInt(idParam)
  if (isNaN(id)) {
    return NextResponse.json(
      { error: 'ID de cliente inválido' },
      { status: 400 }
    )
  }

  try {
    const cliente = await getClienteById(id)
    if (!cliente) {
      return NextResponse.json(
        { error: 'Cliente no encontrado' },
        { status: 404 }
      )
    }
    return NextResponse.json(cliente)
  } catch (error) {
    console.error('Error al obtener cliente:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const id = parseInt(idParam)
  if (isNaN(id)) {
    return NextResponse.json(
      { error: 'ID de cliente inválido' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    console.log(`🔍 [API PUT] Actualizando cliente ${id} con datos:`, body)
    const updatedCliente = await updateCliente(id, body)
    return NextResponse.json(updatedCliente)
  } catch (error: any) {
    console.error('Error al actualizar cliente:', error)

    // Manejar errores específicos de la base de datos
    if (error.code === '23505') {
      if (error.constraint === 'Cliente_dni_key') {
        return NextResponse.json(
          {
            error:
              'Ya existe un cliente con este DNI. Por favor, verifica el número de documento.',
          },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { error: 'Los datos proporcionados ya existen en el sistema.' },
        { status: 400 }
      )
    }

    // Manejar errores de formato de fecha/timestamp
    if (error.code === '22007') {
      return NextResponse.json(
        {
          error:
            'Error en el formato de fecha. Por favor, verifica las fechas ingresadas.',
        },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const id = parseInt(idParam)
  if (isNaN(id)) {
    return NextResponse.json(
      { error: 'ID de cliente inválido' },
      { status: 400 }
    )
  }

  try {
    await deleteCliente(id)
    return NextResponse.json({ message: 'Cliente eliminado correctamente' })
  } catch (error: any) {
    console.error('Error al eliminar cliente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
