import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import {
  documentExists,
  getDocumentPath,
  deleteDocument,
} from '@/lib/documentStorage'
import { pool } from '@/lib/direct-database'

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

    // Factura: el módulo nuevo guarda el PDF en Vercel Blob, no en el FS.
    // Lo proxeamos con un Content-Disposition con nombre humano. Si no hay
    // fila (deals pre-migración), caemos al lookup del filesystem como antes.
    if (documentType === 'factura') {
      const { rows } = await pool.query<{
        id: number
        pdf_url: string | null
        full_invoice_number: string
      }>(
        `SELECT id, pdf_url, full_invoice_number FROM invoices
          WHERE deal_id = $1 AND status NOT IN ('VOIDED')
          ORDER BY id DESC LIMIT 1`,
        [dealIdNum]
      )
      if (rows[0]?.pdf_url) {
        const blobRes = await fetch(rows[0].pdf_url)
        if (!blobRes.ok || !blobRes.body) {
          return NextResponse.json(
            { error: 'No se pudo recuperar el PDF de la factura.' },
            { status: 502 }
          )
        }
        const filename = `factura-${rows[0].full_invoice_number}.pdf`
        return new NextResponse(blobRes.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'private, no-store',
          },
        })
      }
      if (rows[0] && !rows[0].pdf_url) {
        return NextResponse.json(
          {
            error:
              'PDF de la factura aún no disponible (pendiente de generación).',
          },
          { status: 409 }
        )
      }
      // sin fila en invoices → fallback al filesystem legacy
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
    return new NextResponse(new Uint8Array(fileBuffer), {
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

export async function DELETE(
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

    // Obtener el número del deal desde el body
    const body = await request.json()
    const dealNumber = body.dealNumber

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

    // Eliminar el documento
    await deleteDocument(dealIdNum, documentType as any, dealNumber)

    return NextResponse.json({
      message: 'Documento eliminado exitosamente',
    })
  } catch (error) {
    console.error('Error eliminando documento:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
