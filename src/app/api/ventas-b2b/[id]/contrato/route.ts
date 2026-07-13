import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import {
  getVentaB2BById,
  updateVentaB2BPdf,
  marcarVehiculoDeVentaB2BVendido,
} from '@/lib/b2b-database'
import { generarContratoCompraventaEstado } from '@/lib/contractGenerator'
import { pool } from '@/lib/direct-database'

/**
 * POST /api/ventas-b2b/{id}/contrato
 * Genera el PDF del contrato B2B "en el estado", lo sube a Vercel Blob y
 * actualiza la fila venta_b2b con la URL.
 *
 * GET /api/ventas-b2b/{id}/contrato
 * Proxea el PDF para que la descarga tenga Content-Disposition humano.
 */

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params
  const id = parseInt(raw, 10)
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  try {
    const venta = await getVentaB2BById(id)
    if (!venta) {
      return NextResponse.json(
        { error: 'Venta B2B no encontrada' },
        { status: 404 }
      )
    }

    const pdfBytes = await generarContratoCompraventaEstado({
      numero: venta.numero,
      fecha_venta: new Date(venta.fecha_venta),
      lugar_venta: venta.lugar_venta,
      comprador: {
        razon_social: venta.cliente_razon_social,
        cif_nif: venta.cliente_cif_nif,
      },
      vehiculo: {
        marca: venta.vehiculo_marca ?? '',
        modelo: venta.vehiculo_modelo ?? '',
        matricula: venta.vehiculo_matricula ?? '',
        bastidor: venta.vehiculo_bastidor ?? '',
        kms: venta.vehiculo_kms ?? 0,
        anio: venta.vehiculo_anio ?? null,
        fechaMatriculacion: venta.vehiculo_fecha_matriculacion ?? '',
      },
      precio_venta: Number(venta.precio_venta),
      forma_pago: venta.forma_pago,
    })

    // Subir a Vercel Blob (prefijo "contratos-b2b/")
    // addRandomSuffix=true: URL unguessable; descarga real pasa por
    // /api/ventas-b2b/[id]/contrato (protegido por middleware auth).
    const path = `contratos-b2b/contrato-b2b-${venta.numero}.pdf`
    const blob = await put(path, Buffer.from(pdfBytes), {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: true,
      allowOverwrite: true,
    })

    await updateVentaB2BPdf(venta.id, blob.url, blob.pathname)

    // La venta queda FIRMADO: el coche está vendido (idempotente si ya lo está,
    // p.ej. porque se marcó al crear la venta).
    await marcarVehiculoDeVentaB2BVendido(pool, {
      vehiculoId: venta.vehiculo_id,
      origen: `contrato-b2b:${venta.numero}`,
    })

    return NextResponse.json({
      id: venta.id,
      numero: venta.numero,
      pdf_url: blob.url,
      pdf_storage_key: blob.pathname,
    })
  } catch (err) {
    console.error('[POST /api/ventas-b2b/[id]/contrato]', err)
    return NextResponse.json(
      { error: 'Error generando contrato B2B' },
      { status: 500 }
    )
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params
  const id = parseInt(raw, 10)
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }
  try {
    const venta = await getVentaB2BById(id)
    if (!venta) {
      return NextResponse.json(
        { error: 'Venta no encontrada' },
        { status: 404 }
      )
    }
    if (!venta.pdf_url) {
      return NextResponse.json(
        {
          error:
            'El contrato aún no fue generado. Hacé clic en "Generar contrato B2B en el estado".',
          code: 'NO_PDF',
        },
        { status: 409 }
      )
    }
    const blobRes = await fetch(venta.pdf_url)
    if (!blobRes.ok || !blobRes.body) {
      return NextResponse.json(
        { error: 'No se pudo recuperar el PDF' },
        { status: 502 }
      )
    }
    const filename = `contrato-b2b-${venta.numero}.pdf`
    return new NextResponse(blobRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/ventas-b2b/[id]/contrato]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
