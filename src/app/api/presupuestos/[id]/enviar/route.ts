/**
 * POST /api/presupuestos/[id]/enviar — body { canal: 'whatsapp' | 'email' }.
 * WhatsApp: devuelve el enlace wa.me con el texto (el navegador lo abre).
 * Email: adjunta el PDF (lo genera y sube si no existe) y lo manda por SMTP.
 * En ambos casos borrador → enviado y enviado_at = ahora.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/apiAuth'
import { sendMail } from '@/lib/mailer'
import {
  describirVehiculo,
  EMPRESA_POR_DEFECTO,
  enlaceWhatsApp,
  formatearFecha,
  renderPlantilla,
} from '@/lib/plantillasMensajes'
import { urlPublicaPresupuesto } from '@/lib/presupuesto/enlaces'
import {
  actualizarPresupuesto,
  leerPresupuesto,
  type PresupuestoRow,
} from '@/lib/presupuesto/repo'
import {
  cargarVehiculoPresupuesto,
  obtenerPdf,
} from '@/lib/presupuesto/servicio'
import { BlobNoConfiguradoError } from '@/lib/presupuesto/storage'

const CANALES = ['whatsapp', 'email'] as const
type Canal = (typeof CANALES)[number]

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function marcarEnviado(p: PresupuestoRow) {
  await actualizarPresupuesto(p.id, {
    estado: p.estado === 'borrador' ? 'enviado' : p.estado,
    enviado_at: new Date().toISOString(),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  let canal: Canal
  try {
    const body = (await request.json()) ?? {}
    if (!(CANALES as readonly string[]).includes(String(body.canal))) {
      return NextResponse.json(
        { error: `canal: debe ser ${CANALES.join('|')}` },
        { status: 400 }
      )
    }
    canal = body.canal as Canal
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  try {
    const p = await leerPresupuesto(id)
    if (!p) {
      return NextResponse.json(
        { error: 'Presupuesto no encontrado' },
        { status: 404 }
      )
    }
    if (p.estado === 'anulado') {
      return NextResponse.json(
        { error: 'Presupuesto anulado: no se puede enviar' },
        { status: 409 }
      )
    }
    const v = await cargarVehiculoPresupuesto(p.vehiculo_id)
    const urlPublica = urlPublicaPresupuesto(p.token_publico)
    const { asunto, texto, html } = renderPlantilla('presupuesto', {
      nombreCliente: p.nombre_cliente,
      vehiculo: describirVehiculo(v ?? undefined),
      empresa: EMPRESA_POR_DEFECTO,
      enlacePresupuesto: urlPublica,
      validoHasta: formatearFecha(p.valido_hasta) ?? p.valido_hasta,
    })

    if (canal === 'whatsapp') {
      const enlace = enlaceWhatsApp(p.telefono, texto)
      if (!enlace) {
        return NextResponse.json(
          { error: 'El presupuesto no tiene un teléfono válido' },
          { status: 400 }
        )
      }
      await marcarEnviado(p)
      return NextResponse.json({ canal, enlace, texto })
    }

    if (!p.email) {
      return NextResponse.json(
        { error: 'El presupuesto no tiene email' },
        { status: 400 }
      )
    }
    const pdf = await obtenerPdf(p)
    const r = await sendMail({
      to: p.email,
      subject: asunto,
      html,
      text: texto,
      attachments: [
        {
          filename: pdf.nombreArchivo,
          content: Buffer.from(pdf.bytes),
          contentType: 'application/pdf',
        },
      ],
    })
    if (!r.sent) {
      return NextResponse.json(
        { error: `No se pudo enviar el email: ${r.reason ?? 'desconocido'}` },
        { status: 502 }
      )
    }
    await marcarEnviado(p)
    return NextResponse.json({ canal, enviado: true })
  } catch (e) {
    if (e instanceof BlobNoConfiguradoError) {
      return NextResponse.json({ error: e.message }, { status: 503 })
    }
    console.error('[presupuestos enviar]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
