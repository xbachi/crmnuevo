/**
 * Cola de automatizaciones: el CRM encola pedidos sobre un coche (cambio de
 * precio, de fotos, borrador en la web, ficha, carteles) y la PC del dueño
 * (vigilar.py) los reclama, corre publicar.py / luna.py y devuelve el
 * resultado. Tablas: create-automatizacion-trabajos.sql. La PC entra por
 * /api/automatizaciones/worker/* con X-Worker-Secret; la pantalla del coche
 * por /api/vehiculos/[id]/automatizaciones con sesión.
 */
import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { safeEqual } from '@/lib/secrets'
import { normalizarTipo } from '@/lib/vehiculoEstado'

export const TIPOS = [
  'cambio_precio',
  'cambio_fotos',
  'publicar_borrador',
  'bajar_ficha',
  'carteles',
] as const
export type TipoTrabajo = (typeof TIPOS)[number]
export const MODOS = ['simular', 'aplicar'] as const
export type ModoTrabajo = (typeof MODOS)[number]
export type EstadoTrabajo =
  | 'pendiente'
  | 'en_curso'
  | 'ok'
  | 'error'
  | 'caducado'
  | 'cancelado'

/** Tipos que exigen una simulación ok reciente antes de aplicar. */
export const TIPOS_CON_SIMULACION: readonly TipoTrabajo[] = [
  'cambio_precio',
  'cambio_fotos',
  'publicar_borrador',
]

export const TIPO_LABEL: Record<TipoTrabajo, string> = {
  cambio_precio: 'Cambiar precio',
  cambio_fotos: 'Cambiar fotos',
  publicar_borrador: 'Publicar borrador',
  bajar_ficha: 'Bajar ficha',
  carteles: 'Carteles',
}

export const CADUCA_MIN = 15
/** en_curso más viejo que esto Y sin latido de su PC en LATIDO_PERDIDO_MIN → interrumpido. */
export const INTERRUMPIDO_MIN = 30
/** Tope: en_curso más viejo que esto → interrumpido aunque la PC siga dando latido. */
export const INTERRUMPIDO_TOPE_MIN = 60
export const LATIDO_PERDIDO_MIN = 5
export const SIMULACION_VIGENTE_MIN = 30
export const WORKER_ACTIVO_S = 120
export const SALIDA_MAX_BYTES = 100 * 1024
export const HISTORIAL_MAX = 10
export const PROXIMO_ACTIVO_S = 10
export const PROXIMO_REPOSO_S = 45
const ACTIVIDAD_RECIENTE_S = 15 * 60
const SALIDA_INTERRUMPIDO =
  'interrumpido: la PC dejó de responder sin devolver el resultado (no se reintenta solo)'

/** Mismo valor que SHEETS_VEHICULO_TIPO_OUTBOX (no se importa: arrastra googleapis). */
const OUTBOX_SHEETS_VEHICULO = 'sheets_vehiculo'

/**
 * publicar.py y luna.py leen la hoja Base_Datos, y a esa pestaña sólo van los
 * tipos C, I y D (pestanasDe en sheetsVehiculo.ts).
 */
const TIPOS_VEHICULO_CON_WEB = ['C', 'I', 'D']

export interface Trabajo {
  id: number
  vehiculo_id: number | null
  referencia: string | null
  matricula: string | null
  tipo: TipoTrabajo
  modo: ModoTrabajo
  simulacion_id: number | null
  estado: EstadoTrabajo
  rc: number | null
  salida: string | null
  para_verificar: string[] | null
  url: string | null
  creado_por: number | null
  worker: string | null
  created_at: string
  expira_at: string | null
  started_at: string | null
  finished_at: string | null
}

export interface EstadoWorker {
  nombre: string | null
  last_seen: string | null
  version: string | null
  /** Segundos desde el último latido (reloj de la DB). */
  hace_s: number | null
  activo: boolean
}

/** Lo que recibe la PC al reclamar (contrato). */
export interface TrabajoParaWorker {
  id: number
  tipo: TipoTrabajo
  modo: ModoTrabajo
  referencia: string | null
  matricula: string | null
  vehiculo_id: number | null
}

// ---------------------------------------------------------------------------
// Validación pura
// ---------------------------------------------------------------------------

function esObjeto(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function enteroPositivo(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null
  if (typeof v === 'string' && v.trim() === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function requiereSimulacion(tipo: TipoTrabajo): boolean {
  return TIPOS_CON_SIMULACION.includes(tipo)
}

export function admiteAutomatizaciones(
  tipoVehiculo: string | null | undefined
): boolean {
  const t = normalizarTipo(tipoVehiculo)
  return t != null && TIPOS_VEHICULO_CON_WEB.includes(t)
}

export interface PedidoValido {
  tipo: TipoTrabajo
  modo: ModoTrabajo
  /** Sólo al aplicar un tipo que exige simulación; si no, null. */
  simulacion_id: number | null
}

export type ValidacionPedido =
  | { ok: true; pedido: PedidoValido }
  | { ok: false; error: string }

/** Body del POST de la pantalla: {tipo, modo, simulacion_id?}. */
export function validarPedido(body: unknown): ValidacionPedido {
  if (!esObjeto(body)) return { ok: false, error: 'body inválido' }
  const tipo = body.tipo
  if (typeof tipo !== 'string' || !(TIPOS as readonly string[]).includes(tipo))
    return { ok: false, error: `tipo: debe ser ${TIPOS.join('|')}` }
  const modo = body.modo
  if (typeof modo !== 'string' || !(MODOS as readonly string[]).includes(modo))
    return { ok: false, error: `modo: debe ser ${MODOS.join('|')}` }
  let simulacionId: number | null = null
  if (body.simulacion_id != null && body.simulacion_id !== '') {
    simulacionId = enteroPositivo(body.simulacion_id)
    if (simulacionId == null)
      return { ok: false, error: 'simulacion_id: debe ser un entero > 0' }
  }
  const t = tipo as TipoTrabajo
  const m = modo as ModoTrabajo
  if (m !== 'aplicar' || !requiereSimulacion(t)) simulacionId = null
  return { ok: true, pedido: { tipo: t, modo: m, simulacion_id: simulacionId } }
}

export interface SimulacionLeida {
  id: number
  vehiculo_id: number | null
  tipo: string
  modo: string
  estado: string
  /** Segundos desde finished_at (reloj de la DB); null si no terminó. */
  terminado_hace_s: number | null
  /** Ya hay un aplicar pendiente, en curso u ok que la usó. */
  usada: boolean
}

/**
 * Por qué una simulación NO habilita aplicar (texto para el 409), o null si
 * sirve: mismo coche y tipo, modo simular, estado ok, terminada hace < 30 min
 * y sin otro aplicar que ya la haya usado.
 */
export function motivoSimulacionInvalida(
  sim: SimulacionLeida | null,
  esperado: { vehiculoId: number; tipo: TipoTrabajo }
): string | null {
  if (!sim) return 'no existe'
  if (sim.vehiculo_id !== esperado.vehiculoId) return 'es de otro coche'
  if (sim.tipo !== esperado.tipo) return 'es de otra acción'
  if (sim.modo !== 'simular') return 'no es una simulación'
  if (sim.estado === 'pendiente' || sim.estado === 'en_curso')
    return 'todavía no terminó'
  if (sim.estado !== 'ok') return `terminó con estado «${sim.estado}»`
  if (
    sim.terminado_hace_s == null ||
    sim.terminado_hace_s >= SIMULACION_VIGENTE_MIN * 60
  )
    return `tiene más de ${SIMULACION_VIGENTE_MIN} minutos`
  if (sim.usada) return 'ya se aplicó (o se está aplicando)'
  return null
}

/** 10 s si hay pendientes o actividad en los últimos 15 min; si no, 45 s. */
export function proximoIntervalo(
  pendientes: number,
  segundosDesdeActividad: number | null
): number {
  if (pendientes > 0) return PROXIMO_ACTIVO_S
  if (
    segundosDesdeActividad != null &&
    segundosDesdeActividad < ACTIVIDAD_RECIENTE_S
  )
    return PROXIMO_ACTIVO_S
  return PROXIMO_REPOSO_S
}

/** Los últimos SALIDA_MAX_BYTES (UTF-8) de la consola, sin NUL (pg no los admite). */
export function recortarSalida(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).split('\u0000').join('')
  const buf = Buffer.from(s, 'utf8')
  if (buf.length <= SALIDA_MAX_BYTES) return s
  const aviso = '[… recortado]\n'
  const cola = buf
    .subarray(buf.length - (SALIDA_MAX_BYTES - Buffer.byteLength(aviso)))
    .toString('utf8')
    .replace(/^\uFFFD+/, '')
  return aviso + cola
}

const MAX_LINEAS_VERIFICAR = 200
const MAX_LARGO_LINEA = 2000

function normalizarLineas(v: unknown): string[] | null {
  if (v == null) return null
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : []
  const lineas = arr
    .map((l) =>
      String(l ?? '')
        .split('\u0000')
        .join('')
        .trim()
        .slice(0, MAX_LARGO_LINEA)
    )
    .filter(Boolean)
    .slice(0, MAX_LINEAS_VERIFICAR)
  return lineas.length ? lineas : null
}

/** Sólo http(s): la pantalla la muestra como enlace. */
function normalizarUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return /^https?:\/\//i.test(s) && s.length <= 2000 ? s : null
}

function textoCorto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, max)
  return s || null
}

export type ValidacionReclamo =
  | {
      ok: true
      reclamo: { worker: string; version: string | null; solo_latido: boolean }
    }
  | { ok: false; error: string }

export function validarReclamo(body: unknown): ValidacionReclamo {
  if (!esObjeto(body)) return { ok: false, error: 'body inválido' }
  const worker = textoCorto(body.worker, 100)
  if (!worker) return { ok: false, error: 'worker: requerido' }
  return {
    ok: true,
    reclamo: {
      worker,
      version: textoCorto(body.version, 200),
      solo_latido: body.solo_latido === true,
    },
  }
}

export interface ResultadoWorker {
  id: number
  worker: string | null
  rc: number
  salida: string | null
  para_verificar: string[] | null
  url: string | null
}

export type ValidacionResultado =
  | { ok: true; resultado: ResultadoWorker }
  | { ok: false; error: string }

export function validarResultado(body: unknown): ValidacionResultado {
  if (!esObjeto(body)) return { ok: false, error: 'body inválido' }
  const id = enteroPositivo(body.id)
  if (id == null) return { ok: false, error: 'id: debe ser un entero > 0' }
  const rc = typeof body.rc === 'number' ? body.rc : NaN
  if (!Number.isInteger(rc)) return { ok: false, error: 'rc: debe ser entero' }
  return {
    ok: true,
    resultado: {
      id,
      worker: textoCorto(body.worker, 100),
      rc,
      salida: recortarSalida(body.salida),
      para_verificar: normalizarLineas(body.para_verificar),
      url: normalizarUrl(body.url),
    },
  }
}

/**
 * Auth de la PC: X-Worker-Secret contra AUTOMATIZACIONES_WORKER_SECRET (nunca
 * ADMIN_SECRET). null = autorizado.
 */
export function autorizarWorker(request: Request): NextResponse | null {
  const secret = process.env.AUTOMATIZACIONES_WORKER_SECRET ?? ''
  if (!secret) {
    return NextResponse.json(
      { error: 'AUTOMATIZACIONES_WORKER_SECRET sin configurar' },
      { status: 503 }
    )
  }
  if (!safeEqual(request.headers.get('x-worker-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

function iso(v: unknown): string | null {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function aTrabajo(r: Record<string, unknown>): Trabajo {
  return {
    id: Number(r.id),
    vehiculo_id: numOrNull(r.vehiculo_id),
    referencia: (r.referencia as string | null) ?? null,
    matricula: (r.matricula as string | null) ?? null,
    tipo: r.tipo as TipoTrabajo,
    modo: r.modo as ModoTrabajo,
    simulacion_id: numOrNull(r.simulacion_id),
    estado: r.estado as EstadoTrabajo,
    rc: numOrNull(r.rc),
    salida: (r.salida as string | null) ?? null,
    para_verificar: Array.isArray(r.para_verificar)
      ? (r.para_verificar as unknown[]).map(String)
      : null,
    url: (r.url as string | null) ?? null,
    creado_por: numOrNull(r.creado_por),
    worker: (r.worker as string | null) ?? null,
    created_at: iso(r.created_at) ?? '',
    expira_at: iso(r.expira_at),
    started_at: iso(r.started_at),
    finished_at: iso(r.finished_at),
  }
}

/**
 * Pendientes vencidos → caducado. en_curso → error ("interrumpido", nunca se
 * reintenta solo) si lleva más de 30 min y su PC no dio latido en 5 min
 * (mientras corre, la PC late cada 60 s: un cambio de precio puede tardar
 * 2 × 20 min), o si lleva más de 60 min pase lo que pase. Sin vehiculoId,
 * toda la cola.
 */
export async function limpiarVencidos(vehiculoId?: number): Promise<void> {
  await pool.query(
    `WITH caducados AS (
       UPDATE automatizacion_trabajos
          SET estado = 'caducado', finished_at = NOW()
        WHERE estado = 'pendiente' AND expira_at <= NOW()
          AND ($1::int IS NULL OR vehiculo_id = $1::int)
       RETURNING id
     ), interrumpidos AS (
       UPDATE automatizacion_trabajos t
          SET estado = 'error', finished_at = NOW(), salida = $2
        WHERE t.estado = 'en_curso'
          AND ($1::int IS NULL OR t.vehiculo_id = $1::int)
          AND (t.started_at < NOW() - make_interval(mins => $4::int)
               OR (t.started_at < NOW() - make_interval(mins => $3::int)
                   AND NOT EXISTS (
                         SELECT 1 FROM automatizacion_workers w
                          WHERE w.nombre = t.worker
                            AND w.last_seen > NOW() - make_interval(mins => $5::int))))
       RETURNING t.id
     )
     SELECT (SELECT COUNT(*) FROM caducados)::int AS caducados,
            (SELECT COUNT(*) FROM interrumpidos)::int AS interrumpidos`,
    [
      vehiculoId ?? null,
      SALIDA_INTERRUMPIDO,
      INTERRUMPIDO_MIN,
      INTERRUMPIDO_TOPE_MIN,
      LATIDO_PERDIDO_MIN,
    ]
  )
}

export async function listarPorVehiculo(
  vehiculoId: number
): Promise<Trabajo[]> {
  await limpiarVencidos(vehiculoId)
  const res = await pool.query(
    `SELECT * FROM automatizacion_trabajos
      WHERE vehiculo_id = $1
      ORDER BY id DESC
      LIMIT $2`,
    [vehiculoId, HISTORIAL_MAX]
  )
  return res.rows.map(aTrabajo)
}

/** La PC que dio señal más recientemente; activa si fue hace < 2 min. */
export async function estadoWorker(): Promise<EstadoWorker> {
  const res = await pool.query(
    `SELECT nombre, last_seen, version,
            EXTRACT(EPOCH FROM NOW() - last_seen)::int AS hace_s,
            last_seen > NOW() - make_interval(secs => $1::int) AS activo
       FROM automatizacion_workers
      ORDER BY last_seen DESC
      LIMIT 1`,
    [WORKER_ACTIVO_S]
  )
  const r = res.rows[0]
  if (!r)
    return {
      nombre: null,
      last_seen: null,
      version: null,
      hace_s: null,
      activo: false,
    }
  return {
    nombre: r.nombre ?? null,
    last_seen: iso(r.last_seen),
    version: r.version ?? null,
    hace_s: numOrNull(r.hace_s),
    activo: r.activo === true,
  }
}

export interface VehiculoParaTrabajo {
  id: number
  referencia: string | null
  matricula: string | null
  tipo: string | null
}

/** Matrícula normalizada (sin espacios/guiones, mayúsculas) para el SEL de la PC. */
export async function leerVehiculoParaTrabajo(
  vehiculoId: number
): Promise<VehiculoParaTrabajo | null> {
  const res = await pool.query(
    `SELECT id, referencia, matricula, matricula_norm, tipo
       FROM "Vehiculo" WHERE id = $1`,
    [vehiculoId]
  )
  const r = res.rows[0]
  if (!r) return null
  const matricula =
    String(r.matricula_norm ?? '').trim() ||
    String(r.matricula ?? '')
      .replace(/[\s.-]/g, '')
      .toUpperCase()
  return {
    id: Number(r.id),
    referencia: String(r.referencia ?? '').trim() || null,
    matricula: matricula || null,
    tipo: r.tipo ?? null,
  }
}

export async function leerSimulacion(
  id: number
): Promise<SimulacionLeida | null> {
  const res = await pool.query(
    `SELECT t.id, t.vehiculo_id, t.tipo, t.modo, t.estado,
            EXTRACT(EPOCH FROM NOW() - t.finished_at)::int AS terminado_hace_s,
            EXISTS (
              SELECT 1 FROM automatizacion_trabajos a
               WHERE a.simulacion_id = t.id
                 AND a.estado IN ('pendiente', 'en_curso', 'ok')
            ) AS usada
       FROM automatizacion_trabajos t
      WHERE t.id = $1`,
    [id]
  )
  const r = res.rows[0]
  if (!r) return null
  return {
    id: Number(r.id),
    vehiculo_id: numOrNull(r.vehiculo_id),
    tipo: String(r.tipo),
    modo: String(r.modo),
    estado: String(r.estado),
    terminado_hace_s: numOrNull(r.terminado_hace_s),
    usada: r.usada === true,
  }
}

export interface NuevoTrabajo {
  vehiculoId: number
  referencia: string | null
  matricula: string | null
  tipo: TipoTrabajo
  modo: ModoTrabajo
  simulacionId: number | null
  creadoPor: number | null
}

export type ResultadoEncolar =
  | { ok: true; trabajo: Trabajo }
  | { ok: false; duplicado: true }

/**
 * Inserta el pedido (caduca a los 15 min). Si ya hay uno activo del mismo
 * coche y tipo, el índice único parcial lo rechaza → duplicado.
 */
export async function encolar(t: NuevoTrabajo): Promise<ResultadoEncolar> {
  await limpiarVencidos(t.vehiculoId)
  try {
    const res = await pool.query(
      `INSERT INTO automatizacion_trabajos
         (vehiculo_id, referencia, matricula, tipo, modo, simulacion_id,
          creado_por, expira_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               NOW() + make_interval(mins => $8::int))
       RETURNING *`,
      [
        t.vehiculoId,
        t.referencia,
        t.matricula,
        t.tipo,
        t.modo,
        t.simulacionId,
        t.creadoPor,
        CADUCA_MIN,
      ]
    )
    return { ok: true, trabajo: aTrabajo(res.rows[0]) }
  } catch (err) {
    if ((err as { code?: string })?.code === '23505')
      return { ok: false, duplicado: true }
    throw err
  }
}

/** Sólo un pendiente (la PC todavía no lo tomó). */
export async function cancelar(
  trabajoId: number,
  vehiculoId: number
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE automatizacion_trabajos
        SET estado = 'cancelado', finished_at = NOW()
      WHERE id = $1 AND vehiculo_id = $2 AND estado = 'pendiente'
      RETURNING id`,
    [trabajoId, vehiculoId]
  )
  return !!res.rows[0]
}

export async function latido(
  worker: string,
  version: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO automatizacion_workers (nombre, last_seen, version)
     VALUES ($1, NOW(), $2)
     ON CONFLICT (nombre) DO UPDATE
       SET last_seen = NOW(),
           version = COALESCE(EXCLUDED.version, automatizacion_workers.version)`,
    [worker, version]
  )
}

/**
 * Toma UN pendiente (el más viejo) y lo pasa a en_curso. Saltea el coche si
 * tiene otro trabajo en curso o un upsert de hojas reciente sin terminar
 * (publicar.py lee Base_Datos: correrlo antes leería el precio viejo). Los
 * umbrales del outbox (5 min pendiente, 10 min procesando) evitan que una
 * fila de hojas trabada bloquee el coche hasta que el pedido caduque.
 */
export async function reclamar(
  worker: string
): Promise<TrabajoParaWorker | null> {
  await limpiarVencidos()
  const res = await pool.query(
    `UPDATE automatizacion_trabajos t
        SET estado = 'en_curso', started_at = NOW(), worker = $1
      WHERE t.estado = 'pendiente'
        AND t.id = (
          SELECT c.id FROM automatizacion_trabajos c
           WHERE c.estado = 'pendiente' AND c.expira_at > NOW()
             AND NOT EXISTS (
                   SELECT 1 FROM automatizacion_trabajos e
                    WHERE e.estado = 'en_curso'
                      AND e.vehiculo_id = c.vehiculo_id)
             AND NOT EXISTS (
                   SELECT 1 FROM webhook_outbox o
                    WHERE o.tipo = $2
                      AND o.payload->>'vehiculoId' = c.vehiculo_id::text
                      AND ((o.estado = 'pendiente'
                            AND o.updated_at > NOW() - INTERVAL '5 minutes')
                        OR (o.estado = 'procesando'
                            AND o.updated_at > NOW() - INTERVAL '10 minutes')))
           ORDER BY c.id
           LIMIT 1
           FOR UPDATE SKIP LOCKED)
      RETURNING t.id, t.tipo, t.modo, t.referencia, t.matricula, t.vehiculo_id`,
    [worker, OUTBOX_SHEETS_VEHICULO]
  )
  const r = res.rows[0]
  if (!r) return null
  return {
    id: Number(r.id),
    tipo: r.tipo,
    modo: r.modo,
    referencia: r.referencia ?? null,
    matricula: r.matricula ?? null,
    vehiculo_id: numOrNull(r.vehiculo_id),
  }
}

/** true si el trabajo estaba en_curso y quedó ok (rc 0) o error. */
export async function registrarResultado(r: ResultadoWorker): Promise<boolean> {
  const res = await pool.query(
    `UPDATE automatizacion_trabajos
        SET estado = $2, rc = $3, salida = $4, para_verificar = $5::jsonb,
            url = $6, finished_at = NOW(), worker = COALESCE(worker, $7)
      WHERE id = $1 AND estado = 'en_curso'
      RETURNING id`,
    [
      r.id,
      r.rc === 0 ? 'ok' : 'error',
      r.rc,
      r.salida,
      r.para_verificar ? JSON.stringify(r.para_verificar) : null,
      r.url,
      r.worker,
    ]
  )
  return !!res.rows[0]
}

/** proximo_s para la PC según la cola (pendientes y última actividad). */
export async function calcularProximo(): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
            EXTRACT(EPOCH FROM NOW() - MAX(GREATEST(created_at, started_at, finished_at)))::int AS desde_s
       FROM automatizacion_trabajos
      WHERE estado IN ('pendiente', 'en_curso')
         OR created_at > NOW() - INTERVAL '2 hours'`
  )
  const r = res.rows[0] ?? {}
  return proximoIntervalo(Number(r.pendientes ?? 0), numOrNull(r.desde_s))
}
