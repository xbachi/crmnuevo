import { NextRequest, NextResponse } from 'next/server'
import { generarContratoVenta } from '@/lib/contractGenerator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cliente, vehiculo, deposito, tipo } = body

    console.log('📄 Generando contrato de venta:', {
      cliente,
      vehiculo,
      deposito,
      tipo,
    })

    // Generar el PDF del contrato de venta
    await generarContratoVenta({
      cliente,
      vehiculo,
      deposito,
      tipo: 'VENTA',
    })

    return NextResponse.json({
      success: true,
      message: 'Contrato generado correctamente',
    })
  } catch (error) {
    console.error('Error generando contrato de venta:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
