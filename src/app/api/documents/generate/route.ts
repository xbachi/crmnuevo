import { NextRequest, NextResponse } from 'next/server'
import {
  generarContratoReserva,
  generarContratoVenta,
  generarFactura,
} from '@/lib/contractGenerator'
import { documentExists, saveDocument } from '@/lib/documentStorage'

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 [API GENERATE] Iniciando generación de documento...')

    const {
      dealId,
      documentType,
      dealData,
      dealNumber,
      tipoFactura,
      numeroFactura,
    } = await request.json()

    console.log('🔍 [API GENERATE] Request recibido:', {
      dealId,
      documentType,
      tipoFactura,
      numeroFactura,
      dealNumber,
    })

    // Validar parámetros
    if (!documentType || !dealData || !dealNumber) {
      return NextResponse.json(
        { error: 'Parámetros faltantes' },
        { status: 400 }
      )
    }

    // Validar tipo de documento
    const validTypes = ['contrato-reserva', 'contrato-venta', 'factura']
    if (!validTypes.includes(documentType)) {
      return NextResponse.json(
        { error: 'Tipo de documento inválido' },
        { status: 400 }
      )
    }

    const dealIdNum = dealId ? parseInt(dealId) : 0
    if (dealId && isNaN(dealIdNum)) {
      return NextResponse.json(
        { error: 'ID de deal inválido' },
        { status: 400 }
      )
    }

    // Siempre generar un nuevo documento (no verificar si existe)
    // Esto permite regenerar documentos después de anularlos
    console.log(
      '🔍 [API GENERATE] Generando nuevo documento (sin verificar existencia)'
    )

    // Generar el documento según el tipo
    let pdfBuffer: Uint8Array

    switch (documentType) {
      case 'contrato-reserva':
        console.log('🔍 [API GENERATE] Generando contrato de reserva...')
        console.log('🔍 [API GENERATE] DealData recibido:', {
          numero: dealData.numero,
          cliente: dealData.cliente
            ? {
                nombre: dealData.cliente.nombre,
                apellidos: dealData.cliente.apellidos,
                calle: dealData.cliente.calle,
                ciudad: dealData.cliente.ciudad,
                provincia: dealData.cliente.provincia,
              }
            : 'No cliente',
          vehiculo: dealData.vehiculo
            ? {
                marca: dealData.vehiculo.marca,
                modelo: dealData.vehiculo.modelo,
                matricula: dealData.vehiculo.matricula,
              }
            : 'No vehículo',
          importeTotal: dealData.importeTotal,
          importeSena: dealData.importeSena,
        })
        try {
          pdfBuffer = await generarContratoReserva(dealData)
          console.log(
            '✅ [API GENERATE] Contrato de reserva generado exitosamente, tamaño:',
            pdfBuffer.length,
            'bytes'
          )
        } catch (error) {
          console.error(
            '❌ [API GENERATE] Error generando contrato de reserva:',
            error
          )
          console.error(
            '❌ [API GENERATE] Stack trace contrato reserva:',
            (error as Error).stack
          )
          throw error
        }
        break
      case 'contrato-venta':
        pdfBuffer = await generarContratoVenta(dealData)
        break
      case 'factura':
        console.log('🔍 [API GENERATE] Generando factura con parámetros:', {
          tipoFactura,
          numeroFactura,
          dealId,
        })
        try {
          pdfBuffer = await generarFactura(dealData, tipoFactura, numeroFactura)
          console.log(
            '✅ [API GENERATE] Factura generada exitosamente, tamaño:',
            pdfBuffer.length,
            'bytes'
          )
        } catch (error) {
          console.error('❌ [API GENERATE] Error generando factura:', error)
          throw error
        }
        break
      default:
        return NextResponse.json(
          { error: 'Tipo de documento no soportado' },
          { status: 400 }
        )
    }

    // Guardar el documento
    const documentUrl = await saveDocument(
      dealIdNum,
      documentType as any,
      dealNumber,
      Buffer.from(pdfBuffer)
    )

    return NextResponse.json({
      message: 'Documento generado exitosamente',
      url: documentUrl,
    })
  } catch (error) {
    console.error('❌ [API GENERATE] Error generando documento:', error)
    console.error('❌ [API GENERATE] Stack trace:', (error as Error).stack)
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: (error as Error).message,
        type: 'document_generation_error',
      },
      { status: 500 }
    )
  }
}
