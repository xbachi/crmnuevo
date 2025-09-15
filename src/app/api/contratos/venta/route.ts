import { NextRequest, NextResponse } from 'next/server'
import { generateContractPDF } from '@/lib/contractGenerator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cliente, vehiculo, deposito, tipo } = body

    console.log('📄 Generando contrato de venta:', { cliente, vehiculo, deposito, tipo })

    // Generar el PDF del contrato de venta
    const pdfBuffer = await generateContractPDF({
      cliente,
      vehiculo,
      deposito,
      tipo: 'VENTA'
    })

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="contrato_venta_${vehiculo.referencia}.pdf"`
      }
    })
  } catch (error) {
    console.error('Error generando contrato de venta:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
