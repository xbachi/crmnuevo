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

    try {
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

          pdfBuffer = await generarContratoReserva(dealData)
          console.log(
            '✅ [API GENERATE] Contrato de reserva generado exitosamente, tamaño:',
            pdfBuffer.length,
            'bytes'
          )
          break

        case 'contrato-venta':
          console.log('🔍 [API GENERATE] Generando contrato de venta...')
          pdfBuffer = await generarContratoVenta(dealData)
          console.log(
            '✅ [API GENERATE] Contrato de venta generado exitosamente, tamaño:',
            pdfBuffer.length,
            'bytes'
          )
          break

        case 'factura':
          console.log('🔍 [API GENERATE] Generando factura con parámetros:', {
            tipoFactura,
            numeroFactura,
            dealId,
          })
          pdfBuffer = await generarFactura(dealData, tipoFactura, numeroFactura)
          console.log(
            '✅ [API GENERATE] Factura generada exitosamente, tamaño:',
            pdfBuffer.length,
            'bytes'
          )
          break

        default:
          return NextResponse.json(
            { error: 'Tipo de documento no soportado' },
            { status: 400 }
          )
      }
    } catch (generationError) {
      console.error('❌ [API GENERATE] Error en generación:', generationError)
      console.error(
        '❌ [API GENERATE] Stack trace:',
        (generationError as Error).stack
      )

      // Retornar error específico para debugging
      return NextResponse.json(
        {
          error: 'Error generando documento',
          details: (generationError as Error).message,
          type: 'generation_error',
          documentType,
        },
        { status: 500 }
      )
    }

    // Guardar el documento
    try {
      // Usar timestamp para contratos de reserva para evitar caché del navegador
      const useTimestamp = documentType === 'contrato-reserva'
      const documentUrl = await saveDocument(
        dealIdNum,
        documentType as any,
        dealNumber,
        Buffer.from(pdfBuffer),
        useTimestamp
      )

      console.log(
        '✅ [API GENERATE] Documento guardado exitosamente:',
        documentUrl
      )

      return NextResponse.json({
        message: 'Documento generado exitosamente',
        url: documentUrl,
      })
    } catch (saveError) {
      console.error('❌ [API GENERATE] Error guardando documento:', saveError)
      return NextResponse.json(
        {
          error: 'Error guardando documento',
          details: (saveError as Error).message,
          type: 'save_error',
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('❌ [API GENERATE] Error general:', error)
    console.error('❌ [API GENERATE] Stack trace:', (error as Error).stack)
    return NextResponse.json(
      {
        error: 'Error interno del servidor',
        details: (error as Error).message,
        type: 'general_error',
      },
      { status: 500 }
    )
  }
}
