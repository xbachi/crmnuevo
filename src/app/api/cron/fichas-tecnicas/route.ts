/**
 * GET|POST /api/cron/fichas-tecnicas — cruce diario del stock con su permiso de
 * circulación / tarjeta ITV. Corre a las 06:45 desde el crontab del servidor de
 * OneDrive: el script que lee las carpetas corre a las 06:00 y deja las
 * extracciones en
 * fichas_tecnicas (POST /api/fichas-tecnicas/snapshot).
 *
 * Por cada vehículo con ficha extraída (TODO el stock, no sólo lo publicado):
 *   1. compara contra el CRM (matrícula, bastidor, color, fecha, marca, modelo)
 *      y contra su ficha comercial (combustible, cilindrada, potencia, plazas,
 *      versión); si además está PUBLICADO, también contra WordPress,
 *   2. RELLENA los campos que el CRM tiene vacíos con confianza >= 0,80,
 *      dejando fila en fichas_tecnicas_correcciones (para deshacer) y en
 *      vehiculo_campos_doc (pendiente de que una persona lo confirme: hasta
 *      entonces el coche no se puede publicar),
 *   3. encola lo que NO se puede arreglar solo en la bandeja /revision — sólo
 *      de los coches publicados, para no llenarla con stock en preparación,
 *   4. manda un correo-resumen con lo rellenado, lo corregido y lo pendiente.
 *
 * POR QUÉ todo el stock y no sólo lo publicado: publicar exige tener los campos
 * del permiso, y el permiso lo lee este cron. Mirando sólo los publicados, un
 * coche nuevo no llegaría nunca a publicarse.
 *
 * Los coches publicados SIN ficha en la carpeta generan un único ítem cada uno:
 * sin tarjeta no hay nada contra lo que cruzar, y eso también es un problema.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`; también acepta X-Admin-Secret
 * para dispararlo a mano (mismo patrón que cron/alertas). Lo dispara el crontab
 * del servidor de OneDrive con /root/crm_cron_llamar.sh a las 06:45, media hora
 * después del escáner; no está en vercel.json.
 *
 * REQUIERE aplicar antes create-fichas-tecnicas.sql,
 * add-revision-items-origen-ficha-tecnica.sql, create-vehiculo-campos-doc.sql y
 * add-vehiculo-ficha-comercial-plazas.sql (sin las dos últimas el cruce con la
 * ficha comercial revienta y el bloqueo de publicación se queda inerte).
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'
import { sendMail } from '@/lib/mailer'
import { baseUrl, formatearFecha } from '@/lib/alertas'
import {
  destinatarioAlertas,
  escapeHtml,
  notificarFalloCron,
} from '@/lib/cronNotify'
import { normalizarEstado } from '@/lib/vehiculoEstado'
import { fetchFichaWeb } from '@/lib/webSync'
import {
  COLUMNA_CRM,
  compararConCrm,
  compararConFichaComercial,
  compararConWeb,
  decidir,
  dedupKeyFicha,
  dedupKeySinFicha,
  type CampoCrm,
  type CamposFicha,
  type Discrepancia,
  type FichaComercialCrm,
  type FichaWeb,
  type VehiculoCrm,
} from '@/lib/fichaTecnica'
import { CAMPOS_DOC_POR_NOMBRE, esCampoDoc } from '@/lib/camposVehiculo'
import {
  registrarCamposDoc,
  type CampoDocEscrito,
} from '@/lib/vehiculoCamposDoc'
import { escribirCamposFicha, type FichaComercial } from '@/lib/fichaComercial'

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
  vehiculo: VehiculoCaso
  ficha: FilaFicha
  web: FichaWeb | null
  discrepancias: Discrepancia[]
}

interface Correccion {
  vehiculo: VehiculoCaso
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

/** Coche del stock + lo que su ficha comercial tiene hoy de estos campos. */
interface VehiculoCaso extends VehiculoCrm {
  estado: string | null
  /** Publicado decide si se consulta la web y si se molesta a la bandeja. */
  publicado: boolean
  fichaComercial: FichaComercialCrm | null
}

/**
 * Todo el stock vivo con su ficha comercial. Los VENDIDOS quedan fuera: sus
 * datos ya no se van a publicar y arreglarlos no le sirve a nadie.
 */
async function vehiculosDelStock(): Promise<VehiculoCaso[]> {
  const r = await pool.query<
    VehiculoCrm & { estado: string | null } & FichaComercialCrm
  >(
    `SELECT v.id, v.referencia, v.marca, v.modelo, v.matricula, v.bastidor,
            v.color, v."fechaMatriculacion", v.estado,
            f.combustible, f.cubicaje, f.motor_kw, f.motor_cv, f.plazas,
            f.nombre_comercial
       FROM "Vehiculo" v
       LEFT JOIN vehiculo_ficha_comercial f ON f.vehiculo_id = v.id
      WHERE UPPER(TRIM(COALESCE(v.estado, ''))) <> 'VENDIDO'
      ORDER BY v.id`
  )
  return r.rows.map((v) => ({
    id: v.id,
    referencia: v.referencia,
    marca: v.marca,
    modelo: v.modelo,
    matricula: v.matricula,
    bastidor: v.bastidor,
    color: v.color,
    fechaMatriculacion: v.fechaMatriculacion,
    estado: v.estado,
    publicado: normalizarEstado(v.estado) === 'PUBLICADO',
    fichaComercial: {
      combustible: v.combustible ?? null,
      cubicaje: v.cubicaje ?? null,
      motor_kw: v.motor_kw ?? null,
      motor_cv: v.motor_cv ?? null,
      plazas: v.plazas ?? null,
      nombre_comercial: v.nombre_comercial ?? null,
    },
  }))
}

/** Cuántos campos del permiso esperan confirmación en todo el stock. */
async function pendientesDeConfirmar(): Promise<number> {
  try {
    const r = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM vehiculo_campos_doc
        WHERE confirmado_at IS NULL`
    )
    return r.rows[0]?.n ?? 0
  } catch {
    return 0
  }
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
    ([v.marca, v.modelo].filter(Boolean).join(' ').trim() ||
      `vehículo ${v.id}`) + (v.matricula ? ` (${v.matricula})` : '')
  )
}

function valorMostrable(s: string | null): string {
  return s && s.trim() ? s.trim() : '(vacío)'
}

function motivoDe(d: Discrepancia): string {
  const donde =
    d.fuente === 'web'
      ? 'la web'
      : d.fuente === 'ficha'
        ? 'la ficha comercial'
        : 'el CRM'
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
  filas: {
    titulo: string
    dedup_key: string
    payload: Record<string, unknown>
  }[]
): Promise<{ nuevos: number; existentes: number }> {
  const porClave = new Map<string, (typeof filas)[number]>()
  for (const f of filas)
    if (!porClave.has(f.dedup_key)) porClave.set(f.dedup_key, f)
  if (porClave.size === 0) return { nuevos: 0, existentes: 0 }

  const ins = await pool.query<{ dedup_key: string }>(
    `INSERT INTO revision_items (origen, titulo, payload, dedup_key)
     SELECT 'ficha_tecnica', x.titulo, x.payload, x.dedup_key
       FROM jsonb_to_recordset($1::jsonb) AS x(titulo text, payload jsonb, dedup_key text)
     ON CONFLICT (dedup_key) DO NOTHING
     RETURNING dedup_key`,
    [JSON.stringify([...porClave.values()])]
  )
  return {
    nuevos: ins.rows.length,
    existentes: porClave.size - ins.rows.length,
  }
}

/** Correo-resumen. Solo se manda si hay algo que contar. */
function renderDigestFichas(
  corregidas: Correccion[],
  revisionCrm: { vehiculo: VehiculoCrm; d: Discrepancia }[],
  revisionWeb: {
    vehiculo: VehiculoCrm
    d: Discrepancia
    web: FichaWeb | null
  }[],
  sinFicha: VehiculoCrm[],
  rellenados: Correccion[] = [],
  porConfirmar = 0,
  hoy: Date = new Date()
): { subject: string; html: string; text: string } {
  const base = baseUrl()
  const fecha = formatearFecha(hoy)
  const aRevisar = revisionCrm.length + revisionWeb.length
  const subject = `Fichas técnicas ${fecha}: ${rellenados.length} campo${rellenados.length === 1 ? '' : 's'} del permiso, ${porConfirmar} por confirmar, ${aRevisar} a revisar`

  const secciones: { h: string; html: string; text: string }[] = []

  if (rellenados.length) {
    const lis = rellenados
      .map(
        (c) =>
          `<li style="margin:0 0 6px"><strong>${escapeHtml(c.d.etiqueta)}</strong>: ${escapeHtml(c.d.valorFicha)} (confianza ${c.d.confianza}) · <a href="${base}/vehiculos/${c.vehiculo.id}" style="color:#1d4ed8">${escapeHtml(coche(c.vehiculo))}</a></li>`
      )
      .join('')
    const txt = rellenados
      .map(
        (c) =>
          `  - ${c.d.etiqueta}: ${c.d.valorFicha} (confianza ${c.d.confianza}) · ${coche(c.vehiculo)}\n    ${base}/vehiculos/${c.vehiculo.id}`
      )
      .join('\n')
    secciones.push({
      h: `Rellenado desde el permiso (${rellenados.length}) — falta confirmarlo`,
      html: `<p style="margin:0 0 8px;color:#475569">Estaban vacíos en el CRM. Hasta que alguien los confirme en la ficha del coche, ese coche no se puede publicar.</p><ul style="padding-left:18px;margin:0">${lis}</ul>`,
      text: `Estaban vacios en el CRM. Hasta confirmarlos, esos coches no se pueden publicar.\n${txt}`,
    })
  }

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
      .map(
        (r) =>
          `  - ${coche(r.vehiculo)}\n    ${motivoDe(r.d)}\n    ${base}/vehiculos/${r.vehiculo.id}`
      )
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
          r.web?.url
            ? `<a href="${r.web.url}" style="color:#1d4ed8">ficha web</a>`
            : '',
          editor
            ? `<a href="${editor}" style="color:#1d4ed8">editar en WordPress</a>`
            : '',
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
      .map(
        (v) =>
          `  - ${coche(v)}${v.referencia ? ` · carpeta ${v.referencia}` : ''}\n    ${base}/vehiculos/${v.id}`
      )
      .join('\n')
    secciones.push({
      h: `Sin ficha técnica en la carpeta (${sinFicha.length})`,
      html: `<ul style="padding-left:18px;margin:0">${lis}</ul>`,
      text: txt,
    })
  }

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#0f172a;max-width:720px">
<h2 style="margin:0 0 4px;font-size:18px">Fichas técnicas · ${fecha}</h2>
<p style="margin:0 0 12px;color:#475569">Cruce diario del stock con su permiso de circulación. Lo pendiente está también en la <a href="${base}/revision" style="color:#1d4ed8">bandeja de revisión</a>.</p>
${secciones.map((s) => `<h3 style="margin:20px 0 8px;font-size:15px">${escapeHtml(s.h)}</h3>${s.html}`).join('')}
${porConfirmar ? `<p style="margin:20px 0 0;color:#475569">En total hay <strong>${porConfirmar}</strong> campo${porConfirmar === 1 ? '' : 's'} del permiso pendiente${porConfirmar === 1 ? '' : 's'} de confirmar en el stock.</p>` : ''}
<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">Aviso automático diario del CRM SevenCars.</p>
</div>`

  const text = `Fichas técnicas · ${fecha}\nCruce diario del stock con su permiso de circulación. Bandeja: ${base}/revision\n\n${secciones.map((s) => `${s.h}\n${s.text}`).join('\n\n')}\n${porConfirmar ? `\nEn total hay ${porConfirmar} campo(s) del permiso pendientes de confirmar en el stock.\n` : ''}`

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
    stock: 0,
    publicados: 0,
    conFicha: 0,
    sinFicha: 0,
    corregidos: 0,
    rellenados: 0,
    porConfirmar: 0,
    revisionCrm: 0,
    revisionWeb: 0,
    webConsultadas: 0,
    webOmitidas: 0,
    bandeja: { nuevos: 0, existentes: 0 },
    email: 'omitido' as 'enviado' | 'omitido' | 'error',
    emailMotivo: undefined as string | undefined,
    errores,
  }

  let vehiculos: VehiculoCaso[] = []
  let fichas = new Map<number, FilaFicha>()
  try {
    vehiculos = await vehiculosDelStock()
    fichas = await fichasDe(vehiculos.map((v) => v.id))
  } catch (err) {
    out.ok = false
    errores.push({
      tipo: 'lectura',
      error: (err as Error).message ?? String(err),
    })
    await notificarFalloCron('fichas-tecnicas', { fecha: out.fecha, errores })
    return NextResponse.json(out, { status: 500 })
  }
  const publicados = vehiculos.filter((v) => v.publicado)
  out.publicados = publicados.length
  out.stock = vehiculos.length

  // Sólo se avisa de la falta de ficha en lo que ya está publicado: un coche en
  // preparación todavía está a tiempo de que aparezca el permiso en su carpeta.
  const sinFicha = publicados.filter((v) => !fichas.has(v.id))
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
    const dFicha = compararConFichaComercial(v.fichaComercial, campos)

    // La web sólo tiene ficha de lo publicado: preguntarle por un coche en
    // preparación es gastar el presupuesto de red en un 404 seguro.
    let web: FichaWeb | null = null
    if (v.publicado) {
      if (Date.now() - inicioWeb < PRESUPUESTO_WEB_MS) {
        web = await fetchFichaWeb(String(v.matricula ?? ''))
        if (web) out.webConsultadas++
      } else {
        out.webOmitidas++
      }
    }
    const dWeb = compararConWeb(web, campos)
    return {
      vehiculo: v,
      ficha,
      web,
      discrepancias: [...dCrm, ...dFicha, ...dWeb],
    }
  })

  // 2. Reparto entre lo que se arregla solo y lo que mira una persona.
  const corregidas: Correccion[] = []
  const revisionCrm: { vehiculo: VehiculoCrm; d: Discrepancia }[] = []
  const revisionWeb: {
    vehiculo: VehiculoCrm
    d: Discrepancia
    web: FichaWeb | null
  }[] = []
  for (const c of casos) {
    for (const d of c.discrepancias) {
      if (decidir(d) === 'corregir') {
        corregidas.push({ vehiculo: c.vehiculo, d, ficha: c.ficha })
        continue
      }
      // Lo que no se arregla solo sólo molesta si el coche ya está publicado:
      // el stock en preparación se revisa al ir a publicarlo (el 409 de
      // faltantesPublicar dice exactamente qué falta).
      if (!c.vehiculo.publicado) continue
      if (d.fuente === 'web') {
        revisionWeb.push({ vehiculo: c.vehiculo, d, web: c.web })
      } else {
        revisionCrm.push({ vehiculo: c.vehiculo, d })
      }
    }
  }

  // 3. Escritura: el campo + fila de auditoría (permite deshacerla) + fila en
  //    vehiculo_campos_doc si el campo es de los que hay que confirmar.
  //
  //    Los campos de la ficha comercial de un mismo coche se agrupan en un solo
  //    upsert: el pool es compartido y este bucle puede tocar 70 coches.
  const aplicadas: Correccion[] = []
  const rellenados: Correccion[] = []
  const porVehiculo = new Map<number, Correccion[]>()
  for (const c of corregidas) {
    const lista = porVehiculo.get(c.vehiculo.id)
    if (lista) lista.push(c)
    else porVehiculo.set(c.vehiculo.id, [c])
  }

  const falla = (c: Correccion, err: unknown) => {
    errores.push({
      tipo: `correccion:${c.vehiculo.id}:${c.d.campo}`,
      error: (err as Error).message ?? String(err),
    })
    // Si no se pudo escribir, que al menos se avise.
    if (c.vehiculo.publicado) revisionCrm.push({ vehiculo: c.vehiculo, d: c.d })
  }

  const NUMERICOS = new Set(['cubicaje', 'motor_kw', 'motor_cv', 'plazas'])

  /**
   * Todo lo de un coche en UNA transacción: el valor, el rastro para deshacerlo
   * y la marca de «falta confirmarlo» entran juntos o no entra ninguno.
   *
   * Si el valor quedara escrito sin su marca, faltantesPublicar lo daría por
   * bueno («lo escribió una persona») y el coche se publicaría con un dato leído
   * por IA que nadie ha mirado — justo lo que este cambio existe para impedir.
   * Un cliente a la vez: el pool tiene max 3 y este bucle es secuencial.
   */
  const escribirCoche = async (vehiculoId: number, lista: Correccion[]) => {
    const patch: Partial<FichaComercial> = {}
    const docs: CampoDocEscrito[] = []
    const auditoria: Record<string, unknown>[] = []

    const anotar = (c: Correccion, campo: string) => {
      auditoria.push({
        campo,
        valor_anterior: c.d.valorActual,
        valor_nuevo: c.d.valorFicha,
        confianza: c.d.confianza,
        ficha_id: c.ficha.id,
      })
      // Sólo lo que RELLENÓ un hueco queda pendiente de confirmar. Canonizar el
      // formato de una fecha que ya escribió una persona no es un dato nuevo:
      // marcarlo borraría su confirmación y bloquearía el coche por nada.
      if (esCampoDoc(c.d.campo) && c.d.tipo === 'vacio') {
        docs.push({
          campo: c.d.campo,
          valor: c.d.valorFicha,
          confianza: c.d.confianza,
          fichaId: c.ficha.id,
          archivo: c.ficha.archivo,
        })
        rellenados.push(c)
      }
      aplicadas.push(c)
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Ficha comercial: un solo upsert con todo lo que cambia del coche.
      for (const c of lista.filter((x) => x.d.fuente === 'ficha')) {
        const def = CAMPOS_DOC_POR_NOMBRE[c.d.campo]
        if (!def) continue
        ;(patch as Record<string, unknown>)[def.columna] = NUMERICOS.has(
          def.columna
        )
          ? Number(c.d.valorFicha)
          : c.d.valorFicha
        anotar(c, `ficha_comercial.${def.columna}`)
      }
      if (Object.keys(patch).length > 0) {
        await escribirCamposFicha(vehiculoId, patch, client)
      }

      // "Vehiculo": un UPDATE por campo (son uno o dos como mucho).
      for (const c of lista.filter((x) => x.d.fuente === 'crm')) {
        const columna = COLUMNA_CRM[c.d.campo as CampoCrm]
        if (!columna) continue // decidir() ya filtró el campo; por si acaso
        await client.query(
          `UPDATE "Vehiculo" SET "${columna}" = $1, "updatedAt" = NOW() WHERE id = $2`,
          [c.d.valorFicha, vehiculoId]
        )
        anotar(c, columna)
      }

      if (auditoria.length > 0) {
        await client.query(
          `INSERT INTO fichas_tecnicas_correcciones
             (vehiculo_id, campo, valor_anterior, valor_nuevo, confianza, ficha_id)
           SELECT $1, x.campo, x.valor_anterior, x.valor_nuevo, x.confianza, x.ficha_id
             FROM jsonb_to_recordset($2::jsonb) AS x(campo text,
                    valor_anterior text, valor_nuevo text, confianza numeric,
                    ficha_id int)`,
          [vehiculoId, JSON.stringify(auditoria)]
        )
      }
      await registrarCamposDoc(client, vehiculoId, docs)

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      // Nada se escribió: hay que deshacer la contabilidad optimista de anotar().
      for (const c of lista) {
        const i = aplicadas.indexOf(c)
        if (i >= 0) aplicadas.splice(i, 1)
        const j = rellenados.indexOf(c)
        if (j >= 0) rellenados.splice(j, 1)
        falla(c, err)
      }
    } finally {
      client.release()
    }
  }

  for (const [vehiculoId, lista] of porVehiculo) {
    await escribirCoche(vehiculoId, lista)
  }
  out.corregidos = aplicadas.length
  out.rellenados = rellenados.length
  out.porConfirmar = await pendientesDeConfirmar()
  out.revisionCrm = revisionCrm.length
  out.revisionWeb = revisionWeb.length

  // 4. Bandeja de revisión.
  const filas = [
    ...[
      ...revisionCrm,
      ...revisionWeb.map((r) => ({ vehiculo: r.vehiculo, d: r.d })),
    ].map(({ vehiculo, d }) => {
      const ficha = fichas.get(vehiculo.id)
      return {
        titulo: `${coche(vehiculo)} · ${d.etiqueta}`,
        dedup_key: dedupKeyFicha(
          vehiculo.id,
          // 'combustible' y 'plazas' existen en la web Y en la ficha
          // comercial: sin la fuente en la clave, un aviso taparía al otro.
          d.fuente === 'crm' ? d.campo : `${d.fuente}:${d.campo}`,
          ficha?.hash ?? 'sin-hash'
        ),
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
    }),
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
    errores.push({
      tipo: 'bandeja',
      error: (err as Error).message ?? String(err),
    })
  }

  // 5. Correo-resumen, solo si hay algo que contar.
  if (
    aplicadas.length ||
    revisionCrm.length ||
    revisionWeb.length ||
    sinFicha.length
  ) {
    const digest = renderDigestFichas(
      // En «corregido» sólo lo que pisó un valor que ya estaba; lo que rellenó
      // un hueco va en su propia sección, con el aviso de confirmarlo.
      aplicadas.filter((c) => !rellenados.includes(c)),
      revisionCrm,
      revisionWeb,
      sinFicha,
      rellenados,
      out.porConfirmar,
      hoy
    )
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
