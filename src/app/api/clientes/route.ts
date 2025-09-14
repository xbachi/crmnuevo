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
    
    
    // Preparar datos para la base de datos
    const clienteData = {
      nombre: data.nombre.trim(),
      apellidos: data.apellidos.trim(),
      telefono: data.telefono.trim(),
      email: data.email?.trim(),
      dni: data.dni?.trim(),
      direccion: data.direccion?.trim(),
      ciudad: data.ciudad?.trim(),
      provincia: data.provincia?.trim(),
      codPostal: data.codPostal?.trim(),
      comoLlego: data.comoLlego || 'No especificado',
      fechaPrimerContacto: data.fechaPrimerContacto || new Date().toISOString().split('T')[0],
      estado: data.estado || 'nuevo',
      prioridad: data.prioridad || 'media',
      proximoPaso: data.proximoPaso?.trim(),
      // Campos de intereses mapeados directamente
      vehiculosInteres: data.vehiculosInteres,
      presupuestoMaximo: data.presupuestoMaximo,
      kilometrajeMaximo: data.kilometrajeMaximo,
      añoMinimo: data.añoMinimo,
      combustiblePreferido: data.combustiblePreferido,
      cambioPreferido: data.cambioPreferido,
      coloresDeseados: data.coloresDeseados,
      necesidadesEspeciales: data.necesidadesEspeciales,
      formaPagoPreferida: data.formaPagoPreferida,
      notasAdicionales: data.notasAdicionales,
      etiquetas: data.etiquetas
    }
    
    const cliente = await saveCliente(clienteData)
    
    return NextResponse.json(cliente, { status: 201 })
  } catch (error) {
    console.error('Error al crear cliente:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
