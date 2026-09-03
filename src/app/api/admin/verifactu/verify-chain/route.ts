/**
 * GET /api/admin/verifactu/verify-chain
 *
 * Verificación de la cadena de integridad "Verifactu-lite" (pendiente de
 * homologación — NO implementa envío a la AEAT ni supone cumplimiento legal):
 *  1. Recorre facturacion_registros recomputando cada hash desde el génesis;
 *     cualquier registro alterado/borrado rompe la cadena desde ese punto.
 *  2. Cruza invoices ISSUED contra registros 'alta': una ISSUED sin eslabón
 *     es sospechosa, salvo que sea anterior al arranque de la cadena
 *     (legacy: true — esperado hasta correr el backfill).
 *
 * Protegido por X-Admin-Secret (mismo patrón que /api/admin/check-facturas).
 * Sólo lee/reporta; no escribe nada.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import {
  verifyChainRows,
  type FacturacionRegistroRow,
} from '@/lib/facturacionRegistro'
import { safeEqual } from '@/lib/secrets'

export async function GET(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-admin-secret') ?? ''
  if (!secret || !safeEqual(got, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const { rows: registros } = await pool.query<FacturacionRegistroRow>(
      `SELECT * FROM facturacion_registros ORDER BY id ASC`
    )
    const roturas = verifyChainRows(registros)

    // Arranque de la cadena: toda ISSUED emitida antes es legacy (esperado).
    const chainStart =
      registros.length > 0 ? new Date(registros[0].created_at) : null

    const { rows: sinRegistro } = await pool.query<{
      id: number
      full_invoice_number: string
      invoice_date: string
      total_amount: string
      created_at: string
    }>(
      `SELECT i.id, i.full_invoice_number, i.invoice_date::TEXT AS invoice_date,
              i.total_amount, i.created_at
         FROM invoices i
        WHERE i.status = 'ISSUED'
          AND NOT EXISTS (
                SELECT 1 FROM facturacion_registros r
                 WHERE r.numero_serie = i.full_invoice_number
                   AND r.tipo_registro = 'alta'
              )
        ORDER BY i.invoice_date ASC, i.id ASC`
    )

    const facturasIssuedSinRegistro = sinRegistro.map((inv) => ({
      id: inv.id,
      full_invoice_number: inv.full_invoice_number,
      invoice_date: inv.invoice_date,
      total_amount: inv.total_amount,
      legacy: chainStart === null || new Date(inv.created_at) < chainStart,
    }))
    const noLegacy = facturasIssuedSinRegistro.filter((f) => !f.legacy)

    return NextResponse.json({
      ok: roturas.length === 0 && noLegacy.length === 0,
      totalRegistros: registros.length,
      roturas,
      facturasIssuedSinRegistro,
    })
  } catch (err) {
    console.error('[GET /api/admin/verifactu/verify-chain]', err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
