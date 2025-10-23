import { NextRequest, NextResponse } from 'next/server'
import { generarContratoVentaConGarantia } from '@/lib/contractGenerator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log(
      '🔍 [CONTRATO VENTA CON GARANTÍA] Generando contrato especial con cláusula de 14 días...'
    )
    console.log('📋 Deal data:', body)

    // Generar el contrato con la cláusula de garantía
    const pdfBuffer = await generarContratoVentaConGarantia(body)

    console.log(
      '✅ [CONTRATO VENTA CON GARANTÍA] Contrato generado exitosamente'
    )

    // Crear respuesta con el PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="contrato-venta-con-garantia-14-dias.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error(
      '❌ [CONTRATO VENTA CON GARANTÍA] Error generando contrato:',
      error
    )
    return NextResponse.json(
      { error: 'Error generando contrato de venta con garantía' },
      { status: 500 }
    )
  }
}
