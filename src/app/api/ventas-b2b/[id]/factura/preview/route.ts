import { NextRequest, NextResponse } from 'next/server'
import { getVentaB2BById } from '@/lib/b2b-database'
import { generarFactura } from '@/lib/contractGenerator'

/**
 * GET /api/ventas-b2b/{id}/factura/preview
 *
 * Genera un PDF de FACTURA visual idéntico al definitivo, pero con número
 * "BORRADOR-..." para que sea evidente que es una vista previa. NO consume
 * número fiscal, NO inserta en `invoices`, NO sube a Blob, NO persiste nada.
 *
 * Default REBU (igual que el flujo real). ?tipo=VAT para preview con IVA.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raw } = await params
    const id = parseInt(raw, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }
    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo') === 'VAT' ? 'IVA' : 'REBU'

    const venta = await getVentaB2BById(id)
    if (!venta) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    const dealData = {
      id: venta.id,
      numero: venta.numero,
      fechaCreacion: new Date(),
      cliente: {
        nombre:
          venta.cliente_razon_social.split(' ')[0] ?? venta.cliente_razon_social,
        apellidos: venta.cliente_razon_social.split(' ').slice(1).join(' '),
        dni: venta.cliente_cif_nif,
      },
      vehiculo: {
        marca: venta.vehiculo_marca ?? '',
        modelo: venta.vehiculo_modelo ?? '',
        matricula: venta.vehiculo_matricula ?? '',
        bastidor: venta.vehiculo_bastidor ?? '',
        kms: venta.vehiculo_kms ?? 0,
        año: venta.vehiculo_anio ?? undefined,
        fechaMatriculacion: venta.vehiculo_fecha_matriculacion ?? undefined,
      },
      importeTotal: Number(venta.precio_venta),
      importeSena: 0,
    }

    const numeroPreview = `BORRADOR-${venta.numero}`
    const pdfBytes = await generarFactura(
      dealData as never,
      tipo as 'IVA' | 'REBU',
      numeroPreview
    )

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="preview-factura-${venta.numero}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/ventas-b2b/[id]/factura/preview]', err)
    return NextResponse.json(
      { error: 'Error generando vista previa' },
      { status: 500 }
    )
  }
}
