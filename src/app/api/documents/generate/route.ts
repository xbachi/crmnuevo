import { NextRequest, NextResponse } from 'next/server'
import {
  generarContratoReserva,
  generarContratoVenta,
  generarFactura,
  generarMandatoGestoria,
} from '@/lib/contractGenerator'
import {
  isDocumentType,
  saveDocument,
  type DocumentType,
} from '@/lib/documentStorage'
import {
  getDealById,
  setDealDocumentRef,
  type DealDocumentColumn,
} from '@/lib/direct-database'

// Columna del deal donde se persiste la referencia (URL de Blob) del PDF.
// `factura` no entra: deal.factura guarda el número de factura y el PDF lo
// gestiona el módulo de facturación (invoices.pdf_url).
const PERSIST_COLUMN: Partial<Record<DocumentType, DealDocumentColumn>> = {
  'contrato-reserva': 'contratoReserva',
  'contrato-venta': 'contratoVenta',
  'mandato-gestoria': 'mandatoGestoria',
}

interface GestoriaInput {
  nombre?: string | null
  nif?: string | null
  direccion?: string | null
}

// Gestoría del mandato: lo que venga en el body pisa el entorno; lo que no
// esté en ninguno queda como línea en blanco en el PDF.
function resolverGestoria(body: GestoriaInput | null | undefined) {
  return {
    nombre: body?.nombre ?? process.env.GESTORIA_NOMBRE ?? null,
    nif: body?.nif ?? process.env.GESTORIA_NIF ?? null,
    direccion: body?.direccion ?? process.env.GESTORIA_DIRECCION ?? null,
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 [API GENERATE] Iniciando generación de documento...')

    const body = await request.json()
    const { dealId, tipoFactura, numeroFactura, gestoria } = body
    // `type` es alias de `documentType` (la ficha manda documentType).
    const documentType = body.documentType ?? body.type
    let { dealData, dealNumber } = body

    console.log('🔍 [API GENERATE] Request recibido:', {
      dealId,
      documentType,
      tipoFactura,
      numeroFactura,
      dealNumber,
    })

    // Validar tipo de documento
    if (!documentType || !isDocumentType(documentType)) {
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

    // Sin dealData en el body (p. ej. mandato: basta con dealId), se carga el
    // deal de la base de datos.
    if ((!dealData || !dealNumber) && dealIdNum > 0) {
      const deal = await getDealById(dealIdNum)
      if (!deal) {
        return NextResponse.json(
          { error: 'Deal no encontrado' },
          { status: 404 }
        )
      }
      dealData = dealData ?? {
        numero: deal.numero,
        fechaCreacion: deal.fechaCreacion,
        cliente: deal.cliente,
        vehiculo: deal.vehiculo,
        importeTotal: deal.importeTotal,
        importeSena: deal.importeSena,
        formaPagoSena: deal.formaPagoSena,
        fechaReservaDesde: deal.fechaReservaDesde,
        fechaReservaExpira: deal.fechaReservaExpira,
        fechaVentaFirmada: deal.fechaVentaFirmada,
      }
      dealNumber = dealNumber ?? deal.numero
    }

    // Validar parámetros
    if (!dealData || !dealNumber) {
      return NextResponse.json(
        { error: 'Parámetros faltantes' },
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

        case 'mandato-gestoria':
          console.log('🔍 [API GENERATE] Generando mandato de gestoría...')
          pdfBuffer = await generarMandatoGestoria(dealData, {
            gestoria: resolverGestoria(gestoria),
          })
          console.log(
            '✅ [API GENERATE] Mandato de gestoría generado, tamaño:',
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

    // Contratos de deal: subir a Vercel Blob y persistir la URL en el deal.
    // El filesystem de Vercel es efímero, así que ya no se guarda en disco.
    // Documentos sueltos (dealId 0, generador de reservas) solo se devuelven.
    const column = PERSIST_COLUMN[documentType]
    if (dealIdNum > 0 && column) {
      try {
        const saved = await saveDocument(
          { dealId: dealIdNum, documentType, dealNumber: String(dealNumber) },
          pdfBuffer
        )
        await setDealDocumentRef(dealIdNum, column, saved.url)
        console.log(
          '✅ [API GENERATE] Documento guardado en Blob:',
          saved.pathname
        )
      } catch (saveError) {
        console.error('❌ [API GENERATE] Error guardando documento:', saveError)
        return NextResponse.json(
          {
            error:
              'Error guardando el documento en el almacenamiento persistente',
            details: (saveError as Error).message,
            type: 'save_error',
          },
          { status: 500 }
        )
      }
    }

    // Se devuelve el PDF directamente: la ficha lo descarga al instante y la
    // descarga posterior pasa por /api/documents/[dealId]/[documentType].
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${documentType}-${dealNumber}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'private, no-store',
      },
    })
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
