/**
 * Bandeja única de revisión de documentos (patrón Dext/Hubdoc).
 *
 * POST /api/revision — encola un item. Lo llama n8n (X-Webhook-Secret, mismo
 * patrón que /api/gestoria/factura) cuando un documento queda en REVIEW/FAIL:
 * carpeta VERIFICACION MANUAL de OneDrive, IMAP "Revisar manual", gasto
 * rechazado por rango (422 de /api/vehiculos/gasto), etc.
 * Dedup por dedup_key UNIQUE: ON CONFLICT DO NOTHING → { duplicado: true }.
 * Si el caller no manda dedupKey se deriva md5(origen|titulo|payload).
 *
 * GET /api/revision?estado=pendiente&page=1&limit=50 — lista con paginación.
 * Requiere sesión (validada acá porque el prefijo está en la whitelist del
 * middleware para el POST de n8n; mismo patrón que /api/automation-log).
 *
 * Body POST: {
 *   origen: 'verificacion-manual'|'gasto-rechazado'|'registro-incompleto'|'imap-revisar'|'otro',
 *   titulo: string,
 *   dedupKey?: string,
 *   payload?: { proveedor?, numeroFactura?, fecha?, importe?, matricula?,
 *               categoria?, rutaArchivo?, motivo?, tipoAccion?, registroId?, gasto? }
 * }
 */

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'

const ORIGENES = [
  'verificacion-manual',
  'gasto-rechazado',
  'registro-incompleto',
  'imap-revisar',
  'otro',
] as const

const ESTADOS = ['pendiente', 'aprobado', 'descartado'] as const

export async function POST(request: NextRequest) {
  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || (request.headers.get('x-webhook-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const origen = String(b.origen ?? '').trim()
  const titulo = String(b.titulo ?? '').trim()
  if (!(ORIGENES as readonly string[]).includes(origen)) {
    return NextResponse.json(
      { error: `origen inválido: "${origen}". Válidos: ${ORIGENES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!titulo) {
    return NextResponse.json({ error: 'titulo requerido' }, { status: 400 })
  }
  const payload =
    b.payload && typeof b.payload === 'object' && !Array.isArray(b.payload)
      ? (b.payload as Record<string, unknown>)
      : {}
  const dedupKey =
    b.dedupKey && String(b.dedupKey).trim()
      ? String(b.dedupKey).trim()
      : crypto
          .createHash('md5')
          .update(`${origen}|${titulo}|${JSON.stringify(payload)}`)
          .digest('hex')

  try {
    const ins = await pool.query(
      `INSERT INTO revision_items (origen, titulo, payload, dedup_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [origen, titulo, JSON.stringify(payload), dedupKey]
    )
    if (ins.rows.length > 0) {
      return NextResponse.json({ ok: true, duplicado: false, id: ins.rows[0].id })
    }
    const dup = await pool.query(
      `SELECT id, estado FROM revision_items WHERE dedup_key = $1 LIMIT 1`,
      [dedupKey]
    )
    return NextResponse.json({ ok: true, duplicado: true, existente: dup.rows[0] ?? null })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message ?? String(err) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const { searchParams } = new URL(request.url)
  const estadoRaw = searchParams.get('estado') ?? 'pendiente'
  if (!(ESTADOS as readonly string[]).includes(estadoRaw)) {
    return NextResponse.json(
      { error: `estado inválido: "${estadoRaw}". Válidos: ${ESTADOS.join(', ')}` },
      { status: 400 }
    )
  }
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))
  const offset = (page - 1) * limit

  try {
    const [items, total, pendientes] = await Promise.all([
      pool.query(
        `SELECT id, origen, estado, titulo, payload, dedup_key, resolucion,
                resuelto_por, created_at, updated_at, resuelto_at
           FROM revision_items
          WHERE estado = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2 OFFSET $3`,
        [estadoRaw, limit, offset]
      ),
      pool.query(`SELECT count(*)::int n FROM revision_items WHERE estado = $1`, [estadoRaw]),
      pool.query(`SELECT count(*)::int n FROM revision_items WHERE estado = 'pendiente'`),
    ])
    return NextResponse.json({
      items: items.rows,
      total: total.rows[0].n,
      pendientes: pendientes.rows[0].n,
      page,
      limit,
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? String(err) },
      { status: 500 }
    )
  }
}
