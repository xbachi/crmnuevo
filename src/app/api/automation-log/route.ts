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

  await pool.query(
    `INSERT INTO automation_logs
       (tipo, numero_factura, coche, matricula, invoice_type,
        venta_guardada, compra_adjunta, email_gestora, ok, notas, detalle_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      (b.tipo as string) ?? 'factura_venta',
      (b.numeroFactura as string) ?? null,
      (b.coche as string) ?? null,
      (b.matricula as string) ?? null,
      (b.invoiceType as string) ?? null,
      bool(b.ventaGuardada),
      bool(b.compraAdjunta),
      bool(b.emailGestora),
      bool(b.ok),
      (b.notas as string) ?? null,
      JSON.stringify(b.detalle ?? {}),
    ]
  )
  return NextResponse.json({ ok: true })
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
            venta_guardada, compra_adjunta, email_gestora, ok, notas, created_at
       FROM automation_logs
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  )
  return NextResponse.json({ logs: res.rows })
}
