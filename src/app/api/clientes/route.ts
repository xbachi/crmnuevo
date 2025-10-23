import { NextRequest, NextResponse } from 'next/server'
import { getClientes, saveCliente } from '@/lib/direct-database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get('limit')

    const clientes = await getClientes()

    // Si se especifica un límite, devolver solo los primeros N clientes
    if (limit) {
      const limitNumber = parseInt(limit)
      const limitedClientes = clientes.slice(0, limitNumber)
      return NextResponse.json(limitedClientes)
    }

    return NextResponse.json(clientes)
  } catch (error) {
    console.error('Error al obtener clientes:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 [API CLIENTES] Iniciando creación de cliente...')

    const data = await request.json()
    console.log('🔍 [API CLIENTES] Datos recibidos:', {
      nombre: data.nombre,
      apellidos: data.apellidos,
      telefono: data.telefono,
      email: data.email,
    })

    // Validaciones básicas
    if (!data.nombre || data.nombre.trim() === '') {
      console.log('❌ [API CLIENTES] Error: Nombre faltante')
      return NextResponse.json(
        { error: 'El nombre es obligatorio' },
        { status: 400 }
      )
    }

    if (!data.apellidos || data.apellidos.trim() === '') {
      console.log('❌ [API CLIENTES] Error: Apellidos faltantes')
      return NextResponse.json(
        { error: 'Los apellidos son obligatorios' },
        { status: 400 }
      )
    }

    if (!data.telefono || data.telefono.trim() === '') {
      console.log('❌ [API CLIENTES] Error: Teléfono faltante')
      return NextResponse.json(
        { error: 'El teléfono es obligatorio' },
        { status: 400 }
      )
    }

    // Preparar datos para la base de datos
    const clienteData = {
      nombre: data.nombre.trim(),
      apellidos: data.apellidos.trim(),
      telefono: data.telefono.trim(),
      email: data.email?.trim(),
      dni: data.dni?.trim(),
      direccion: data.calle?.trim(), // Mapear calle a direccion
      ciudad: data.ciudad?.trim(),
      provincia: data.provincia?.trim(),
      codigoPostal: data.codPostal?.trim(), // Mapear codPostal a codigoPostal
      comoLlego: data.comoLlego || 'No especificado',
      fechaPrimerContacto:
        data.fechaPrimerContacto || new Date().toISOString().split('T')[0],
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
      etiquetas: data.etiquetas,
    }

    console.log('🔍 [API CLIENTES] Preparando datos para guardar:', clienteData)

    const cliente = await saveCliente(clienteData)
    console.log('✅ [API CLIENTES] Cliente creado exitosamente:', cliente.id)

    return NextResponse.json(cliente, { status: 201 })
  } catch (error) {
    console.error('❌ [API CLIENTES] Error al crear cliente:', error)
    console.error('❌ [API CLIENTES] Tipo de error:', typeof error)
    console.error('❌ [API CLIENTES] Mensaje:', (error as Error).message)
    console.error('❌ [API CLIENTES] Stack:', (error as Error).stack)
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: (error as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
