import { NextRequest, NextResponse } from 'next/server'
import { getInversores, saveInversor } from '@/lib/direct-database'

export async function GET() {
  try {
    const inversores = await getInversores()
    return NextResponse.json(inversores)
  } catch (error) {
    console.error('Error al obtener inversores:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    // Validaciones básicas
    if (!data.nombre || data.nombre.trim() === '') {
      return NextResponse.json(
        { error: 'El nombre es obligatorio' },
        { status: 400 }
      )
    }

    const inversor = await saveInversor({
      nombre: data.nombre.trim(),
      email: data.email?.trim(),
      capitalAportado: data.capitalAportado ? Number(data.capitalAportado) : 0,
      fechaAporte: data.fechaAporte || new Date().toISOString().split('T')[0],
      capitalInvertido: data.capitalInvertido
        ? Number(data.capitalInvertido)
        : undefined,
      capitalDisponible: data.capitalDisponible
        ? Number(data.capitalDisponible)
        : undefined,
      notasInternas: data.notasInternas?.trim(),
      usuario: data.usuario?.trim(),
      contraseña: data.contraseña?.trim(),
    })

    return NextResponse.json(inversor, { status: 201 })
  } catch (error) {
    console.error('Error al crear inversor:', error)
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    )
  }
}
