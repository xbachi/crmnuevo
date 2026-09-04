/**
 * POST /api/deals/[id]/contrato/enviar-firma — envía el contrato de venta del
 * deal a firma digital (adapter en src/lib/firmaDigital.ts, hoy Signaturit).
 *
 * Requiere sesión (middleware default: la ruta NO está en la whitelist).
 * Sin SIGNATURIT_API_KEY → 501 (feature apagada).
 *
 * Body (todo opcional): {
 *   pdfBase64?: string,     // fallback documentado: si no viene, el PDF se
 *                           // genera acá con generarContratoVenta(getDealById)
 *   firmantes?: [{ nombre, email }]  // default: el cliente del deal
 * }
 *
 * Guarda la solicitud en firma_solicitudes (estado 'enviada'); el estado lo
 * actualiza después POST /api/firma/webhook.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool, getDealById } from '@/lib/direct-database'
import { getProveedorFirma, type Firmante } from '@/lib/firmaDigital'
import type { DealData } from '@/lib/contractGenerator'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const proveedor = getProveedorFirma()
  if (!proveedor) {
    return NextResponse.json(
      { error: 'firma digital no configurada', hint: 'setear SIGNATURIT_API_KEY' },
      { status: 501 }
    )
  }

  const { id: idStr } = await params
  const dealId = parseInt(idStr, 10)
  if (isNaN(dealId)) {
    return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>

  try {
    const deal = await getDealById(dealId)
    if (!deal) {
      return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })
    }

    // Firmantes: los del body o el cliente del deal.
    let firmantes: Firmante[]
    if (Array.isArray(b.firmantes) && b.firmantes.length > 0) {
      firmantes = (b.firmantes as Array<Record<string, unknown>>).map((f) => ({
        nombre: String(f.nombre ?? '').trim(),
        email: String(f.email ?? '').trim(),
      }))
    } else {
      const c = deal.cliente
      firmantes = [
        {
          nombre: `${c?.nombre ?? ''} ${c?.apellidos ?? ''}`.trim(),
          email: String(c?.email ?? '').trim(),
        },
      ]
    }
    if (firmantes.some((f) => !f.nombre || !f.email)) {
      return NextResponse.json(
        {
          error: 'firmantes incompletos (nombre y email requeridos)',
          hint: 'el cliente del deal no tiene email; manda firmantes en el body',
        },
        { status: 400 }
      )
    }

    // PDF: el del body (fallback documentado) o el contrato de venta generado acá.
    let pdfBase64: string
    if (typeof b.pdfBase64 === 'string' && b.pdfBase64.length > 0) {
      pdfBase64 = b.pdfBase64
    } else {
      const { generarContratoVenta } = await importContrato()
      const bytes = await generarContratoVenta(deal as unknown as DealData)
      pdfBase64 = Buffer.from(bytes).toString('base64')
    }

    const nombreArchivo = `contrato-venta-${deal.numero ?? dealId}.pdf`
    const solicitud = await proveedor.crearSolicitud({
      pdfBase64,
      nombreArchivo,
      firmantes,
      metadata: { dealId: String(dealId), dealNumero: String(deal.numero ?? '') },
    })

    const ins = await pool.query(
      `INSERT INTO firma_solicitudes (deal_id, proveedor, solicitud_id, estado)
       VALUES ($1, $2, $3, 'enviada')
       RETURNING id`,
      [dealId, proveedor.nombre, solicitud.solicitudId]
    )

    return NextResponse.json({
      ok: true,
      id: ins.rows[0].id,
      proveedor: proveedor.nombre,
      solicitudId: solicitud.solicitudId,
      url: solicitud.url ?? null,
      firmantes,
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? String(err) },
      { status: 500 }
    )
  }
}

// import dinámico: contractGenerator arrastra jsPDF + logo base64; solo se
// paga cuando de verdad hay que generar el PDF acá.
async function importContrato() {
  return import('@/lib/contractGenerator')
}
