import { NextRequest, NextResponse } from 'next/server'
import { getNotasByCliente, addNotaCliente } from '@/lib/direct-database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const id = parseInt(idParam)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
  }

  try {
    const notas = await getNotasByCliente(id)
    return NextResponse.json(notas)
  } catch (error) {
    console.error('Error al obtener notas del cliente:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const id = parseInt(idParam)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'ID de cliente inválido' }, { status: 400 })
  }

  try {
    const data = await request.json()
    
    if (!data.titulo || data.titulo.trim() === '') {
      return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 })
    }
    
    if (!data.contenido || data.contenido.trim() === '') {
      return NextResponse.json({ error: 'El contenido es obligatorio' }, { status: 400 })
    }
    
    const nota = await addNotaCliente({
      clienteId: id,
      fecha: data.fecha || new Date().toISOString(),
      tipo: data.tipo || 'otro',
      titulo: data.titulo.trim(),
      contenido: data.contenido.trim(),
      archivos: data.archivos || [],
      recordatorio: data.recordatorio?.trim()
    })
    
    return NextResponse.json(nota, { status: 201 })
  } catch (error) {
    console.error('Error al crear nota:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

