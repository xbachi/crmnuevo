/**
 * GET /api/gestoria/pendientes-fiscal — facturas registradas SIN datos fiscales.
 *
 * Lo consume el enriquecedor del server (cron): devuelve las filas en estado
 * 'registrada' sin `base_total` (documento archivado pero sin extraer), con su
 * hash y ubicación, para que el server las extraiga (regex→LLM) y las complete
 * vía POST /api/gestoria/factura con el mismo hash (enriquecimiento en su sitio).
 *
 * Auth: X-Webhook-Secret (el mismo del webhook de registro). En whitelist del
 * middleware. Solo lectura.
 *
 * Query: ?limit=N (default 200, máx 1000).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'

export const maxDuration = 30

export async function GET(request: NextRequest) {
  const secret = process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-webhook-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limRaw = parseInt(searchParams.get('limit') ?? '200', 10)
  const limit = Number.isFinite(limRaw)
    ? Math.min(1000, Math.max(1, limRaw))
    : 200

  try {
    // Tolerante a esquema viejo: si aún no existe la columna estado/base_total
    // (migración fiscal sin aplicar) devolvemos vacío en vez de romper.
    const col = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = 'facturas_registro' AND column_name IN ('estado','base_total')`
    )
    if ((col.rows[0]?.n ?? 0) < 2) {
      return NextResponse.json({
        pendientes: [],
        total: 0,
        nota: 'esquema fiscal no aplicado',
      })
    }

    const r = await pool.query(
      `SELECT id, hash_contenido AS hash, ruta, nombre_archivo AS nombre,
              proveedor, categoria, matricula, numero_factura, anio, trimestre
         FROM facturas_registro
        WHERE estado = 'registrada' AND base_total IS NULL
        ORDER BY fecha_factura DESC NULLS LAST, id DESC
        LIMIT $1`,
      [limit]
    )
    return NextResponse.json({ pendientes: r.rows, total: r.rows.length })
  } catch (err) {
    const e = err as { message?: string }
    return NextResponse.json(
      { error: e.message ?? String(err) },
      { status: 500 }
    )
  }
}
