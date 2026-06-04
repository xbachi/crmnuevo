import { NextRequest, NextResponse } from 'next/server'
import { generarContratoPersonalizado } from '@/lib/contratoPersonalizado'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Datos del cliente (puedes usar datos reales o de ejemplo)
    const cliente = {
      nombre: body.cliente?.nombre || 'Juan',
      apellidos: body.cliente?.apellidos || 'Pérez García',
      dni: body.cliente?.dni || '12345678A',
      direccion: body.cliente?.direccion || 'Calle Ejemplo, 123',
      ciudad: body.cliente?.ciudad || 'Valencia',
      provincia: body.cliente?.provincia || 'Valencia',
    }

    // Datos del vehículo (dejados en blanco como solicitado)
    const vehiculo = {
      marca: body.vehiculo?.marca || '',
      modelo: body.vehiculo?.modelo || '',
      bastidor: body.vehiculo?.bastidor || '',
      matricula: body.vehiculo?.matricula || '',
      fechaMatriculacion: body.vehiculo?.fechaMatriculacion || null,
      kms: body.vehiculo?.kms || null,
      color: body.vehiculo?.color || '',
    }

    // Precio (dejado en blanco como solicitado)
    const precio = body.precio || 0

    console.log(
      '🔍 [CONTRATO PERSONALIZADO] Generando contrato con cláusula de garantía de 14 días...'
    )
    console.log('📋 Cliente:', cliente)
    console.log('🚗 Vehículo:', vehiculo)

    // Generar el contrato
    const pdfBuffer = await generarContratoPersonalizado(
      cliente,
      vehiculo,
      precio
    )

    console.log('✅ [CONTRATO PERSONALIZADO] Contrato generado exitosamente')

    // Crear respuesta con el PDF
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="contrato-personalizado-garantia-14-dias.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error(
      '❌ [CONTRATO PERSONALIZADO] Error generando contrato:',
      error
    )
    return NextResponse.json(
      { error: 'Error generando contrato personalizado' },
      { status: 500 }
    )
  }
}
