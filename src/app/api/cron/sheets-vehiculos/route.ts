/**
 * GET /api/cron/sheets-vehiculos — disparado por Vercel Cron (diario).
 *
 * Red de seguridad del upsert de vehículos en las hojas: 1) comprueba y
 * repara todas las filas (checkSheetsVehiculos, en proceso: no se reenvía el
 * ADMIN_SECRET a una URL construida desde Host) y 2) reintenta el outbox
 * (sheets_vehiculo y el resto). Si algo falla, avisa por mail con
 * notificarFalloCron.
 *
 * Va por tandas: Vercel corta la función a los 60 s y la primera pasada tiene
 * más de mil celdas que escribir. Cada llamada procesa como mucho MAX_TANDA
 * vehículos (o ?max=), se detiene a los PRESUPUESTO_MS y devuelve
 * `check.completo` y `check.siguienteDesdeId`; quien lo llama repite con
 * ?desde=<ese id> hasta que `completo` sea true (lo hace el crontab del
 * servidor, ver /root/crm_cron_llamar.sh).
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel) o X-Admin-Secret (a mano).
 */
import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/secrets'
import { notificarFalloCron } from '@/lib/cronNotify'
import { checkSheetsVehiculos } from '@/lib/sheetsVehiculo'

export const maxDuration = 60

/** Vehículos por llamada y tope de tiempo, con margen sobre los 60 s. */
const MAX_TANDA = 25
const PRESUPUESTO_MS = 40_000

const entero = (v: string | null) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

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

  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host = request.headers.get('host') ?? ''
  const base = `${proto}://${host}`
  const h = { 'x-admin-secret': adminSecret }

  const out: Record<string, unknown> = {}
  const fallos: Record<string, unknown> = {}
  try {
    // 1. check + reparación de las filas de vehículos
    const sp = request.nextUrl.searchParams
    const resumen = await checkSheetsVehiculos({
      dryRun: false,
      motivo: 'cron',
      desdeId: entero(sp.get('desde')),
      maxVehiculos: entero(sp.get('max')) || MAX_TANDA,
      presupuestoMs: PRESUPUESTO_MS,
    })
    const check = { ok: resumen.errores.length === 0, ...resumen }
    out.ok = check.ok
    out.check = check
    if (!check.ok) {
      console.warn(
        '[cron/sheets-vehiculos] errores:',
        JSON.stringify(resumen.errores)
      )
      fallos.check = check
    }
    // 2. reintento del outbox; un fallo acá no tumba el paso 1
    try {
      const ob = await fetch(`${base}/api/admin/webhook-outbox/retry`, {
        method: 'POST',
        headers: h,
      })
      out.outbox = await ob
        .json()
        .catch(() => ({ ok: false, status: ob.status }))
    } catch (err) {
      out.outbox = { ok: false, error: (err as Error).message }
    }
    if ((out.outbox as { ok?: boolean })?.ok === false)
      fallos.outbox = out.outbox
  } catch (err) {
    out.error = (err as Error).message
    await notificarFalloCron('sheets-vehiculos', {
      error: out.error,
      ...fallos,
    })
    return NextResponse.json(out, { status: 500 })
  }
  if (Object.keys(fallos).length > 0) {
    await notificarFalloCron('sheets-vehiculos', fallos)
  }
  return NextResponse.json(out)
}
