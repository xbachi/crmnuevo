import { NextRequest, NextResponse } from 'next/server'
import {
  DocumentNotAvailableError,
  deleteDocument,
  isDocumentType,
  readDocument,
  type DocumentLocator,
  type DocumentType,
} from '@/lib/documentStorage'
import { pool } from '@/lib/direct-database'

interface DealDocRow {
  numero: string
  contratoReserva: string | null
  contratoVenta: string | null
  mandatoGestoria: string | null
}

interface ResolvedDocument {
  dealIdNum: number
  documentType: DocumentType
  /** Lo persistido en el deal: URL de Blob, nombre legacy o null. */
  ref: string | null
  locator: DocumentLocator
}

/**
 * Valida params y localiza el documento en el deal. `factura` no tiene
 * referencia de archivo en el deal (deal.factura es el número de factura):
 * solo se prueba el nombre legacy canónico.
 */
async function resolveDocument(
  dealId: string,
  documentType: string,
  dealNumberHint: string | null
): Promise<ResolvedDocument | NextResponse> {
  if (!dealId || !documentType) {
    return NextResponse.json({ error: 'Parámetros faltantes' }, { status: 400 })
  }
  if (!isDocumentType(documentType)) {
    return NextResponse.json(
      { error: 'Tipo de documento inválido' },
      { status: 400 }
    )
  }
  const dealIdNum = parseInt(dealId)
  if (isNaN(dealIdNum)) {
    return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 })
  }

  const { rows } = await pool.query<DealDocRow>(
    `SELECT numero, "contratoReserva", "contratoVenta", "mandatoGestoria"
       FROM "Deal" WHERE id = $1`,
    [dealIdNum]
  )
  const deal = rows[0]
  if (!deal) {
    return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })
  }

  const ref =
    documentType === 'contrato-reserva'
      ? deal.contratoReserva
      : documentType === 'contrato-venta'
        ? deal.contratoVenta
        : documentType === 'mandato-gestoria'
          ? deal.mandatoGestoria
          : null

  const dealNumber = deal.numero || dealNumberHint || String(dealIdNum)
  return {
    dealIdNum,
    documentType,
    ref,
    locator: { dealId: dealIdNum, documentType, dealNumber },
  }
}

function pdfResponse(
  body: Buffer | ReadableStream<Uint8Array>,
  fileName: string
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'private, no-store',
  }
  if (Buffer.isBuffer(body)) {
    headers['Content-Length'] = body.length.toString()
    return new NextResponse(new Uint8Array(body), { status: 200, headers })
  }
  return new NextResponse(body, { status: 200, headers })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string; documentType: string }> }
) {
  try {
    const { dealId, documentType } = await params
    const { searchParams } = new URL(request.url)

    const resolved = await resolveDocument(
      dealId,
      documentType,
      searchParams.get('dealNumber')
    )
    if (resolved instanceof NextResponse) return resolved
    const { dealIdNum, ref, locator } = resolved

    // Factura: el módulo de facturación guarda el PDF en Blob (invoices.pdf_url).
    // Si no hay fila (deals pre-migración) caemos al lookup legacy de abajo.
    if (locator.documentType === 'factura') {
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
        return pdfResponse(
          blobRes.body,
          `factura-${rows[0].full_invoice_number}.pdf`
        )
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
    }

    try {
      const buffer = await readDocument(ref, locator)
      return pdfResponse(
        buffer,
        `${locator.documentType}-${locator.dealNumber}.pdf`
      )
    } catch (error) {
      if (error instanceof DocumentNotAvailableError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.legacy ? 404 : 502 }
        )
      }
      throw error
    }
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
    const body = await request.json().catch(() => ({}))

    const resolved = await resolveDocument(
      dealId,
      documentType,
      typeof body?.dealNumber === 'string' ? body.dealNumber : null
    )
    if (resolved instanceof NextResponse) return resolved

    // Solo borra el archivo (Blob o legacy); la referencia en el deal la
    // limpia la ficha con su PUT `contratoX: null`, como hasta ahora.
    await deleteDocument(resolved.ref, resolved.locator)

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
