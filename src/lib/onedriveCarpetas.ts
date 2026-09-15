/**
 * Carpetas de coche en OneDrive (1_Ventas y 3_Compras): el CRM decide QUÉ
 * carpeta debe existir y dónde (nombre canónico + contenedor por tipo/estado)
 * y el receptor del server Hetzner (acción `carpetas`, vía n8n) la crea, la
 * mueve a VENDIDOS o la renombra. El CRM nunca ve el mount.
 *
 * Encolado: los disparadores insertan en webhook_outbox (tipo
 * 'onedrive_carpetas') y se procesa en background (after() + timeout 45 s);
 * lo que falle lo reintenta POST /api/admin/webhook-outbox/retry. El cron
 * diario /api/cron/onedrive-carpetas lista lo que hay, lo cruza con el CRM y
 * crea las faltantes. Apagado por defecto: ONEDRIVE_CARPETAS_ENABLED=1.
 */
import { after } from 'next/server'
import { pool } from '@/lib/direct-database'
import {
  insertOutboxPending,
  markOutboxEnviado,
  markOutboxFallo,
  markOutboxAgotado,
} from '@/lib/webhookOutbox'
import { renombreWebhookUrl } from '@/lib/renombreWebhook'
import { normalizarEstado, normalizarTipo } from '@/lib/vehiculoEstado'
import * as nombreImpl from '../../scripts/lib/carpetaNombre'

export const ONEDRIVE_CARPETAS_TIPO_OUTBOX = 'onedrive_carpetas'

export type Raiz = '1_Ventas' | '3_Compras'
export type TipoCarpeta = 'C' | 'I' | 'D' | 'R'

/** Espejo exacto de la estructura real de OneDrive ('' = raíz). */
export const RAICES = {
  '1_Ventas': {
    stock: { C: '', I: '', D: '-------Consignacion', R: '-----------Coches R' },
    vendidos: {
      C: '----VENDIDOS',
      I: '----VENDIDOS',
      D: '----VENDIDOS',
      R: '----VENDIDOS/0--------------------Coches-R',
    },
    contenedores: [
      '-----------Coches R',
      '-------Consignacion',
      '------IMPORTACION',
      '----VENDIDOS',
      '----VENDIDOS/0--------------------Coches-R',
    ],
  },
  '3_Compras': {
    stock: {
      C: '',
      I: '',
      D: '--------Consignacion',
      R: '-----------Coches R',
    },
    vendidos: {
      C: '----VENDIDOS',
      I: '----VENDIDOS',
      D: '----VENDIDOS',
      R: '----VENDIDOS/COCHES R',
    },
    contenedores: [
      '-----------Coches R',
      '--------Consignacion',
      '-----Importacion',
      '----VENDIDOS',
      '----VENDIDOS/COCHES R',
    ],
  },
} as const

export type AccionCarpetas = 'crear' | 'vendido' | 'renombrar'

export interface CarpetasPayload {
  vehiculoId: number
  accion: AccionCarpetas
  /** Nombre actual de la carpeta (sólo renombrar). */
  de?: string
}

export interface CarpetasRequest {
  accion: 'carpetas'
  op: 'crear' | 'vendido' | 'renombrar' | 'listar'
  dryRun?: boolean
  nombre?: string
  tipo?: TipoCarpeta
  matricula?: string
  de?: string
  a?: string
}

export interface CarpetaListada {
  root: string
  contenedor: string
  nombre: string
  /** Tal como la devuelve el receptor (incluye la raíz); no se usa para comparar. */
  rel: string
}

/** Ruta dentro de la raíz, calculada de contenedor+nombre (no del `rel` del receptor). */
function relEnRaiz(c: Pick<CarpetaListada, 'contenedor' | 'nombre'>): string {
  return c.contenedor ? `${c.contenedor}/${c.nombre}` : c.nombre
}

export type ResultadoCarpetas =
  | 'creado'
  | 'existente'
  | 'renombrado'
  | 'movido'
  | 'conflicto'
  | 'sin_cambios'
  | 'no_existe'

export interface CarpetasResponse {
  ok: boolean
  accion: string
  dryRun: boolean
  rutas: string[]
  motivo: string | null
  resultado?: ResultadoCarpetas
  porRaiz?: Record<
    string,
    { resultado: ResultadoCarpetas; ruta: string; motivo: string | null }
  >
  existentes?: string[]
  carpetas?: CarpetaListada[]
}

const TIMEOUT_MS = 45_000
const WEBHOOK_TIMEOUT_MS = 40_000

export function onedriveCarpetasDeshabilitado(): boolean {
  return process.env.ONEDRIVE_CARPETAS_ENABLED !== '1'
}

/** Letra con carpeta propia; 'M' y desconocidos no tienen. */
export function tipoCarpeta(
  tipo: string | null | undefined
): TipoCarpeta | null {
  const t = normalizarTipo(tipo)
  return t === 'C' || t === 'I' || t === 'D' || t === 'R' ? t : null
}

export interface DatosNombreCarpeta {
  referencia: string | null | undefined
  tipo: string | null | undefined
  marca: string | null | undefined
  modelo: string | null | undefined
  matriculaNorm: string | null | undefined
  aliases?: string[]
}

/** Fachada tipada de scripts/lib/carpetaNombre.js. */
export function nombreCarpetaCanonico(v: DatosNombreCarpeta): string | null {
  return nombreImpl.nombreCarpetaCanonico({
    ...v,
    tipo: tipoCarpeta(v.tipo),
    aliases: v.aliases ?? [],
  })
}

export function ubicacionEsperada(
  root: Raiz,
  tipo: TipoCarpeta,
  estado: string | null | undefined
): string {
  const r = RAICES[root]
  return normalizarEstado(estado) === 'VENDIDO'
    ? r.vendidos[tipo]
    : r.stock[tipo]
}

export function claveBusqueda(nombre: string): string {
  return String(nombre ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/** El nombre real es el canónico o el canónico con sufijos ('…-Rojo-Inversor-Juan'). */
export function esNombreCanonico(actual: string, canonico: string): boolean {
  return actual === canonico || actual.startsWith(`${canonico}-`)
}

/** Prefijo de referencia del nombre de carpeta ('R-8-…' → 'R-8', '10-…' → '10'). */
export function refDeNombre(nombre: string): string | null {
  const m = /^([DR]-\d+|\d+)-/.exec(String(nombre ?? '').trim())
  return m ? m[1] : null
}

// ---------------------------------------------------------------------------
// Vehículos esperados (DB) y diff contra lo listado
// ---------------------------------------------------------------------------

export interface VehiculoEsperado {
  vehiculoId: number
  referencia: string | null
  tipo: TipoCarpeta | null
  estado: string | null
  /** [matricula_norm actual, ...aliases] */
  matriculas: string[]
  nombre: string | null
}

export interface DiffCarpetas {
  faltantes: {
    vehiculoId: number
    referencia: string | null
    nombre: string
    root: Raiz
    contenedor: string
    /** Carpeta sin vehículo de la misma raíz con el mismo prefijo de referencia. */
    posibleExistente?: string
  }[]
  /** `${root}/${rel}` */
  sinVehiculo: string[]
  noCanonicas: { rel: string; esperado: string; vehiculoId: number }[]
  duplicados: { matricula: string; rutas: string[] }[]
  sinReferencia: {
    vehiculoId: number
    referencia: string | null
    matricula: string
  }[]
}

const RAICES_LISTA = Object.keys(RAICES) as Raiz[]

/** Pura. Cruza los vehículos del CRM con las carpetas listadas del receptor. */
export function diffCarpetas(
  esperados: VehiculoEsperado[],
  carpetas: CarpetaListada[]
): DiffCarpetas {
  const out: DiffCarpetas = {
    faltantes: [],
    sinVehiculo: [],
    noCanonicas: [],
    duplicados: [],
    sinReferencia: [],
  }

  const porMatricula = new Map<string, Set<number>>()
  for (const v of esperados) {
    for (const m of v.matriculas) {
      const k = claveBusqueda(m)
      if (!k) continue
      if (!porMatricula.has(k)) porMatricula.set(k, new Set())
      porMatricula.get(k)!.add(v.vehiculoId)
    }
  }

  const porVehiculoRaiz = new Map<string, CarpetaListada[]>()
  const huerfanas: CarpetaListada[] = []
  for (const c of carpetas) {
    const k = claveBusqueda(c.nombre)
    const ids = new Set<number>()
    for (const [m, vs] of porMatricula) {
      if (k.includes(m)) for (const id of vs) ids.add(id)
    }
    if (ids.size !== 1) {
      huerfanas.push(c)
      out.sinVehiculo.push(`${c.root}/${relEnRaiz(c)}`)
      continue
    }
    const key = `${[...ids][0]}|${c.root}`
    if (!porVehiculoRaiz.has(key)) porVehiculoRaiz.set(key, [])
    porVehiculoRaiz.get(key)!.push(c)
  }

  for (const v of esperados) {
    if (!v.tipo) continue
    if (!v.nombre) {
      out.sinReferencia.push({
        vehiculoId: v.vehiculoId,
        referencia: v.referencia,
        matricula: v.matriculas[0] ?? '',
      })
      continue
    }
    const refEsperada = refDeNombre(v.nombre)
    for (const root of RAICES_LISTA) {
      const contenedor = ubicacionEsperada(root, v.tipo, v.estado)
      const esperadoRel = contenedor ? `${contenedor}/${v.nombre}` : v.nombre
      const grupo = porVehiculoRaiz.get(`${v.vehiculoId}|${root}`) ?? []
      if (grupo.length === 0) {
        const posible = refEsperada
          ? huerfanas.find(
              (h) => h.root === root && refDeNombre(h.nombre) === refEsperada
            )
          : undefined
        out.faltantes.push({
          vehiculoId: v.vehiculoId,
          referencia: v.referencia,
          nombre: v.nombre,
          root,
          contenedor,
          ...(posible
            ? { posibleExistente: `${posible.root}/${relEnRaiz(posible)}` }
            : {}),
        })
      } else if (grupo.length === 1) {
        const g = grupo[0]
        if (
          g.contenedor !== contenedor ||
          !esNombreCanonico(g.nombre, v.nombre)
        ) {
          out.noCanonicas.push({
            rel: `${root}/${relEnRaiz(grupo[0])}`,
            esperado: `${root}/${esperadoRel}`,
            vehiculoId: v.vehiculoId,
          })
        }
      } else {
        out.duplicados.push({
          matricula: v.matriculas[0] ?? '',
          rutas: grupo.map((c) => `${root}/${relEnRaiz(c)}`),
        })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Receptor (server Hetzner vía n8n)
// ---------------------------------------------------------------------------

export interface CarpetasWebhookResult {
  ok: boolean
  status?: number
  error?: string
  data?: CarpetasResponse
}

export async function postCarpetasWebhook(
  body: CarpetasRequest,
  opts: { timeoutMs?: number } = {}
): Promise<CarpetasWebhookResult> {
  const url = renombreWebhookUrl()
  if (!url) {
    return {
      ok: false,
      error:
        'sin webhook de carpetas (N8N_RENAME_WEBHOOK_URL / N8N_INVOICE_WEBHOOK_URL)',
    }
  }
  const secret =
    process.env.N8N_RENAME_WEBHOOK_SECRET ??
    process.env.N8N_INVOICE_WEBHOOK_SECRET ??
    ''
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? WEBHOOK_TIMEOUT_MS
  )
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': secret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = (await res.json().catch(() => ({}))) as Partial<
      CarpetasResponse & { error?: string }
    >
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.error ?? data?.motivo ?? `webhook returned ${res.status}`,
      }
    }
    return { ok: true, status: res.status, data: data as CarpetasResponse }
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? String(err) }
  } finally {
    clearTimeout(timeout)
  }
}

// ---------------------------------------------------------------------------
// Carga desde DB
// ---------------------------------------------------------------------------

interface FilaVehiculo {
  id: number
  referencia: string | null
  tipo: string | null
  estado: string | null
  marca: string | null
  modelo: string | null
  matricula_norm: string | null
  aliases: string[] | null
}

async function hayTablaMatriculas(): Promise<boolean> {
  const reg = await pool.query<{ reg: string | null }>(
    `SELECT to_regclass('public.vehiculo_matriculas') AS reg`
  )
  return Boolean(reg.rows[0]?.reg)
}

function sqlAliases(conTabla: boolean): string {
  return conTabla
    ? `ARRAY(SELECT m.matricula_norm FROM vehiculo_matriculas m
              WHERE m.vehiculo_id = v.id AND m.matricula_norm <> ''
                AND m.matricula_norm <> v.matricula_norm)`
    : `ARRAY[]::text[]`
}

function aEsperado(row: FilaVehiculo): VehiculoEsperado & {
  marca: string | null
  modelo: string | null
} {
  const actual = String(row.matricula_norm ?? '').trim()
  const aliases = (row.aliases ?? [])
    .map((a) => String(a ?? '').trim())
    .filter(Boolean)
  const tipo = tipoCarpeta(row.tipo)
  return {
    vehiculoId: row.id,
    referencia: row.referencia,
    tipo,
    estado: row.estado,
    matriculas: [actual, ...aliases],
    marca: row.marca,
    modelo: row.modelo,
    nombre: tipo
      ? nombreCarpetaCanonico({
          referencia: row.referencia,
          tipo,
          marca: row.marca,
          modelo: row.modelo,
          matriculaNorm: actual,
          aliases,
        })
      : null,
  }
}

export async function cargarVehiculoCarpeta(
  vehiculoId: number
): Promise<
  (VehiculoEsperado & { marca: string | null; modelo: string | null }) | null
> {
  const conTabla = await hayTablaMatriculas()
  const res = await pool.query<FilaVehiculo>(
    `SELECT v.id, v.referencia, v.tipo, v.estado, v.marca, v.modelo,
            COALESCE(v.matricula_norm, '') AS matricula_norm,
            ${sqlAliases(conTabla)} AS aliases
       FROM "Vehiculo" v
      WHERE v.id = $1`,
    [vehiculoId]
  )
  const row = res.rows[0]
  return row ? aEsperado(row) : null
}

export async function cargarVehiculosCarpeta(): Promise<VehiculoEsperado[]> {
  const conTabla = await hayTablaMatriculas()
  const res = await pool.query<FilaVehiculo>(
    `SELECT v.id, v.referencia, v.tipo, v.estado, v.marca, v.modelo,
            v.matricula_norm, ${sqlAliases(conTabla)} AS aliases
       FROM "Vehiculo" v
      WHERE v.matricula_norm IS NOT NULL AND v.matricula_norm <> ''
      ORDER BY v.id`
  )
  return res.rows.map((r) => {
    const v = aEsperado(r)
    return {
      vehiculoId: v.vehiculoId,
      referencia: v.referencia,
      tipo: v.tipo,
      estado: v.estado,
      matriculas: v.matriculas,
      nombre: v.nombre,
    }
  })
}

// ---------------------------------------------------------------------------
// Ejecución de una acción
// ---------------------------------------------------------------------------

export interface ResultadoEjecucion {
  ok: boolean
  error?: string
  /** Fallo definitivo (vehículo inexistente, sin nombre, conflicto): no reintentar. */
  permanente?: boolean
  resultado?: ResultadoCarpetas
  nombre?: string
}

async function registrarLog(
  vehiculoId: number,
  accion: AccionCarpetas,
  payload: unknown,
  resultado: unknown,
  ok: boolean
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO onedrive_carpetas_log (vehiculo_id, accion, payload, resultado, ok)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        vehiculoId,
        accion,
        JSON.stringify(payload),
        JSON.stringify(resultado ?? null),
        ok,
      ]
    )
  } catch (err) {
    console.error('[onedriveCarpetas] log:', (err as Error)?.message ?? err)
  }
}

export async function ejecutarCarpetas(
  vehiculoId: number,
  accion: AccionCarpetas,
  de?: string,
  motivo?: string
): Promise<ResultadoEjecucion> {
  const v = await cargarVehiculoCarpeta(vehiculoId)
  if (!v) {
    return {
      ok: false,
      permanente: true,
      error: `vehículo ${vehiculoId} inexistente`,
    }
  }
  const nombre = v.nombre
  if (!nombre || !v.tipo) {
    return {
      ok: false,
      permanente: true,
      error: `vehículo ${vehiculoId} sin nombre canónico (referencia ${v.referencia ?? '-'}, tipo ${v.tipo ?? '-'})`,
    }
  }
  const base = {
    accion: 'carpetas' as const,
    nombre,
    tipo: v.tipo,
    matricula: v.matriculas[0],
  }
  const crear: CarpetasRequest = { ...base, op: 'crear' }
  let body: CarpetasRequest
  if (accion === 'vendido') body = { ...base, op: 'vendido' }
  else if (accion === 'renombrar' && de && de !== nombre)
    body = { ...base, op: 'renombrar', de, a: nombre }
  else body = crear

  let res = await postCarpetasWebhook(body)
  if (!res.ok || !res.data)
    return { ok: false, error: res.error ?? 'sin respuesta' }
  // La carpeta vieja ya no está (la renombraron a mano): se asegura la nueva.
  if (body.op === 'renombrar' && res.data.resultado === 'no_existe') {
    await registrarLog(vehiculoId, accion, { ...body, motivo }, res.data, false)
    body = crear
    res = await postCarpetasWebhook(body)
    if (!res.ok || !res.data)
      return { ok: false, error: res.error ?? 'sin respuesta' }
  }
  const data = res.data
  await registrarLog(vehiculoId, accion, { ...body, motivo }, data, data.ok)

  if (data.ok) {
    try {
      await pool.query(`UPDATE "Vehiculo" SET carpeta = $2 WHERE id = $1`, [
        vehiculoId,
        nombre,
      ])
    } catch (err) {
      console.error(
        '[onedriveCarpetas] carpeta:',
        (err as Error)?.message ?? err
      )
    }
    return { ok: true, resultado: data.resultado, nombre }
  }
  const error = data.motivo ?? `resultado ${data.resultado ?? 'desconocido'}`
  if (data.resultado === 'conflicto') {
    return {
      ok: false,
      permanente: true,
      resultado: data.resultado,
      error,
      nombre,
    }
  }
  return { ok: false, resultado: data.resultado, error, nombre }
}

// ---------------------------------------------------------------------------
// Cola (webhook_outbox) y procesamiento
// ---------------------------------------------------------------------------

/**
 * Reserva la fila ('pendiente' → 'procesando'). Falla si ya la tomó otro
 * proceso o hay otro job del MISMO vehículo en curso (< 2 min): dos acciones
 * concurrentes sobre la misma carpeta se pisan. Un 'procesando' de más de
 * 10 min se considera muerto.
 */
export async function reservarOutboxCarpetas(
  outboxId: number
): Promise<boolean> {
  try {
    const res = await pool.query<{ id: number }>(
      `UPDATE webhook_outbox o
          SET estado = 'procesando', updated_at = NOW()
        WHERE o.id = $1
          AND (o.estado = 'pendiente'
               OR (o.estado = 'procesando'
                   AND o.updated_at < NOW() - INTERVAL '10 minutes'))
          AND NOT EXISTS (
                SELECT 1 FROM webhook_outbox x
                 WHERE x.tipo = $2 AND x.estado = 'procesando' AND x.id <> o.id
                   AND x.payload->>'vehiculoId' = o.payload->>'vehiculoId'
                   AND x.updated_at > NOW() - INTERVAL '2 minutes')
        RETURNING o.id`,
      [outboxId, ONEDRIVE_CARPETAS_TIPO_OUTBOX]
    )
    return !!res.rows[0]
  } catch (err) {
    console.error(
      '[onedriveCarpetas] reservar outbox:',
      (err as Error)?.message ?? err
    )
    return false
  }
}

export async function procesarOutboxCarpetas(
  outboxId: number,
  payload: CarpetasPayload
): Promise<void> {
  try {
    if (!(await reservarOutboxCarpetas(outboxId))) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<ResultadoEjecucion>((resolve) => {
      timer = setTimeout(
        () => resolve({ ok: false, error: `timeout ${TIMEOUT_MS / 1000}s` }),
        TIMEOUT_MS
      )
    })
    const result = await Promise.race([
      ejecutarCarpetas(
        payload.vehiculoId,
        payload.accion,
        payload.de,
        'outbox'
      ),
      timeout,
    ]).finally(() => clearTimeout(timer))
    if (result.ok) await markOutboxEnviado(outboxId)
    else if (result.permanente)
      await markOutboxAgotado(outboxId, result.error ?? 'unknown error')
    else await markOutboxFallo(outboxId, result.error ?? 'unknown error')
  } catch (err) {
    await markOutboxFallo(outboxId, (err as Error)?.message ?? String(err))
  }
}

const ACCIONES: AccionCarpetas[] = ['crear', 'vendido', 'renombrar']

/**
 * Reenvío desde /api/admin/webhook-outbox/retry. Con `outboxId` reserva la
 * fila; si no puede (otro job del vehículo en curso) devuelve `skip: true`.
 */
export async function reenviarCarpetasOneDrive(
  payload: CarpetasPayload,
  outboxId?: number
): Promise<{
  ok: boolean
  error?: string
  permanente?: boolean
  skip?: boolean
}> {
  const id = Number(payload?.vehiculoId)
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: 'payload sin vehiculoId', permanente: true }
  }
  if (!ACCIONES.includes(payload?.accion)) {
    return {
      ok: false,
      error: `payload con accion inválida '${payload?.accion}'`,
      permanente: true,
    }
  }
  if (outboxId != null && !(await reservarOutboxCarpetas(outboxId))) {
    return { ok: false, error: 'en curso', skip: true }
  }
  const r = await ejecutarCarpetas(id, payload.accion, payload.de, 'retry')
  return { ok: r.ok, error: r.error, permanente: r.permanente }
}

function programarEnBackground(fn: () => Promise<void>): void {
  // Dentro de una request de Next, after() mantiene viva la lambda hasta que
  // termine; fuera de una request (scripts, tests) lanza y se cae al fallback.
  try {
    after(fn)
  } catch {
    void fn()
  }
}

/**
 * Encola la acción. Dedupe: si ya hay una fila 'pendiente' para el mismo
 * vehículo y la misma acción no se encola otra. Nunca lanza.
 */
export async function encolarCarpetasOneDrive(
  vehiculoId: number,
  accion: AccionCarpetas,
  de?: string
): Promise<{ encolado: boolean; outboxId?: number; reason?: string }> {
  try {
    if (onedriveCarpetasDeshabilitado()) {
      return { encolado: false, reason: 'ONEDRIVE_CARPETAS_ENABLED!=1' }
    }
    const pendiente = await pool.query<{ id: number }>(
      `SELECT id FROM webhook_outbox
        WHERE tipo = $1 AND estado = 'pendiente'
          AND payload->>'vehiculoId' = $2 AND payload->>'accion' = $3
        LIMIT 1`,
      [ONEDRIVE_CARPETAS_TIPO_OUTBOX, String(vehiculoId), accion]
    )
    if (pendiente.rows[0]) {
      return {
        encolado: false,
        outboxId: pendiente.rows[0].id,
        reason: 'ya pendiente',
      }
    }
    const ref = await pool.query<{ referencia: string | null }>(
      'SELECT referencia FROM "Vehiculo" WHERE id = $1',
      [vehiculoId]
    )
    const payload: CarpetasPayload = {
      vehiculoId,
      accion,
      ...(de ? { de } : {}),
    }
    const outboxId = await insertOutboxPending(
      ONEDRIVE_CARPETAS_TIPO_OUTBOX,
      payload,
      ref.rows[0]?.referencia ?? String(vehiculoId)
    )
    if (outboxId == null)
      return { encolado: false, reason: 'outbox insert failed' }
    programarEnBackground(() => procesarOutboxCarpetas(outboxId, payload))
    return { encolado: true, outboxId }
  } catch (err) {
    const reason = (err as Error)?.message ?? String(err)
    console.error('[onedriveCarpetas] encolar:', reason)
    return { encolado: false, reason }
  }
}

// ---------------------------------------------------------------------------
// Comprobación global (cron diario y endpoint admin)
// ---------------------------------------------------------------------------

export interface ResumenCheckCarpetas extends DiffCarpetas {
  dryRun: boolean
  habilitado: boolean
  carpetas: number
  vehiculos: number
  creadas: {
    vehiculoId: number
    nombre: string
    resultado?: ResultadoCarpetas
  }[]
  errores: string[]
}

/**
 * Lista las carpetas reales, las cruza con el CRM y, salvo dryRun (o kill
 * switch), crea las faltantes de coches en stock (una llamada por vehículo:
 * el receptor cubre ambas raíces). Nunca crea sobre una posible existente
 * mal nombrada ni toca VENDIDOS. Nunca lanza.
 */
export async function checkCarpetasOneDrive(opts: {
  dryRun: boolean
  maxCrear?: number
}): Promise<ResumenCheckCarpetas> {
  const dryRun = !!opts.dryRun
  const maxCrear = Number.isFinite(opts.maxCrear) ? Number(opts.maxCrear) : 10
  const out: ResumenCheckCarpetas = {
    dryRun,
    habilitado: !onedriveCarpetasDeshabilitado(),
    carpetas: 0,
    vehiculos: 0,
    faltantes: [],
    creadas: [],
    sinVehiculo: [],
    noCanonicas: [],
    duplicados: [],
    sinReferencia: [],
    errores: [],
  }
  try {
    const lista = await postCarpetasWebhook(
      { accion: 'carpetas', op: 'listar' },
      { timeoutMs: WEBHOOK_TIMEOUT_MS }
    )
    if (!lista.ok || !lista.data) {
      out.errores.push(`listar: ${lista.error ?? 'sin respuesta'}`)
      return out
    }
    const carpetas = lista.data.carpetas ?? []
    out.carpetas = carpetas.length
    const esperados = await cargarVehiculosCarpeta()
    out.vehiculos = esperados.length
    Object.assign(out, diffCarpetas(esperados, carpetas))

    if (dryRun || !out.habilitado) return out
    const porId = new Map(esperados.map((v) => [v.vehiculoId, v]))
    const hechos = new Set<number>()
    for (const f of out.faltantes) {
      if (f.posibleExistente || hechos.has(f.vehiculoId)) continue
      const v = porId.get(f.vehiculoId)
      if (!v || normalizarEstado(v.estado) === 'VENDIDO') continue
      if (hechos.size >= maxCrear) break
      hechos.add(f.vehiculoId)
      const r = await ejecutarCarpetas(
        f.vehiculoId,
        'crear',
        undefined,
        'check'
      )
      if (r.ok) {
        out.creadas.push({
          vehiculoId: f.vehiculoId,
          nombre: f.nombre,
          resultado: r.resultado,
        })
      } else {
        out.errores.push(
          `crear #${f.vehiculoId} ${f.nombre}: ${r.error ?? 'error'}`
        )
      }
    }
  } catch (err) {
    out.errores.push((err as Error)?.message ?? String(err))
  }
  return out
}
