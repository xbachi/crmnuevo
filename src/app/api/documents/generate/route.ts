import { NextRequest, NextResponse } from 'next/server'
import {
  generarContratoReserva,
  generarContratoVenta,
  generarFactura,
} from '@/lib/contractGenerator'
import { documentExists, saveDocument } from '@/lib/documentStorage'

export async function POST(request: NextRequest) {
  try {
    const { dealId, documentType, dealData, dealNumber } = await request.json()

    // Validar parámetros
    if (!dealId || !documentType || !dealData || !dealNumber) {
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

    const dealIdNum = parseInt(dealId)
    if (isNaN(dealIdNum)) {
      return NextResponse.json(
        { error: 'ID de deal inválido' },
        { status: 400 }
      )
    }

    // Verificar si el documento ya existe
    const exists = await documentExists(
      dealIdNum,
      documentType as any,
      dealNumber
    )

    if (exists) {
      return NextResponse.json({
        message: 'Documento ya existe',
        url: `/api/documents/${dealId}/${documentType}?dealNumber=${dealNumber}`,
      })
    }

    // Generar el documento según el tipo
    let pdfBuffer: Uint8Array

    switch (documentType) {
      case 'contrato-reserva':
        pdfBuffer = await generarContratoReserva(dealData)
        break
      case 'contrato-venta':
        pdfBuffer = await generarContratoVenta(dealData)
        break
      case 'factura':
        pdfBuffer = await generarFactura(dealData)
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
    console.error('Error generando documento:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
