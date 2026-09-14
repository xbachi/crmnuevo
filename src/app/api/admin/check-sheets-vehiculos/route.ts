/**
 * POST /api/admin/check-sheets-vehiculos[?dryRun=true]
 *
 * Compara la fila esperada de cada vehículo (C/I/D/R) con las pestañas
 * gestionadas de COMPRAS y Ventas-Sevencars. Con dryRun=true devuelve el diff
 * sin escribir; sin él repara las celdas propiedad del CRM (mismo upsert que
 * los disparadores) y lista vehículos sin fila y filas sin vehículo.
 *
 * Protegido por X-Admin-Secret. Lo dispara el cron /api/cron/sheets-vehiculos.
 */
import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/secrets'
import { checkSheetsVehiculos } from '@/lib/sheetsVehiculo'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-admin-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const dryRun = new URL(request.url).searchParams.get('dryRun') === 'true'
  try {
    const resumen = await checkSheetsVehiculos({
      dryRun,
      motivo: 'admin',
    })
    return NextResponse.json({ ok: resumen.errores.length === 0, ...resumen })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
