import { NextRequest, NextResponse } from 'next/server'
import { getClientes, createClienteReminder, getClienteReminders } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const clienteId = parseInt(id)
    
    if (isNaN(clienteId)) {
      return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
    }

    const reminders = await getClienteReminders(clienteId)
    return NextResponse.json(reminders)
  } catch (error) {
    console.error('Error fetching client reminders:', error)
    return NextResponse.json({ error: 'Error al obtener recordatorios' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const clienteId = parseInt(id)
    
    if (isNaN(clienteId)) {
      return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
    }

    const body = await request.json()
    const { titulo, descripcion, tipo, prioridad, fechaRecordatorio, dealId } = body

    if (!titulo || !fechaRecordatorio) {
      return NextResponse.json({ error: 'Título y fecha son requeridos' }, { status: 400 })
    }

    const reminder = await createClienteReminder({
      clienteId,
      titulo,
      descripcion: descripcion || '',
      tipo: tipo || 'llamada',
      prioridad: prioridad || 'media',
      fechaRecordatorio: new Date(fechaRecordatorio).toISOString(),
      dealId: dealId || undefined
    })

    return NextResponse.json(reminder, { status: 201 })
  } catch (error) {
    console.error('Error creating client reminder:', error)
    return NextResponse.json({ error: 'Error al crear recordatorio' }, { status: 500 })
  }
}
