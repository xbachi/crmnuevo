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

function validYear(raw: string | null): number | null {
  const year = Number(raw ?? new Date().getFullYear())
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null
}

function internalBaseUrl(): string | null {
  const vercelHost = process.env.VERCEL_URL?.trim()
  if (!vercelHost || !/^[a-z0-9.-]+$/i.test(vercelHost)) return null
  return `https://${vercelHost}`
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(25_000),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : `HTTP ${response.status}`
    throw new Error(`${new URL(url).pathname}: ${detail}`)
  }
  return body
}

export async function GET(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET ?? ''
  const cronSecret = process.env.CRON_SECRET ?? ''
  const auth = request.headers.get('authorization') ?? ''
  const admin = request.headers.get('x-admin-secret') ?? ''
  const okCron = !!cronSecret && auth === `Bearer ${cronSecret}`
  const okAdmin = !!adminSecret && admin === adminSecret
  if (!okCron && !okAdmin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!adminSecret) {
    return NextResponse.json(
      { error: 'ADMIN_SECRET no está configurado para las llamadas internas' },
      { status: 503 }
    )
  }
  const base = internalBaseUrl()
  if (!base) {
    return NextResponse.json(
      { error: 'VERCEL_URL no está configurado o no es válido' },
      { status: 503 }
    )
  }
  const year = validYear(new URL(request.url).searchParams.get('year'))
  if (year == null) {
    return NextResponse.json({ error: 'year inválido' }, { status: 400 })
  }
  const h = { 'x-admin-secret': adminSecret }

  const out: Record<string, unknown> = { year }
  try {
    // 1. resync fill (rellena celdas vacías desde el CRM)
    out.resync = await fetchJson(
      `${base}/api/admin/resync-costobeneficio?year=${year}`,
      { method: 'POST', headers: h }
    )
    // 2. check (reporta faltantes CB + Control Facturas)
    const check = await fetchJson(
      `${base}/api/admin/check-facturas?year=${year}`,
      { headers: h }
    )
    if (
      !check ||
      typeof check !== 'object' ||
      typeof (check as { ok?: unknown }).ok !== 'boolean'
    ) {
      throw new Error('/api/admin/check-facturas: respuesta inválida')
    }
    out.ok = (check as { ok: boolean }).ok
    out.check = check
    if (out.ok === false)
      console.warn(
        '[cron/costobeneficio] inconsistencias:',
        JSON.stringify(check)
      )
  } catch (err) {
    out.error = (err as Error).message
    return NextResponse.json(out, { status: 500 })
  }
  return NextResponse.json(out, { status: out.ok === false ? 409 : 200 })
}
