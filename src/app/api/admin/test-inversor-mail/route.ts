/**
 * POST /api/admin/test-inversor-mail?to=direccion@ejemplo.com
 *
 * Prueba el circuito SMTP del aviso a inversores enviando un email de ejemplo
 * (mismo template que el aviso real) a la dirección indicada. No toca la tabla
 * de dedup ni ningún vehículo. Protegido por X-Admin-Secret.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/mailer'
import { buildInversorEmail } from '@/lib/inversorNotify'
import { AdminParamError, assertKnownParams } from '@/lib/adminParams'

export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET ?? process.env.N8N_INVOICE_WEBHOOK_SECRET ?? ''
  if (!secret || (request.headers.get('x-admin-secret') ?? '') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let to: string
  try {
    const sp = request.nextUrl.searchParams
    assertKnownParams(sp, ['to'])
    to = (sp.get('to') ?? '').trim()
  } catch (err) {
    if (err instanceof AdminParamError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
  if (!to || !to.includes('@')) {
    return NextResponse.json({ error: 'parámetro to requerido (email)' }, { status: 400 })
  }

  const mail = buildInversorEmail({
    inversorNombre: 'Inversor de prueba',
    marca: 'Mazda',
    modelo: '6',
    matricula: '0000XXX',
    referencia: 'I-#0000',
    evento: 'vendido',
    fecha: new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }),
  })
  const r = await sendMail({ to, ...mail, subject: `[PRUEBA] ${mail.subject}` })
  return NextResponse.json(r, { status: r.sent ? 200 : 502 })
}
