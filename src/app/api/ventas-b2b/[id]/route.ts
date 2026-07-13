import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import {
  getVentaB2BById,
  deleteVentaB2B,
  ventaB2BHasActiveInvoice,
  liberarVehiculoDeVentaB2B,
} from '@/lib/b2b-database'
import { pool } from '@/lib/direct-database'

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
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }
    return NextResponse.json(venta)
  } catch (err) {
    console.error('[GET /api/ventas-b2b/[id]]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

/**
 * DELETE /api/ventas-b2b/{id}
 * Borra una venta B2B. Bloquea la operación si tiene una factura fiscal
 * activa (no anulada) — esos números fiscales no se pueden perder.
 * Intenta limpiar el PDF del contrato del Blob como best-effort.
 */
export async function DELETE(
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
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    }

    if (await ventaB2BHasActiveInvoice(id)) {
      return NextResponse.json(
        {
          error:
            'Esta venta tiene una factura fiscal emitida. Anulala primero desde Facturación antes de borrarla.',
          code: 'HAS_INVOICE',
        },
        { status: 409 }
      )
    }

    const deleted = await deleteVentaB2B(id)
    if (!deleted) {
      return NextResponse.json({ error: 'No se pudo borrar' }, { status: 500 })
    }

    // La venta ya no existe: el coche vuelve a stock (igual que deleteDeal en
    // retail), salvo que otra venta B2B vigente o un deal lo reclamen.
    await liberarVehiculoDeVentaB2B(pool, {
      vehiculoId: deleted.vehiculo_id,
      ventaId: id,
      origen: `delete-venta-b2b:${deleted.numero}`,
    })

    // Cleanup del PDF del contrato (best-effort)
    if (deleted.pdf_storage_key) {
      try {
        await del(deleted.pdf_storage_key)
      } catch (e) {
        console.warn('[DELETE venta-b2b] no se pudo borrar PDF del blob:', e)
      }
    }

    return NextResponse.json({ deleted: true, id })
  } catch (err) {
    console.error('[DELETE /api/ventas-b2b/[id]]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
