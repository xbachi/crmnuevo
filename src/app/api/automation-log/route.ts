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

  // Upsert atómico por número de factura: re-reportar la misma factura (p. ej.
  // tras reenviar a la gestora un mail que había fallado) ACTUALIZA la fila en
  // vez de crear un duplicado. Conserva created_at original.
  // Requiere el índice único de fix-automation-logs-unique.sql (aplicado antes
  // de este deploy); ON CONFLICT sobre una columna sin constraint falla.
  // xmax=0 es el truco estándar de Postgres para distinguir INSERT de UPDATE
  // en el mismo RETURNING (evita la carrera UPDATE-then-INSERT anterior, que
  // podía duplicar filas si dos reportes de la misma factura llegaban a la vez).
  const upsert = await pool.query<{ inserted: boolean }>(
    `INSERT INTO automation_logs
       (tipo, numero_factura, coche, matricula, invoice_type,
        venta_guardada, compra_adjunta, email_gestora, contrato_enviado, ok, notas, detalle_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (numero_factura) DO UPDATE SET
       tipo=EXCLUDED.tipo, coche=EXCLUDED.coche, matricula=EXCLUDED.matricula,
       invoice_type=EXCLUDED.invoice_type, venta_guardada=EXCLUDED.venta_guardada,
       compra_adjunta=EXCLUDED.compra_adjunta, email_gestora=EXCLUDED.email_gestora,
       contrato_enviado=EXCLUDED.contrato_enviado, ok=EXCLUDED.ok,
       notas=EXCLUDED.notas, detalle_json=EXCLUDED.detalle_json
     RETURNING (xmax = 0) AS inserted`,
    params
  )
  const wasInserted = upsert.rows[0]?.inserted ?? true
  return NextResponse.json(
    wasInserted ? { ok: true, inserted: true } : { ok: true, updated: 1 }
  )
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
