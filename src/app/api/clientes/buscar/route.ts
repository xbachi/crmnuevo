import { NextRequest, NextResponse } from 'next/server'
import { buscarClientesPorVehiculo, getClientes } from '@/lib/direct-database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    
    if (!query || query.length < 2) {
      return NextResponse.json([])
    }
    
    const clientes = await getClientes()
    const queryLower = query.toLowerCase()
    
    const resultados = clientes.filter(cliente => {
      const nombreCompleto = `${cliente.nombre} ${cliente.apellidos}`.toLowerCase()
      const telefono = cliente.telefono.toLowerCase()
      const email = cliente.email?.toLowerCase() || ''
      const vehiculo = cliente.intereses?.vehiculoPrincipal?.toLowerCase() || ''
      
      return nombreCompleto.includes(queryLower) ||
             telefono.includes(queryLower) ||
             email.includes(queryLower) ||
             vehiculo.includes(queryLower)
    })
    
    return NextResponse.json(resultados.slice(0, 10)) // Limitar a 10 resultados
  } catch (error) {
    console.error('Error al buscar clientes:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const criterios = await request.json()
    
    const clientes = await buscarClientesPorVehiculo(criterios)
    return NextResponse.json(clientes)
  } catch (error) {
    console.error('Error al buscar clientes:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
