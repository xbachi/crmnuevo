import { NextRequest, NextResponse } from 'next/server'
import { generarContratoReserva } from '@/lib/contractGenerator'

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Generando contrato de reserva de prueba...')

    // Datos de prueba para el contrato de reserva
    const dealData = {
      id: 998,
      numero: 'RES-TEST-2025-001',
      cliente: {
        id: 1,
        nombre: 'María',
        apellidos: 'González López',
        email: 'maria.gonzalez@email.com',
        telefono: '666987654',
        dni: '87654321B',
        direccion: 'Avenida de la Paz 456',
        ciudad: 'Barcelona',
        codigoPostal: '08001',
      },
      vehiculo: {
        id: 2,
        referencia: '#67890',
        marca: 'Audi',
        modelo: 'A4',
        matricula: '5678-DEF',
        bastidor: 'WAUZZZ8V8KA123456',
        kms: 35000,
        precioPublicacion: 22000,
        estado: 'reservado',
        fechaMatriculacion: '2019-06-20T00:00:00.000Z',
        año: 2019,
        color: 'Negro',
        combustible: 'Diésel',
        potencia: '150 CV',
        cambio: 'Manual',
      },
      importeTotal: 22000,
      importeSena: 1500,
      formaPagoSena: 'efectivo',
      estado: 'reservado',
      fechaReservaDesde: new Date().toISOString(),
      fechaReservaExpira: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString(), // 7 días
      responsableComercial: 'Vendedor de Prueba',
      observaciones: 'Contrato de reserva de prueba generado automáticamente',
    }

    // Generar el contrato de reserva
    const pdfBuffer = await generarContratoReserva(dealData)

    // Crear respuesta con el PDF
    const response = new NextResponse(pdfBuffer)
    response.headers.set('Content-Type', 'application/pdf')
    response.headers.set(
      'Content-Disposition',
      'inline; filename="contrato-reserva-prueba.pdf"'
    )
    response.headers.set('Cache-Control', 'no-cache')

    console.log('✅ Contrato de reserva de prueba generado exitosamente')
    return response
  } catch (error) {
    console.error('❌ Error generando contrato de reserva de prueba:', error)
    return NextResponse.json(
      {
        error: 'Error generando contrato de reserva de prueba',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    )
  }
}
