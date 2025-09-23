import { NextRequest, NextResponse } from 'next/server'
import {
  updateClienteReminder,
  deleteClienteReminder,
} from '@/lib/direct-database'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reminderId: string }> }
) {
  try {
    const { id, reminderId: reminderIdParam } = await params
    const clienteId = parseInt(id)
    const reminderId = parseInt(reminderIdParam)

    if (isNaN(clienteId) || isNaN(reminderId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json()
    const { completado } = body

    const reminder = await updateClienteReminder(reminderId, { completado })

    if (!reminder) {
      return NextResponse.json(
        { error: 'Recordatorio no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json(reminder)
  } catch (error) {
    console.error('Error updating client reminder:', error)
    return NextResponse.json(
      { error: 'Error al actualizar recordatorio' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reminderId: string }> }
) {
  try {
    const { id, reminderId: reminderIdParam } = await params
    const clienteId = parseInt(id)
    const reminderId = parseInt(reminderIdParam)

    if (isNaN(clienteId) || isNaN(reminderId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const success = await deleteClienteReminder(reminderId)

    if (!success) {
      return NextResponse.json(
        { error: 'Recordatorio no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting client reminder:', error)
    return NextResponse.json(
      { error: 'Error al eliminar recordatorio' },
      { status: 500 }
    )
  }
}
