/**
 * POST /api/revision/sync — puebla la bandeja desde la propia DB, sin esperar
 * a n8n: genera items 'registro-incompleto' para cada fila de facturas_registro
 * con fecha_factura NULL o importe NULL (dedup_key = 'registro-'||id, así el
 * mismo registro nunca se encola dos veces).
 *
 * Protegido por X-Admin-Secret (mismo patrón que /api/gestoria/audit).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'

export async function POST(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-admin-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const ins = await pool.query(
      `INSERT INTO revision_items (origen, titulo, payload, dedup_key)
       SELECT
         'registro-incompleto',
         'Factura de ' || fr.proveedor || ' sin ' ||
           CASE
             WHEN fr.fecha_factura IS NULL AND fr.importe IS NULL THEN 'fecha ni importe'
             WHEN fr.fecha_factura IS NULL THEN 'fecha'
             ELSE 'importe'
           END,
         jsonb_build_object(
           'tipoAccion',    'registro',
           'registroId',    fr.id,
           'proveedor',     fr.proveedor,
           'categoria',     fr.categoria,
           'numeroFactura', fr.numero_factura,
           'fecha',         fr.fecha_factura,
           'importe',       fr.importe,
           'matricula',     fr.matricula,
           'rutaArchivo',   fr.ruta,
           'nombreArchivo', fr.nombre_archivo,
           'motivo',        'registro incompleto (sin fecha y/o importe)'
         ),
         'registro-' || fr.id
       FROM facturas_registro fr
       WHERE fr.fecha_factura IS NULL OR fr.importe IS NULL
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`
    )
    return NextResponse.json({ ok: true, encolados: ins.rows.length })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message ?? String(err) },
      { status: 500 }
    )
  }
}
