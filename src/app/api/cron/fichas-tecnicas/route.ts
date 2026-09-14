/**
 * GET|POST /api/cron/fichas-tecnicas — chequeo diario de los coches publicados
 * contra su ficha técnica (tarjeta ITV). Vercel Cron, 06:30 UTC: el script que
 * lee las carpetas de OneDrive corre a las 06:00 y deja las extracciones en
 * fichas_tecnicas (POST /api/fichas-tecnicas/snapshot).
 *
 * Por cada vehículo PUBLICADO con ficha extraída:
 *   1. compara contra el CRM (matrícula, bastidor, color, fecha, marca, modelo)
 *      y contra la ficha pública de WordPress (combustible, cilindrada, CV,
 *      plazas, cambio),
 *   2. aplica solo lo que decidir() autoriza —color y fecha con confianza alta y
 *      sin conflicto real— dejando fila en fichas_tecnicas_correcciones,
 *   3. encola todo lo demás en la bandeja /revision (origen 'ficha_tecnica'),
 *   4. manda un correo-resumen con lo corregido y lo que hay que mirar a mano.
 *
 * Los coches publicados SIN ficha en la carpeta generan un único ítem cada uno:
 * sin tarjeta no hay nada contra lo que cruzar, y eso también es un problema.
 *
 * Auth: Vercel inyecta `Authorization: Bearer $CRON_SECRET`; también acepta
 * X-Admin-Secret para dispararlo a mano (mismo patrón que cron/alertas).
 *
 * REQUIERE aplicar antes create-fichas-tecnicas.sql y
 * add-revision-items-origen-ficha-tecnica.sql.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'
import { sendMail } from '@/lib/mailer'
import { baseUrl, formatearFecha } from '@/lib/alertas'
import { destinatarioAlertas, escapeHtml, notificarFalloCron } from '@/lib/cronNotify'
import { normalizarEstado } from '@/lib/vehiculoEstado'
import { fetchFichaWeb } from '@/lib/webSync'
import {
  COLUMNA_CRM,
  compararConCrm,
  compararConWeb,
  decidir,
  dedupKeyFicha,
  dedupKeySinFicha,
  type CampoCrm,
  type CamposFicha,
  type Discrepancia,
  type FichaWeb,
  type VehiculoCrm,
} from '@/lib/fichaTecnica'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** Presupuesto para consultar WordPress: el resto de la función tiene que caber
 *  en maxDuration aunque la web esté colgada y cada lectura agote sus 6 s. */
const PRESUPUESTO_WEB_MS = 30_000
const LOTE_WEB = 6

interface FilaFicha {
  id: number
  vehiculo_id: number
  hash: string
  carpeta: string | null
  archivo: string | null
  campos: CamposFicha
  extraido_at: string | null
}

interface Caso {
  vehiculo: VehiculoCrm
  ficha: FilaFicha
  web: FichaWeb | null
  discrepancias: Discrepancia[]
}

interface Correccion {
  vehiculo: VehiculoCrm
  d: Discrepancia
  ficha: FilaFicha
}

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

/** Mismo filtro que el feed público: estado crudo + normalización canónica. */
async function vehiculosPublicados(): Promise<VehiculoCrm[]> {
  const r = await pool.query<VehiculoCrm & { estado: string | null }>(
    `SELECT v.id, v.referencia, v.marca, v.modelo, v.matricula, v.bastidor,
            v.color, v."fechaMatriculacion", v.estado
       FROM "Vehiculo" v
      WHERE UPPER(TRIM(COALESCE(v.estado, ''))) = 'PUBLICADO'
      ORDER BY v.id`
  )
  return r.rows.filter((v) => normalizarEstado(v.estado) === 'PUBLICADO')
}

/** La ficha más reciente de cada coche (una foto nueva sustituye a la vieja). */
async function fichasDe(ids: number[]): Promise<Map<number, FilaFicha>> {
  const out = new Map<number, FilaFicha>()
  if (ids.length === 0) return out
  const r = await pool.query<FilaFicha>(
    `SELECT DISTINCT ON (vehiculo_id)
            id, vehiculo_id, hash, carpeta, archivo, campos, extraido_at
       FROM fichas_tecnicas
      WHERE vehiculo_id = ANY($1::int[])
      ORDER BY vehiculo_id, extraido_at DESC NULLS LAST, recibido_at DESC, id DESC`,
    [ids]
  )
  for (const f of r.rows) out.set(f.vehiculo_id, f)
  return out
}

function coche(v: VehiculoCrm): string {
  return (
    [v.marca, v.modelo].filter(Boolean).join(' ').trim() || `vehículo ${v.id}`
  ) + (v.matricula ? ` (${v.matricula})` : '')
}

function valorMostrable(s: string | null): string {
  return s && s.trim() ? s.trim() : '(vacío)'
}

function motivoDe(d: Discrepancia): string {
  const donde = d.fuente === 'crm' ? 'el CRM' : 'la web'
  if (d.tipo === 'vacio') {
    return `${d.etiqueta}: ${donde} no lo tiene y la ficha técnica dice "${d.valorFicha}" (confianza ${d.confianza}).`
  }
  if (d.tipo === 'formato') {
    return `${d.etiqueta}: mismo dato con otro formato — ${donde} "${d.valorActual}" vs ficha "${d.valorFicha}".`
  }
  return `${d.etiqueta}: ${donde} dice "${valorMostrable(d.valorActual)}" y la ficha técnica "${d.valorFicha}" (confianza ${d.confianza}).`
}

/** Enlace al editor de la entrada en WordPress, derivado de la url pública. */
function urlEditorWeb(web: FichaWeb | null): string | null {
  if (!web?.url || !web.id) return null
  try {
    return `${new URL(web.url).origin}/wp-admin/post.php?post=${web.id}&action=edit`
  } catch {
    return null
  }
}

async function enLotes<T, R>(
  items: T[],
  tam: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += tam) {
    out.push(...(await Promise.all(items.slice(i, i + tam).map(fn))))
  }
  return out
}

/**
 * Encola en revision_items con ON CONFLICT DO NOTHING sobre dedup_key. Un único
 * INSERT para no pedir más de una conexión (patrón de lib/alertas).
 */
async function sincronizarBandeja(
  filas: { titulo: string; dedup_key: string; payload: Record<string, unknown> }[]
): Promise<{ nuevos: number; existentes: number }> {
  const porClave = new Map<string, (typeof filas)[number]>()
  for (const f of filas) if (!porClave.has(f.dedup_key)) porClave.set(f.dedup_key, f)
  if (porClave.size === 0) return { nuevos: 0, existentes: 0 }

  const ins = await pool.query<{ dedup_key: string }>(
    `INSERT INTO revision_items (origen, titulo, payload, dedup_key)
     SELECT 'ficha_tecnica', x.titulo, x.payload, x.dedup_key
       FROM jsonb_to_recordset($1::jsonb) AS x(titulo text, payload jsonb, dedup_key text)
     ON CONFLICT (dedup_key) DO NOTHING
     RETURNING dedup_key`,
    [JSON.stringify([...porClave.values()])]
  )
  return { nuevos: ins.rows.length, existentes: porClave.size - ins.rows.length }
}

/** Correo-resumen. Solo se manda si hay algo que contar. */
function renderDigestFichas(
  corregidas: Correccion[],
  revisionCrm: { vehiculo: VehiculoCrm; d: Discrepancia }[],
  revisionWeb: { vehiculo: VehiculoCrm; d: Discrepancia; web: FichaWeb | null }[],
  sinFicha: VehiculoCrm[],
  hoy: Date = new Date()
): { subject: string; html: string; text: string } {
  const base = baseUrl()
  const fecha = formatearFecha(hoy)
  const aRevisar = revisionCrm.length + revisionWeb.length
  const subject = `Fichas técnicas ${fecha}: ${corregidas.length} corregido${corregidas.length === 1 ? '' : 's'}, ${aRevisar} a revisar`

  const secciones: { h: string; html: string; text: string }[] = []

  if (corregidas.length) {
    const lis = corregidas
      .map(
        (c) =>
          `<li style="margin:0 0 6px"><strong>${escapeHtml(c.d.etiqueta)}</strong>: ${escapeHtml(valorMostrable(c.d.valorActual))} → ${escapeHtml(c.d.valorFicha)} · <a href="${base}/vehiculos/${c.vehiculo.id}" style="color:#1d4ed8">${escapeHtml(coche(c.vehiculo))}</a></li>`
      )
      .join('')
    const txt = corregidas
      .map(
        (c) =>
          `  - ${c.d.etiqueta}: ${valorMostrable(c.d.valorActual)} -> ${c.d.valorFicha} · ${coche(c.vehiculo)}\n    ${base}/vehiculos/${c.vehiculo.id}`
      )
      .join('\n')
    secciones.push({
      h: `Corregido automáticamente (${corregidas.length})`,
      html: `<ul style="padding-left:18px;margin:0">${lis}</ul>`,
      text: txt,
    })
  }

  if (revisionCrm.length) {
    const lis = revisionCrm
      .map(
        (r) =>
          `<li style="margin:0 0 8px"><a href="${base}/vehiculos/${r.vehiculo.id}" style="color:#1d4ed8">${escapeHtml(coche(r.vehiculo))}</a><br><span style="color:#475569;font-size:13px">${escapeHtml(motivoDe(r.d))}</span></li>`
      )
      .join('')
    const txt = revisionCrm
      .map((r) => `  - ${coche(r.vehiculo)}\n    ${motivoDe(r.d)}\n    ${base}/vehiculos/${r.vehiculo.id}`)
      .join('\n')
    secciones.push({
      h: `Necesita tu revisión — CRM (${revisionCrm.length})`,
      html: `<ul style="padding-left:18px;margin:0">${lis}</ul>`,
      text: txt,
    })
  }

  if (revisionWeb.length) {
    const lis = revisionWeb
      .map((r) => {
        const editor = urlEditorWeb(r.web)
        const enlaces = [
          r.web?.url ? `<a href="${r.web.url}" style="color:#1d4ed8">ficha web</a>` : '',
          editor ? `<a href="${editor}" style="color:#1d4ed8">editar en WordPress</a>` : '',
        ]
          .filter(Boolean)
          .join(' · ')
        return `<li style="margin:0 0 8px"><strong>${escapeHtml(coche(r.vehiculo))}</strong><br><span style="color:#475569;font-size:13px">${escapeHtml(motivoDe(r.d))}</span>${enlaces ? `<br>${enlaces}` : ''}</li>`
      })
      .join('')
    const txt = revisionWeb
      .map((r) => {
        const editor = urlEditorWeb(r.web)
        const enlaces = [r.web?.url, editor].filter(Boolean).join('\n    ')
        return `  - ${coche(r.vehiculo)}\n    ${motivoDe(r.d)}${enlaces ? `\n    ${enlaces}` : ''}`
      })
      .join('\n')
    secciones.push({
      h: `Necesita tu revisión — WordPress (${revisionWeb.length})`,
      html: `<ul style="padding-left:18px;margin:0">${lis}</ul>`,
      text: txt,
    })
  }

  if (sinFicha.length) {
    const lis = sinFicha
      .map(
        (v) =>
          `<li style="margin:0 0 6px"><a href="${base}/vehiculos/${v.id}" style="color:#1d4ed8">${escapeHtml(coche(v))}</a>${v.referencia ? ` · carpeta ${escapeHtml(String(v.referencia))}` : ''}</li>`
      )
      .join('')
    const txt = sinFicha
      .map((v) => `  - ${coche(v)}${v.referencia ? ` · carpeta ${v.referencia}` : ''}\n    ${base}/vehiculos/${v.id}`)
      .join('\n')
    secciones.push({
      h: `Sin ficha técnica en la carpeta (${sinFicha.length})`,
      html: `<ul style="padding-left:18px;margin:0">${lis}</ul>`,
      text: txt,
    })
  }

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#0f172a;max-width:720px">
<h2 style="margin:0 0 4px;font-size:18px">Fichas técnicas · ${fecha}</h2>
<p style="margin:0 0 12px;color:#475569">Cruce diario de los coches publicados con su tarjeta ITV. Lo pendiente está también en la <a href="${base}/revision" style="color:#1d4ed8">bandeja de revisión</a>.</p>
${secciones.map((s) => `<h3 style="margin:20px 0 8px;font-size:15px">${escapeHtml(s.h)}</h3>${s.html}`).join('')}
<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">Aviso automático diario del CRM SevenCars.</p>
</div>`

  const text = `Fichas técnicas · ${fecha}\nCruce diario de los coches publicados con su tarjeta ITV. Bandeja: ${base}/revision\n\n${secciones.map((s) => `${s.h}\n${s.text}`).join('\n\n')}\n`

  return { subject, html, text }
}

async function handler(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const hoy = new Date()
  const errores: { tipo: string; error: string }[] = []
  const out = {
    ok: true,
    fecha: formatearFecha(hoy),
    publicados: 0,
    conFicha: 0,
    sinFicha: 0,
    corregidos: 0,
    revisionCrm: 0,
    revisionWeb: 0,
    webConsultadas: 0,
    webOmitidas: 0,
    bandeja: { nuevos: 0, existentes: 0 },
    email: 'omitido' as 'enviado' | 'omitido' | 'error',
    emailMotivo: undefined as string | undefined,
    errores,
  }

  let vehiculos: VehiculoCrm[] = []
  let fichas = new Map<number, FilaFicha>()
  try {
    vehiculos = await vehiculosPublicados()
    fichas = await fichasDe(vehiculos.map((v) => v.id))
  } catch (err) {
    out.ok = false
    errores.push({ tipo: 'lectura', error: (err as Error).message ?? String(err) })
    await notificarFalloCron('fichas-tecnicas', { fecha: out.fecha, errores })
    return NextResponse.json(out, { status: 500 })
  }
  out.publicados = vehiculos.length

  const sinFicha = vehiculos.filter((v) => !fichas.has(v.id))
  const conFicha = vehiculos.filter((v) => fichas.has(v.id))
  out.sinFicha = sinFicha.length
  out.conFicha = conFicha.length

  // 1. Comparación contra el CRM (sin red) y lectura de la web en lotes, con
  //    presupuesto de tiempo: la web es best-effort, el cruce con el CRM no.
  const inicioWeb = Date.now()
  const casos = await enLotes(conFicha, LOTE_WEB, async (v): Promise<Caso> => {
    const ficha = fichas.get(v.id)!
    const campos = (ficha.campos ?? {}) as CamposFicha
    const dCrm = compararConCrm(v, campos)

    let web: FichaWeb | null = null
    if (Date.now() - inicioWeb < PRESUPUESTO_WEB_MS) {
      web = await fetchFichaWeb(String(v.matricula ?? ''))
      if (web) out.webConsultadas++
    } else {
      out.webOmitidas++
    }
    const dWeb = compararConWeb(web, campos)
    return { vehiculo: v, ficha, web, discrepancias: [...dCrm, ...dWeb] }
  })

  // 2. Reparto entre lo que se arregla solo y lo que mira una persona.
  const corregidas: Correccion[] = []
  const revisionCrm: { vehiculo: VehiculoCrm; d: Discrepancia }[] = []
  const revisionWeb: { vehiculo: VehiculoCrm; d: Discrepancia; web: FichaWeb | null }[] = []
  for (const c of casos) {
    for (const d of c.discrepancias) {
      if (decidir(d) === 'corregir') {
        corregidas.push({ vehiculo: c.vehiculo, d, ficha: c.ficha })
      } else if (d.fuente === 'web') {
        revisionWeb.push({ vehiculo: c.vehiculo, d, web: c.web })
      } else {
        revisionCrm.push({ vehiculo: c.vehiculo, d })
      }
    }
  }

  // 3. Correcciones: UPDATE del campo + fila de auditoría (permite deshacerlas).
  const aplicadas: Correccion[] = []
  for (const c of corregidas) {
    const columna = COLUMNA_CRM[c.d.campo as CampoCrm]
    if (!columna) continue // nunca debería pasar: decidir() ya filtró el campo
    try {
      await pool.query(
        `UPDATE "Vehiculo" SET "${columna}" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [c.d.valorFicha, c.vehiculo.id]
      )
      await pool.query(
        `INSERT INTO fichas_tecnicas_correcciones
           (vehiculo_id, campo, valor_anterior, valor_nuevo, confianza, ficha_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [c.vehiculo.id, columna, c.d.valorActual, c.d.valorFicha, c.d.confianza, c.ficha.id]
      )
      aplicadas.push(c)
    } catch (err) {
      errores.push({
        tipo: `correccion:${c.vehiculo.id}:${c.d.campo}`,
        error: (err as Error).message ?? String(err),
      })
      // Si no se pudo escribir, que al menos se avise.
      revisionCrm.push({ vehiculo: c.vehiculo, d: c.d })
    }
  }
  out.corregidos = aplicadas.length
  out.revisionCrm = revisionCrm.length
  out.revisionWeb = revisionWeb.length

  // 4. Bandeja de revisión.
  const filas = [
    ...[...revisionCrm, ...revisionWeb.map((r) => ({ vehiculo: r.vehiculo, d: r.d }))].map(
      ({ vehiculo, d }) => {
        const ficha = fichas.get(vehiculo.id)
        return {
          titulo: `${coche(vehiculo)} · ${d.etiqueta}`,
          dedup_key: dedupKeyFicha(vehiculo.id, d.campo, ficha?.hash ?? 'sin-hash'),
          payload: {
            vehiculoId: vehiculo.id,
            fuente: d.fuente,
            campo: d.campo,
            tipo: d.tipo,
            valorActual: d.valorActual,
            valorFicha: d.valorFicha,
            valorFichaCrudo: d.valorFichaCrudo,
            confianza: d.confianza,
            carpeta: ficha?.carpeta ?? null,
            archivo: ficha?.archivo ?? null,
            url: `/vehiculos/${vehiculo.id}`,
            motivo: motivoDe(d),
          },
        }
      }
    ),
    ...sinFicha.map((v) => ({
      titulo: `Sin ficha técnica: ${coche(v)}`,
      dedup_key: dedupKeySinFicha(v.id),
      payload: {
        vehiculoId: v.id,
        referencia: v.referencia ?? null,
        url: `/vehiculos/${v.id}`,
        motivo:
          'Coche publicado sin ficha técnica extraída de su carpeta de OneDrive: no hay nada contra lo que cruzar sus datos.',
      },
    })),
  ]
  try {
    out.bandeja = await sincronizarBandeja(filas)
  } catch (err) {
    errores.push({ tipo: 'bandeja', error: (err as Error).message ?? String(err) })
  }

  // 5. Correo-resumen, solo si hay algo que contar.
  if (aplicadas.length || revisionCrm.length || revisionWeb.length || sinFicha.length) {
    const digest = renderDigestFichas(aplicadas, revisionCrm, revisionWeb, sinFicha, hoy)
    const r = await sendMail({ to: destinatarioAlertas(), ...digest })
    if (r.sent) out.email = 'enviado'
    else if (r.reason === 'SMTP_PASS no configurada') {
      out.email = 'omitido'
      out.emailMotivo = r.reason
    } else {
      out.email = 'error'
      out.emailMotivo = r.reason
      console.error('[cron/fichas-tecnicas] email no enviado:', r.reason)
    }
  }

  if (errores.length > 0) {
    out.ok = false
    console.warn('[cron/fichas-tecnicas] errores:', JSON.stringify(errores))
    await notificarFalloCron('fichas-tecnicas', { fecha: out.fecha, errores })
  }

  return NextResponse.json(out)
}

export const GET = handler
export const POST = handler
