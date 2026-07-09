/**
 * GET /api/cron/costobeneficio  — disparado por Vercel Cron (diario).
 *
 * Backstop de la reconciliación CB ↔ CRM: corre el check (alerta si hay
 * faltantes) y un resync fill (rellena celdas de costo vacías). El mecanismo
 * principal es el auto-resync desde POST /api/vehiculos/gasto; esto es la red
 * de seguridad por si algún costo no se reflejó.
 *
 * Auth: Vercel inyecta `Authorization: Bearer $CRON_SECRET` en las llamadas de
 * cron (hay que setear CRON_SECRET en el env). También acepta X-Admin-Secret
 * para dispararlo a mano.
 */

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const cronSecret = process.env.CRON_SECRET ?? ''
  const auth = request.headers.get('authorization') ?? ''
  const admin = request.headers.get('x-admin-secret') ?? ''
  const okCron = !!cronSecret && auth === `Bearer ${cronSecret}`
  const okAdmin = !!adminSecret && admin === adminSecret
  if (!okCron && !okAdmin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const year = parseInt(new URL(request.url).searchParams.get('year') || String(new Date().getFullYear()), 10)
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host = request.headers.get('host') ?? ''
  const base = `${proto}://${host}`
  const h = { 'x-admin-secret': adminSecret }

  const out: Record<string, unknown> = { year }
  try {
    // 1. resync fill (rellena celdas vacías desde el CRM)
    const rs = await fetch(`${base}/api/admin/resync-costobeneficio?year=${year}`, { method: 'POST', headers: h })
    out.resync = await rs.json().catch(() => ({ status: rs.status }))
    // 2. check (reporta faltantes CB + Control Facturas)
    const ck = await fetch(`${base}/api/admin/check-facturas?year=${year}`, { headers: h })
    const check = await ck.json().catch(() => ({ status: ck.status }))
    out.ok = (check as { ok?: boolean }).ok ?? null
    out.check = check
    if (out.ok === false) console.warn('[cron/costobeneficio] inconsistencias:', JSON.stringify(check))
  } catch (err) {
    out.error = (err as Error).message
    return NextResponse.json(out, { status: 500 })
  }
  return NextResponse.json(out)
}
