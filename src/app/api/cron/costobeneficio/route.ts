/**
 * GET /api/cron/costobeneficio  — disparado por Vercel Cron (diario).
 *
 * Backstop de la reconciliación CB ↔ CRM: corre el check (alerta si hay
 * faltantes) y un resync fill (rellena celdas de costo vacías). El mecanismo
 * principal es el auto-resync desde POST /api/vehiculos/gasto; esto es la red
 * de seguridad por si algún costo no se reflejó. Tercer paso: reintenta las
 * filas pendientes de webhook_outbox (webhooks de gestoría que fallaron).
 *
 * Auth: Vercel inyecta `Authorization: Bearer $CRON_SECRET` en las llamadas de
 * cron (hay que setear CRON_SECRET en el env). También acepta X-Admin-Secret
 * para dispararlo a mano.
 */

import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/secrets'
import { notificarFalloCron } from '@/lib/cronNotify'

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

  const year = parseInt(
    new URL(request.url).searchParams.get('year') ||
      String(new Date().getFullYear()),
    10
  )
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host = request.headers.get('host') ?? ''
  const base = `${proto}://${host}`
  const h = { 'x-admin-secret': adminSecret }

  const out: Record<string, unknown> = { year }
  // Pasos con ok:false; al final se avisa por mail (A6) en un solo envío.
  const fallos: Record<string, unknown> = {}
  try {
    // 1. resync fill (rellena celdas vacías desde el CRM)
    const rs = await fetch(
      `${base}/api/admin/resync-costobeneficio?year=${year}`,
      { method: 'POST', headers: h }
    )
    out.resync = await rs.json().catch(() => ({ status: rs.status }))
    if ((out.resync as { ok?: boolean })?.ok === false)
      fallos.resync = out.resync
    // 2. check (reporta faltantes CB + Control Facturas)
    const ck = await fetch(`${base}/api/admin/check-facturas?year=${year}`, {
      headers: h,
    })
    const check = await ck.json().catch(() => ({ status: ck.status }))
    out.ok = (check as { ok?: boolean }).ok ?? null
    out.check = check
    if (out.ok === false) {
      console.warn(
        '[cron/costobeneficio] inconsistencias:',
        JSON.stringify(check)
      )
      fallos.check = check
    }
    // 3. reintento del outbox de webhooks de gestoría; un fallo acá no tumba 1 y 2
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
    await notificarFalloCron('costobeneficio', {
      year,
      error: out.error,
      ...fallos,
    })
    return NextResponse.json(out, { status: 500 })
  }
  if (Object.keys(fallos).length > 0) {
    await notificarFalloCron('costobeneficio', { year, ...fallos })
  }
  return NextResponse.json(out)
}
