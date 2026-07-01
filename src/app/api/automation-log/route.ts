import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { readSessionFromRequest } from '@/lib/auth-server'

/**
 * Registro de automatizaciones.
 *
 * POST — lo llama el receptor de n8n al terminar de procesar una factura de
 *   venta (archivar + buscar compra + mail a la gestora). Se autentica con el
 *   mismo secreto del webhook (X-Webhook-Secret), por eso está en la whitelist
 *   del middleware (no requiere sesión de usuario).
 * GET — lo consume la sección del CRM; requiere sesión (validada acá porque el
 *   middleware no protege esta ruta).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-webhook-secret') ?? ''
  if (!secret || got !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const bool = (v: unknown): boolean | null =>
    typeof v === 'boolean' ? v : v == null ? null : Boolean(v)

  const params = [
    (b.tipo as string) ?? 'factura_venta',
    (b.numeroFactura as string) ?? null,
    (b.coche as string) ?? null,
    (b.matricula as string) ?? null,
    (b.invoiceType as string) ?? null,
    bool(b.ventaGuardada),
    bool(b.compraAdjunta),
    bool(b.emailGestora),
    bool(b.contratoEnviado),
    bool(b.ok),
    (b.notas as string) ?? null,
    JSON.stringify(b.detalle ?? {}),
  ]

  // Upsert por número de factura: re-reportar la misma factura (p. ej. tras
  // reenviar a la gestora un mail que había fallado) ACTUALIZA la fila en vez
  // de crear un duplicado. Conserva created_at original.
  const numeroFactura = params[1] as string | null
  if (numeroFactura) {
    const upd = await pool.query(
      `UPDATE automation_logs
          SET tipo=$1, coche=$3, matricula=$4, invoice_type=$5,
              venta_guardada=$6, compra_adjunta=$7, email_gestora=$8,
              contrato_enviado=$9, ok=$10, notas=$11, detalle_json=$12
        WHERE numero_factura=$2`,
      params
    )
    if ((upd.rowCount ?? 0) > 0) {
      return NextResponse.json({ ok: true, updated: upd.rowCount })
    }
  }

  await pool.query(
    `INSERT INTO automation_logs
       (tipo, numero_factura, coche, matricula, invoice_type,
        venta_guardada, compra_adjunta, email_gestora, contrato_enviado, ok, notas, detalle_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    params
  )
  return NextResponse.json({ ok: true, inserted: true })
}

export async function GET(request: NextRequest) {
  const session = readSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const limit = Math.min(
    Number(request.nextUrl.searchParams.get('limit')) || 200,
    500
  )
  const res = await pool.query(
    `SELECT id, tipo, numero_factura, coche, matricula, invoice_type,
            venta_guardada, compra_adjunta, email_gestora, contrato_enviado, ok, notas, created_at
       FROM automation_logs
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  )
  return NextResponse.json({ logs: res.rows })
}
