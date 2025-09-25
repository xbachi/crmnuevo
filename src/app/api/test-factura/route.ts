import { NextRequest, NextResponse } from 'next/server'
import { generarFactura } from '@/lib/contractGenerator'

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Generando factura de prueba...')

    // Datos de prueba para la factura
    const dealData = {
      id: 999,
      numero: 'FAC-TEST-2025-001',
      cliente: {
        id: 1,
        nombre: 'Juan',
        apellidos: 'Pérez García',
        email: 'juan.perez@email.com',
        telefono: '666123456',
        dni: '12345678A',
        direccion: 'Calle Mayor 123',
        ciudad: 'Madrid',
        codigoPostal: '28001',
      },
      vehiculo: {
        id: 1,
        referencia: '#12345',
        marca: 'BMW',
        modelo: 'X3',
        matricula: '1234-ABC',
        bastidor: 'WBAFR7C50CC123456',
        kms: 50000,
        precioPublicacion: 25000,
        estado: 'vendido',
        fechaMatriculacion: '2020-03-15T00:00:00.000Z',
        año: 2020,
        color: 'Blanco',
        combustible: 'Gasolina',
        potencia: '190 CV',
        cambio: 'Automático',
      },
      importeTotal: 25000,
      importeSena: 2000,
      formaPagoSena: 'transferencia',
      estado: 'facturado',
      fechaFacturada: new Date().toISOString(),
      responsableComercial: 'Vendedor de Prueba',
      observaciones: 'Factura de prueba generada automáticamente',
    }

    // Generar la factura
    const pdfBuffer = await generarFactura(dealData)

    // Crear respuesta con el PDF
    const response = new NextResponse(pdfBuffer)
    response.headers.set('Content-Type', 'application/pdf')
    response.headers.set(
      'Content-Disposition',
      'inline; filename="factura-prueba.pdf"'
    )
    response.headers.set('Cache-Control', 'no-cache')

    console.log('✅ Factura de prueba generada exitosamente')
    return response
  } catch (error) {
    console.error('❌ Error generando factura de prueba:', error)
    return NextResponse.json(
      {
        error: 'Error generando factura de prueba',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    )
  }
}
