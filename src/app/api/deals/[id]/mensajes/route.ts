/**
 * GET/POST /api/deals/[id]/mensajes
 *
 * Mensajes al cliente final desde la ficha del deal. Email: se envía por
 * SMTP (sendMail) y se registra. WhatsApp: no hay API, el navegador abre
 * wa.me y aquí solo queda el registro. Historial en deal_mensajes
 * (create-deal-mensajes.sql; sin la tabla → 503).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool, getDealById } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import { sendMail } from '@/lib/mailer'
import {
  ctxDesdeDeal,
  esPlantillaId,
  normalizarTelefono,
  PLANTILLAS,
  renderPlantilla,
  textoAHtml,
  type PlantillaId,
} from '@/lib/plantillasMensajes'

const HINT_TABLA =
  'La tabla deal_mensajes no existe todavía — aplicar create-deal-mensajes.sql'

const CANALES = ['email', 'whatsapp'] as const
type Canal = (typeof CANALES)[number]

const COLUMNAS =
  'id, deal_id, plantilla, canal, destinatario, asunto, cuerpo, enviado_por, created_at'

async function tablaExiste(): Promise<boolean> {
  const reg = await pool.query<{ reg: string | null }>(
    `SELECT to_regclass('public.deal_mensajes') AS reg`
  )
  return Boolean(reg.rows[0]?.reg)
}

function parseDealId(id: string): number | null {
  const dealId = parseInt(id, 10)
  return Number.isNaN(dealId) || dealId <= 0 ? null : dealId
}

/** Nombre visible de quien envía; best-effort, nunca bloquea el envío. */
async function nombreUsuario(uid: number): Promise<string> {
  try {
    const r = await pool.query<{
      display_name: string | null
      email: string | null
    }>(`SELECT display_name, email FROM users WHERE id = $1`, [uid])
    return r.rows[0]?.display_name || r.rows[0]?.email || `uid:${uid}`
  } catch {
    return `uid:${uid}`
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const dealId = parseDealId((await params).id)
  if (dealId === null) {
    return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 })
  }

  try {
    if (!(await tablaExiste())) {
      return NextResponse.json({ error: HINT_TABLA }, { status: 503 })
    }
    const res = await pool.query(
      `SELECT ${COLUMNAS} FROM deal_mensajes
        WHERE deal_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 100`,
      [dealId]
    )
    return NextResponse.json({ mensajes: res.rows })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/**
 * Body: { plantillaId?, canal: 'email' | 'whatsapp', asunto?, texto? }
 * Sin texto explícito la plantilla tiene que aplicar al estado del deal.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const dealId = parseDealId((await params).id)
  if (dealId === null) {
    return NextResponse.json({ error: 'ID de deal inválido' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const canal = body.canal as Canal
  if (!CANALES.includes(canal)) {
    return NextResponse.json(
      { error: 'canal debe ser email o whatsapp' },
      { status: 400 }
    )
  }

  const plantillaId: PlantillaId | null =
    body.plantillaId == null ? null : (body.plantillaId as PlantillaId)
  if (plantillaId !== null && !esPlantillaId(plantillaId)) {
    return NextResponse.json(
      { error: 'Plantilla desconocida' },
      { status: 400 }
    )
  }
  const textoLibre = typeof body.texto === 'string' ? body.texto.trim() : ''
  if (!plantillaId && !textoLibre) {
    return NextResponse.json(
      { error: 'Indica una plantilla o un texto' },
      { status: 400 }
    )
  }

  try {
    const deal = await getDealById(dealId)
    if (!deal) {
      return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })
    }

    const ctx = ctxDesdeDeal(deal)
    let asunto =
      typeof body.asunto === 'string' && body.asunto.trim()
        ? body.asunto.trim()
        : ''
    let texto = textoLibre
    if (plantillaId) {
      const plantilla = PLANTILLAS[plantillaId]
      if (!textoLibre && !plantilla.cuandoAplica(deal)) {
        return NextResponse.json(
          {
            error: `La plantilla "${plantilla.titulo}" no aplica al estado actual del deal`,
          },
          { status: 400 }
        )
      }
      const r = renderPlantilla(plantillaId, ctx)
      if (!texto) texto = r.texto
      if (!asunto) asunto = r.asunto
    }
    if (!asunto) asunto = `Sobre tu ${ctx.vehiculo} — ${ctx.empresa}`

    let destinatario: string
    if (canal === 'email') {
      const email = deal.cliente?.email?.trim()
      if (!email) {
        return NextResponse.json(
          { error: 'El cliente no tiene email' },
          { status: 400 }
        )
      }
      destinatario = email
    } else {
      const tel = normalizarTelefono(deal.cliente?.telefono)
      if (!tel) {
        return NextResponse.json(
          { error: 'El cliente no tiene un teléfono válido' },
          { status: 400 }
        )
      }
      destinatario = `+${tel}`
    }

    if (!(await tablaExiste())) {
      return NextResponse.json({ error: HINT_TABLA }, { status: 503 })
    }

    if (canal === 'email') {
      const r = await sendMail({
        to: destinatario,
        subject: asunto,
        html: textoAHtml(texto),
        text: texto,
      })
      if (!r.sent) {
        return NextResponse.json(
          { error: `No se pudo enviar el email: ${r.reason ?? 'error SMTP'}` },
          { status: 502 }
        )
      }
    }

    const enviadoPor = await nombreUsuario(auth.session.uid)
    try {
      const ins = await pool.query(
        `INSERT INTO deal_mensajes
           (deal_id, plantilla, canal, destinatario, asunto, cuerpo, enviado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${COLUMNAS}`,
        [
          dealId,
          plantillaId ?? 'libre',
          canal,
          destinatario,
          asunto,
          texto,
          enviadoPor,
        ]
      )
      return NextResponse.json(
        { ok: true, mensaje: ins.rows[0] },
        { status: 201 }
      )
    } catch (err) {
      // El email ya salió: no devolver error, pero avisar de que no quedó registro.
      console.error('[deal_mensajes] no se pudo registrar:', err)
      return NextResponse.json(
        {
          ok: true,
          mensaje: null,
          aviso: 'Mensaje enviado, pero no se pudo guardar en el historial',
        },
        { status: 201 }
      )
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
