/**
 * GET /api/cron/onedrive-carpetas — disparado por Vercel Cron (diario).
 *
 * Red de seguridad de las carpetas de coche en OneDrive: lista lo real, lo
 * cruza con el CRM, crea las faltantes de coches en stock, mueve a VENDIDOS
 * las de coches vendidos que están fuera y renombra las no canónicas que ya
 * están en el contenedor correcto. Sólo avisa por mail (notificarFalloCron)
 * si hay errores; conflictos y topes van en `omitidas`, y duplicados, no
 * canónicas, sin vehículo y `revisarUbicacion` van en la respuesta y en el
 * log (el outbox lo reintenta el cron de sheets-vehiculos).
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel) o X-Admin-Secret (a mano).
 */
import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/secrets'
import { notificarFalloCron } from '@/lib/cronNotify'
import { checkCarpetasOneDrive } from '@/lib/onedriveCarpetas'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const adminSecret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const cronSecret = process.env.CRON_SECRET ?? ''
  const auth = request.headers.get('authorization') ?? ''
  const admin = request.headers.get('x-admin-secret') ?? ''
  const okCron = !!cronSecret && safeEqual(auth, `Bearer ${cronSecret}`)
  const okAdmin = !!adminSecret && safeEqual(admin, adminSecret)
  if (!okCron && !okAdmin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const resumen = await checkCarpetasOneDrive({ dryRun: false })
    const ok = resumen.errores.length === 0
    console.warn(
      '[cron/onedrive-carpetas] resumen:',
      JSON.stringify({
        errores: resumen.errores,
        creadas: resumen.creadas.length,
        movidas: resumen.movidas.length,
        renombradas: resumen.renombradas.length,
        revisarUbicacion: resumen.revisarUbicacion.length,
        omitidas: resumen.omitidas.length,
        presupuestoAgotado: resumen.presupuestoAgotado,
        pendientes: resumen.pendientes,
        faltantes: resumen.faltantes.length,
        duplicados: resumen.duplicados.length,
        noCanonicas: resumen.noCanonicas.length,
        sinVehiculo: resumen.sinVehiculo.length,
      })
    )
    if (!ok) {
      await notificarFalloCron('onedrive-carpetas', {
        errores: resumen.errores,
        creadas: resumen.creadas,
        movidas: resumen.movidas,
        renombradas: resumen.renombradas,
        omitidas: resumen.omitidas,
        revisarUbicacion: resumen.revisarUbicacion,
        presupuestoAgotado: resumen.presupuestoAgotado,
        pendientes: resumen.pendientes,
        duplicados: resumen.duplicados,
        noCanonicas: resumen.noCanonicas,
        sinVehiculo: resumen.sinVehiculo,
        faltantes: resumen.faltantes,
      })
    }
    return NextResponse.json({ ok, ...resumen })
  } catch (err) {
    const error = (err as Error).message
    await notificarFalloCron('onedrive-carpetas', { error })
    return NextResponse.json({ ok: false, error }, { status: 500 })
  }
}
