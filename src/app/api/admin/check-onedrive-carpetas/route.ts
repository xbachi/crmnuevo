/**
 * POST /api/admin/check-onedrive-carpetas
 *   ?dryRun=true|false&maxCrear=10&maxMover=10&maxRenombrar=10&presupuestoMs=40000
 *
 * Cruza las carpetas reales de OneDrive con los vehículos del CRM: faltantes,
 * sin vehículo, no canónicas, duplicadas. Con dryRun=false crea las faltantes
 * de coches en stock (hasta maxCrear), mueve a VENDIDOS las de coches vendidos
 * que están fuera (maxMover) y renombra las que están en el contenedor correcto
 * con nombre no canónico (maxRenombrar), con presupuesto de tiempo
 * (presupuestoMs). Protegido por X-Admin-Secret.
 */
import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/secrets'
import { checkCarpetasOneDrive } from '@/lib/onedriveCarpetas'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const secret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || !safeEqual(request.headers.get('x-admin-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dryRun') !== 'false'
    const maxCrear = Number(searchParams.get('maxCrear') ?? 10)
    const maxMover = Number(searchParams.get('maxMover') ?? 10)
    const maxRenombrar = Number(searchParams.get('maxRenombrar') ?? 10)
    const presupuestoMs = Number(searchParams.get('presupuestoMs') ?? 40_000)
    const resumen = await checkCarpetasOneDrive({
      dryRun,
      maxCrear,
      maxMover,
      maxRenombrar,
      presupuestoMs,
    })
    return NextResponse.json(resumen)
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
