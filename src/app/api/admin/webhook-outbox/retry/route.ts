/**
 * POST /api/admin/webhook-outbox/retry
 *
 * Reintenta las filas 'pendiente' de webhook_outbox con intentos <
 * max_intentos (C-23). Lo dispara el cron diario /api/cron/costobeneficio
 * (paso 3) o un humano.
 *
 * El reenvío se ROUTEA por `tipo`: la tabla ya no guarda solo facturas para la
 * gestoría, también avisos de estado a la web ('web_estado'). Mandar el
 * payload de un coche al webhook de la gestoría sería basura en el destino
 * equivocado, así que un tipo desconocido no se manda a ningún lado.
 *
 * Protegido por X-Admin-Secret.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import {
  postGestoriaWebhook,
  type GestoriaInvoicePayload,
} from '@/lib/gestoriaWebhook'
import { postWebEstado, type WebEstadoPayload } from '@/lib/webSync'
import {
  markOutboxEnviado,
  markOutboxFallo,
  markOutboxAgotado,
} from '@/lib/webhookOutbox'
import { safeEqual } from '@/lib/secrets'

interface PendingRow {
  id: number
  tipo: string | null
  payload: unknown
  /** Referencia humana de la fila: nº de factura, o matrícula si tipo='web_estado'. */
  numero_factura: string | null
}

interface Reenvio {
  ok: boolean
  error?: string
  /** Fallo definitivo: agotar los intentos en vez de dejarla 'pendiente'. */
  permanente?: boolean
}

/** Reenvía una fila según su tipo. Nunca adivina destino. */
async function reenviar(row: PendingRow): Promise<Reenvio> {
  switch (row.tipo) {
    // El tipo que inserta gestoriaWebhook.ts (y el DEFAULT de la tabla).
    case 'factura_venta':
      return postGestoriaWebhook(row.payload as GestoriaInvoicePayload)
    case 'web_estado':
      return postWebEstado(row.payload as WebEstadoPayload)
    default:
      return {
        ok: false,
        error: `tipo desconocido '${row.tipo ?? 'null'}': sin destino, no se reenvía`,
      }
  }
}

export async function POST(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-admin-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const pending = await pool.query<PendingRow>(
      `SELECT id, tipo, payload, numero_factura
         FROM webhook_outbox
        WHERE estado = 'pendiente' AND intentos < max_intentos
        ORDER BY created_at ASC`
    )

    let exitosas = 0
    let fallidas = 0
    const detalle: {
      id: number
      tipo: string | null
      referencia: string | null
      ok: boolean
      error: string | null
    }[] = []

    for (const row of pending.rows) {
      const result = await reenviar(row)
      if (result.ok) {
        exitosas++
        await markOutboxEnviado(row.id)
      } else {
        fallidas++
        const motivo = result.error ?? 'unknown error'
        if (result.permanente) await markOutboxAgotado(row.id, motivo)
        else await markOutboxFallo(row.id, motivo)
      }
      detalle.push({
        id: row.id,
        tipo: row.tipo,
        referencia: row.numero_factura,
        ok: result.ok,
        error: result.error ?? null,
      })
    }

    return NextResponse.json({
      ok: fallidas === 0,
      reintentadas: pending.rows.length,
      exitosas,
      fallidas,
      detalle,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
