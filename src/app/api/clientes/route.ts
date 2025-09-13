import { NextRequest, NextResponse } from 'next/server'
import { getClientes, saveCliente } from '@/lib/direct-database'

export async function GET() {
  try {
    const clientes = await getClientes()
    return NextResponse.json(clientes)
  } catch (error) {
    console.error('Error al obtener clientes:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Validaciones básicas
    if (!data.nombre || data.nombre.trim() === '') {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    
    if (!data.apellidos || data.apellidos.trim() === '') {
      return NextResponse.json({ error: 'Los apellidos son obligatorios' }, { status: 400 })
    }
    
    if (!data.telefono || data.telefono.trim() === '') {
      return NextResponse.json({ error: 'El teléfono es obligatorio' }, { status: 400 })
    }
    
    if (!data.intereses) {
      return NextResponse.json({ error: 'Los intereses son obligatorios' }, { status: 400 })
    }
    
    const cliente = await saveCliente({
      nombre: data.nombre.trim(),
      apellidos: data.apellidos.trim(),
      telefono: data.telefono.trim(),
      email: data.email?.trim(),
      whatsapp: data.whatsapp?.trim(),
      comoLlego: data.comoLlego || 'No especificado',
      fechaPrimerContacto: data.fechaPrimerContacto || new Date().toISOString().split('T')[0],
      estado: data.estado || 'nuevo',
      prioridad: data.prioridad || 'media',
      intereses: {
        vehiculoPrincipal: data.intereses.vehiculosInteres?.[0] || '',
        modelosAlternativos: data.intereses.vehiculosInteres?.slice(1) || [],
        precioMaximo: data.intereses.precioMaximo || 0,
        kilometrajeMaximo: data.intereses.kilometrajeMaximo || 0,
        añoMinimo: data.intereses.añoMinimo || 0,
        combustiblePreferido: data.intereses.combustiblePreferido || 'cualquiera',
        cambioPreferido: data.intereses.cambioPreferido || 'cualquiera',
        coloresDeseados: data.intereses.coloresDeseados || [],
        necesidadesEspeciales: data.intereses.necesidadesEspeciales || [],
        formaPagoPreferida: data.intereses.formaPagoPreferida || 'cualquiera'
      },
      proximoPaso: data.proximoPaso?.trim(),
      etiquetas: data.etiquetas || []
    })
    
    return NextResponse.json(cliente, { status: 201 })
  } catch (error) {
    console.error('Error al crear cliente:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
