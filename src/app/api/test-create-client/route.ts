import { NextRequest, NextResponse } from 'next/server'
import { saveCliente } from '@/lib/direct-database'

export async function POST(request: NextRequest) {
  try {
    console.log(
      '🔍 [TEST CREATE CLIENT] Iniciando test de creación de cliente...'
    )

    // Datos de prueba mínimos
    const testData = {
      nombre: 'Test',
      apellidos: 'Usuario',
      telefono: '123456789',
      email: 'test@test.com',
      estado: 'nuevo',
      prioridad: 'media',
      activo: true,
    }

    console.log('🔍 [TEST CREATE CLIENT] Datos de prueba:', testData)

    const cliente = await saveCliente(testData)
    console.log('✅ [TEST CREATE CLIENT] Cliente creado exitosamente:', cliente)

    return NextResponse.json({
      success: true,
      cliente: cliente,
      message: 'Cliente de prueba creado exitosamente',
    })
  } catch (error) {
    console.error('❌ [TEST CREATE CLIENT] Error:', error)
    console.error('❌ [TEST CREATE CLIENT] Tipo de error:', typeof error)
    console.error('❌ [TEST CREATE CLIENT] Mensaje:', (error as Error).message)
    console.error('❌ [TEST CREATE CLIENT] Stack:', (error as Error).stack)

    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
        stack: (error as Error).stack,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
