import { NextRequest, NextResponse } from 'next/server'
import { generarContratoVenta } from '@/lib/contractGenerator'

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Generando contrato de venta de prueba...')

    // Datos de prueba para el contrato de venta
    const dealData = {
      id: 997,
      numero: 'VEN-TEST-2025-001',
      cliente: {
        id: 1,
        nombre: 'Carlos',
        apellidos: 'Martín Ruiz',
        email: 'carlos.martin@email.com',
        telefono: '666555444',
        dni: '11223344C',
        direccion: 'Plaza España 789',
        ciudad: 'Valencia',
        codigoPostal: '46001',
      },
      vehiculo: {
        id: 3,
        referencia: '#11111',
        marca: 'Mercedes',
        modelo: 'C-Class',
        matricula: '9999-GHI',
        bastidor: 'WDD2050461A123456',
        kms: 28000,
        precioPublicacion: 30000,
        estado: 'vendido',
        fechaMatriculacion: '2021-09-10T00:00:00.000Z',
        año: 2021,
        color: 'Azul',
        combustible: 'Híbrido',
        potencia: '220 CV',
        cambio: 'Automático',
      },
      importeTotal: 30000,
      importeSena: 2500,
      formaPagoSena: 'transferencia',
      estado: 'vendido',
      fechaVentaFirmada: new Date().toISOString(),
      responsableComercial: 'Vendedor de Prueba',
      observaciones: 'Contrato de venta de prueba generado automáticamente',
    }

    // Generar el contrato de venta
    const pdfBuffer = await generarContratoVenta(dealData)

    // Crear respuesta con el PDF
    const response = new NextResponse(pdfBuffer)
    response.headers.set('Content-Type', 'application/pdf')
    response.headers.set(
      'Content-Disposition',
      'inline; filename="contrato-venta-prueba.pdf"'
    )
    response.headers.set('Cache-Control', 'no-cache')

    console.log('✅ Contrato de venta de prueba generado exitosamente')
    return response
  } catch (error) {
    console.error('❌ Error generando contrato de venta de prueba:', error)
    return NextResponse.json(
      {
        error: 'Error generando contrato de venta de prueba',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    )
  }
}
