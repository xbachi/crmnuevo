/**
 * GET|POST /api/cron/alertas — disparado por Vercel Cron (diario, 07:00 UTC).
 *
 * Detecta las alertas operativas (lib/alertas), las encola en la bandeja
 * /revision (origen 'alertas', dedup por tipo+ref) y manda el digest diario a
 * ALERTAS_EMAIL_TO (hola@sevencars.es por defecto). Un detector que falla no
 * tumba a los demás: sus errores vuelven en `errores` y disparan el aviso de
 * fallo de cron (lib/cronNotify).
 *
 * Auth: Vercel inyecta `Authorization: Bearer $CRON_SECRET`; también acepta
 * X-Admin-Secret para dispararlo a mano (mismo patrón que cron/costobeneficio).
 */

import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/secrets'
import { sendMail } from '@/lib/mailer'
import {
  contarPorTipo,
  detectarAlertasConErrores,
  formatearFecha,
  renderDigest,
  sincronizarBandeja,
  type ErrorDetector,
} from '@/lib/alertas'
import { destinatarioAlertas, notificarFalloCron } from '@/lib/cronNotify'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

function autorizado(request: NextRequest): boolean {
  const adminSecret =
    process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  const cronSecret = process.env.CRON_SECRET ?? ''
  const auth = request.headers.get('authorization') ?? ''
  const admin = request.headers.get('x-admin-secret') ?? ''
  const okCron = !!cronSecret && safeEqual(auth, `Bearer ${cronSecret}`)
  const okAdmin = !!adminSecret && safeEqual(admin, adminSecret)
  return okCron || okAdmin
}

async function handler(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const hoy = new Date()
  const { alertas, errores } = await detectarAlertasConErrores(hoy)

  const out: {
    ok: boolean
    fecha: string
    total: number
    porTipo: Record<string, number>
    bandeja: { nuevos: number; existentes: number }
    email: 'enviado' | 'omitido' | 'error'
    emailMotivo?: string
    errores: ErrorDetector[]
  } = {
    ok: true,
    fecha: formatearFecha(hoy),
    total: alertas.length,
    porTipo: contarPorTipo(alertas) as Record<string, number>,
    bandeja: { nuevos: 0, existentes: 0 },
    email: 'omitido',
    errores,
  }

  try {
    out.bandeja = await sincronizarBandeja(alertas)
  } catch (err) {
    errores.push({
      tipo: 'bandeja',
      error: (err as Error).message ?? String(err),
    })
  }

  if (alertas.length > 0) {
    const digest = renderDigest(alertas, hoy)
    const r = await sendMail({ to: destinatarioAlertas(), ...digest })
    if (r.sent) out.email = 'enviado'
    else if (r.reason === 'SMTP_PASS no configurada') {
      out.email = 'omitido'
      out.emailMotivo = r.reason
    } else {
      out.email = 'error'
      out.emailMotivo = r.reason
      console.error('[cron/alertas] email no enviado:', r.reason)
    }
  }

  if (errores.length > 0) {
    out.ok = false
    console.warn('[cron/alertas] errores:', JSON.stringify(errores))
    await notificarFalloCron('alertas', { fecha: out.fecha, errores })
  }

  return NextResponse.json(out)
}

export const GET = handler
export const POST = handler
