import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { documentExists, getDocumentPath } from '@/lib/documentStorage'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string; documentType: string }> }
) {
  try {
    const { dealId, documentType } = await params

    // Validar parámetros
    if (!dealId || !documentType) {
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

    // Obtener el número del deal desde la query string
    const { searchParams } = new URL(request.url)
    const dealNumber = searchParams.get('dealNumber')

    if (!dealNumber) {
      return NextResponse.json(
        { error: 'Número de deal requerido' },
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

    // Verificar si el documento existe
    const exists = await documentExists(
      dealIdNum,
      documentType as any,
      dealNumber
    )

    if (!exists) {
      return NextResponse.json(
        { error: 'Documento no encontrado' },
        { status: 404 }
      )
    }

    // Obtener la ruta del archivo
    const filePath = getDocumentPath(dealIdNum, documentType as any, dealNumber)

    // Leer el archivo
    const fileBuffer = await fs.readFile(filePath)

    // Determinar el nombre del archivo
    const fileName = `${documentType}-${dealNumber}.pdf`

    // Retornar el archivo
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error descargando documento:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
