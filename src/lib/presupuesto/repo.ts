/**
 * Acceso a datos de presupuestos (server-only: pg + crypto).
 * Numeración propia P-AAAA-NNNN en presupuesto_numeracion; nunca next_number.
 */
import { randomBytes } from 'crypto'
import { pool } from '@/lib/direct-database'
import { dateToYMD } from '@/lib/fechas'
import { hoyMadrid } from './calculo'
import {
  PARAMETROS_DEFECTO,
  type EstadoPresupuesto,
  type OpcionesPresupuesto,
  type ParametrosPresupuesto,
  type ResultadoCalculo,
  type TarifaCalculo,
} from './tipos'

export interface TarifaRow {
  id: number
  nombre: string
  entidad: string | null
  tin: number | null
  vigente_desde: string | null
  vigente_hasta: string | null
  coeficientes: Record<string, number>
  activa: boolean
}

export interface VersionParametros {
  params: ParametrosPresupuesto
  tarifaPremium: TarifaCalculo
  tarifaSinPremium: TarifaCalculo
}

export interface ContextoCalculo extends VersionParametros {
  hoy: string
}

export interface PresupuestoRow {
  id: number
  numero: string
  vehiculo_id: number
  interesado_id: number | null
  cliente_id: number | null
  nombre_cliente: string
  telefono: string | null
  email: string | null
  opciones: OpcionesPresupuesto
  calculo: ResultadoCalculo
  tarifa_id: number | null
  tarifa_sin_premium_id: number | null
  version_parametros: VersionParametros
  pdf_url: string | null
  token_publico: string
  estado: EstadoPresupuesto
  valido_hasta: string
  visto_at: string | null
  aceptado_at: string | null
  enviado_at: string | null
  deal_id: number | null
  creado_por: string | null
  created_at: string
  updated_at: string
}

export interface FiltrosLista {
  estado?: EstadoPresupuesto
  vencidos?: boolean
  vehiculoId?: number
  q?: string
  limit: number
  offset: number
}

export interface ResumenPresupuesto
  extends Pick<
    PresupuestoRow,
    | 'id'
    | 'numero'
    | 'vehiculo_id'
    | 'nombre_cliente'
    | 'telefono'
    | 'email'
    | 'estado'
    | 'valido_hasta'
    | 'pdf_url'
    | 'token_publico'
    | 'created_at'
    | 'enviado_at'
    | 'visto_at'
    | 'aceptado_at'
  > {
  marca: string
  modelo: string
  matricula: string
  total_sin_premium: number
  total_premium: number
  desde_premium: number | null
}

type PatchPresupuesto = Partial<
  Pick<
    PresupuestoRow,
    | 'nombre_cliente'
    | 'telefono'
    | 'email'
    | 'opciones'
    | 'calculo'
    | 'version_parametros'
    | 'pdf_url'
    | 'estado'
    | 'valido_hasta'
    | 'enviado_at'
    | 'aceptado_at'
    | 'deal_id'
    | 'cliente_id'
    | 'tarifa_id'
    | 'tarifa_sin_premium_id'
  >
>

const COLUMNAS_JSONB = new Set(['opciones', 'calculo', 'version_parametros'])
const COLUMNAS_PATCH = new Set<string>([
  'nombre_cliente',
  'telefono',
  'email',
  'opciones',
  'calculo',
  'version_parametros',
  'pdf_url',
  'estado',
  'valido_hasta',
  'enviado_at',
  'aceptado_at',
  'deal_id',
  'cliente_id',
  'tarifa_id',
  'tarifa_sin_premium_id',
])
const CLAVES_PARAMETROS = Object.keys(PARAMETROS_DEFECTO) as Array<
  keyof ParametrosPresupuesto
>

export function generarToken(): string {
  return randomBytes(24).toString('base64url')
}

export function numeroPresupuesto(anio: number, n: number): string {
  return `P-${anio}-${String(n).padStart(4, '0')}`
}

function iso(v: unknown): string | null {
  if (v == null) return null
  return v instanceof Date ? v.toISOString() : String(v)
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function mapTarifa(r: Record<string, unknown>): TarifaRow {
  return {
    id: Number(r.id),
    nombre: String(r.nombre),
    entidad: r.entidad == null ? null : String(r.entidad),
    tin: numOrNull(r.tin),
    vigente_desde: dateToYMD(r.vigente_desde),
    vigente_hasta: dateToYMD(r.vigente_hasta),
    coeficientes: (r.coeficientes ?? {}) as Record<string, number>,
    activa: !!r.activa,
  }
}

function mapPresupuesto(r: Record<string, unknown>): PresupuestoRow {
  return {
    ...(r as unknown as PresupuestoRow),
    valido_hasta: dateToYMD(r.valido_hasta) ?? '',
    visto_at: iso(r.visto_at),
    aceptado_at: iso(r.aceptado_at),
    enviado_at: iso(r.enviado_at),
    created_at: iso(r.created_at) ?? '',
    updated_at: iso(r.updated_at) ?? '',
  }
}

function aTarifaCalculo(t: TarifaRow): TarifaCalculo {
  return { id: t.id, nombre: t.nombre, coeficientes: t.coeficientes }
}

// ── Parámetros ──────────────────────────────────────────────────────────────

export async function cargarParametros(): Promise<ParametrosPresupuesto> {
  const r = await pool.query('SELECT clave, valor FROM presupuesto_parametros')
  const out: Record<string, unknown> = { ...PARAMETROS_DEFECTO }
  for (const row of r.rows as Array<{ clave: string; valor: unknown }>) {
    if ((CLAVES_PARAMETROS as string[]).includes(row.clave)) {
      out[row.clave] = row.valor
    }
  }
  return out as unknown as ParametrosPresupuesto
}

export async function listarParametros(): Promise<
  Array<{
    clave: string
    valor: unknown
    descripcion: string | null
    updated_at: string
  }>
> {
  const r = await pool.query(
    'SELECT clave, valor, descripcion, updated_at FROM presupuesto_parametros ORDER BY clave'
  )
  return r.rows.map((row) => ({
    clave: String(row.clave),
    valor: row.valor,
    descripcion: row.descripcion == null ? null : String(row.descripcion),
    updated_at: iso(row.updated_at) ?? '',
  }))
}

/** UPSERT por clave; ignora claves desconocidas. */
export async function guardarParametros(
  patch: Record<string, unknown>
): Promise<void> {
  const entradas = Object.entries(patch).filter(([k]) =>
    (CLAVES_PARAMETROS as string[]).includes(k)
  )
  if (entradas.length === 0) return
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [clave, valor] of entradas) {
      await client.query(
        `INSERT INTO presupuesto_parametros (clave, valor)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
        [clave, JSON.stringify(valor ?? null)]
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// ── Tarifas ─────────────────────────────────────────────────────────────────

export async function listarTarifas(): Promise<TarifaRow[]> {
  const r = await pool.query(
    'SELECT * FROM tarifas_financiacion ORDER BY activa DESC, vigente_desde DESC NULLS LAST, id DESC'
  )
  return r.rows.map(mapTarifa)
}

export async function cargarTarifaActiva(): Promise<TarifaRow> {
  const r = await pool.query(
    'SELECT * FROM tarifas_financiacion WHERE activa LIMIT 1'
  )
  if (r.rows.length === 0) throw new Error('Sin tarifa activa')
  return mapTarifa(r.rows[0])
}

export async function cargarTarifaPorId(id: number): Promise<TarifaRow | null> {
  const r = await pool.query(
    'SELECT * FROM tarifas_financiacion WHERE id = $1',
    [id]
  )
  return r.rows.length ? mapTarifa(r.rows[0]) : null
}

/** INSERT/UPDATE; si activa=true desactiva el resto (índice único parcial). */
export async function guardarTarifa(
  t: Omit<TarifaRow, 'id'> & { id?: number }
): Promise<TarifaRow> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const coef = JSON.stringify(t.coeficientes ?? {})
    let row: Record<string, unknown>
    if (t.id != null) {
      if (t.activa) {
        await client.query(
          'UPDATE tarifas_financiacion SET activa = false WHERE id <> $1 AND activa',
          [t.id]
        )
      }
      const r = await client.query(
        `UPDATE tarifas_financiacion
            SET nombre = $2, entidad = $3, tin = $4, vigente_desde = $5,
                vigente_hasta = $6, coeficientes = $7::jsonb, activa = $8
          WHERE id = $1 RETURNING *`,
        [
          t.id,
          t.nombre,
          t.entidad,
          t.tin,
          t.vigente_desde,
          t.vigente_hasta,
          coef,
          t.activa,
        ]
      )
      if (r.rows.length === 0) throw new Error('Tarifa no encontrada')
      row = r.rows[0]
    } else {
      if (t.activa) {
        await client.query(
          'UPDATE tarifas_financiacion SET activa = false WHERE activa'
        )
      }
      const r = await client.query(
        `INSERT INTO tarifas_financiacion
           (nombre, entidad, tin, vigente_desde, vigente_hasta, coeficientes, activa)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
        [
          t.nombre,
          t.entidad,
          t.tin,
          t.vigente_desde,
          t.vigente_hasta,
          coef,
          t.activa,
        ]
      )
      row = r.rows[0]
    }
    await client.query('COMMIT')
    return mapTarifa(row)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function cargarContextoCalculo(
  hoy = hoyMadrid()
): Promise<ContextoCalculo> {
  const [params, activa] = await Promise.all([
    cargarParametros(),
    cargarTarifaActiva(),
  ])
  const idSin = params.tarifa_sin_premium_id
  const sinPremium =
    idSin != null && idSin !== activa.id
      ? ((await cargarTarifaPorId(idSin)) ?? activa)
      : activa
  return {
    hoy,
    params,
    tarifaPremium: aTarifaCalculo(activa),
    tarifaSinPremium: aTarifaCalculo(sinPremium),
  }
}

// ── Presupuestos ────────────────────────────────────────────────────────────

export interface CrearPresupuestoInput {
  vehiculoId: number
  interesadoId?: number | null
  clienteId?: number | null
  nombreCliente: string
  telefono?: string | null
  email?: string | null
  opciones: OpcionesPresupuesto
  calculo: ResultadoCalculo
  version: VersionParametros
  creadoPor: string | null
}

export async function crearPresupuesto(
  input: CrearPresupuestoInput
): Promise<PresupuestoRow> {
  const anio = Number(input.calculo.hoy.slice(0, 4))
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const num = await client.query(
      `INSERT INTO presupuesto_numeracion (anio, ultimo) VALUES ($1, 1)
       ON CONFLICT (anio) DO UPDATE SET ultimo = presupuesto_numeracion.ultimo + 1
       RETURNING ultimo`,
      [anio]
    )
    const numero = numeroPresupuesto(anio, Number(num.rows[0].ultimo))
    const r = await client.query(
      `INSERT INTO presupuestos
         (numero, vehiculo_id, interesado_id, cliente_id, nombre_cliente, telefono, email,
          opciones, calculo, tarifa_id, tarifa_sin_premium_id, version_parametros,
          token_publico, valido_hasta, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12::jsonb,
               $13, $14, $15)
       RETURNING *`,
      [
        numero,
        input.vehiculoId,
        input.interesadoId ?? null,
        input.clienteId ?? null,
        input.nombreCliente,
        input.telefono ?? null,
        input.email ?? null,
        JSON.stringify(input.opciones),
        JSON.stringify(input.calculo),
        input.version.tarifaPremium.id,
        input.version.tarifaSinPremium.id,
        JSON.stringify(input.version),
        generarToken(),
        input.calculo.validoHasta,
        input.creadoPor,
      ]
    )
    await client.query('COMMIT')
    return mapPresupuesto(r.rows[0])
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function leerPresupuesto(
  id: number
): Promise<PresupuestoRow | null> {
  const r = await pool.query('SELECT * FROM presupuestos WHERE id = $1', [id])
  return r.rows.length ? mapPresupuesto(r.rows[0]) : null
}

export async function leerPorToken(
  token: string
): Promise<PresupuestoRow | null> {
  const r = await pool.query(
    'SELECT * FROM presupuestos WHERE token_publico = $1',
    [token]
  )
  return r.rows.length ? mapPresupuesto(r.rows[0]) : null
}

export async function listarPresupuestos(
  f: FiltrosLista
): Promise<{ rows: ResumenPresupuesto[]; total: number }> {
  const where: string[] = []
  const vals: unknown[] = []
  const add = (v: unknown) => {
    vals.push(v)
    return `$${vals.length}`
  }
  if (f.estado) where.push(`p.estado = ${add(f.estado)}`)
  if (f.vencidos) {
    where.push(
      `p.estado IN ('enviado','visto') AND p.valido_hasta < CURRENT_DATE`
    )
  }
  if (f.vehiculoId != null) where.push(`p.vehiculo_id = ${add(f.vehiculoId)}`)
  if (f.q && f.q.trim()) {
    const like = add(`%${f.q.trim()}%`)
    where.push(
      `(p.numero ILIKE ${like} OR p.nombre_cliente ILIKE ${like}
        OR v.matricula ILIKE ${like} OR (v.marca || ' ' || v.modelo) ILIKE ${like})`
    )
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const from = `FROM presupuestos p JOIN "Vehiculo" v ON v.id = p.vehiculo_id ${sqlWhere}`

  const total = await pool.query(`SELECT COUNT(*)::int AS n ${from}`, vals)
  const limit = add(f.limit)
  const offset = add(f.offset)
  const r = await pool.query(
    `SELECT p.id, p.numero, p.vehiculo_id, p.nombre_cliente, p.telefono, p.email,
            p.estado, p.valido_hasta, p.pdf_url, p.token_publico, p.created_at,
            p.enviado_at, p.visto_at, p.aceptado_at,
            v.marca, v.modelo, v.matricula,
            (p.calculo->'columnas'->'sin_premium'->>'total')::numeric AS total_sin_premium,
            (p.calculo->'columnas'->'premium'->>'total')::numeric AS total_premium,
            (p.calculo->'columnas'->'premium'->>'desde')::numeric AS desde_premium
       ${from}
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    vals
  )
  const rows: ResumenPresupuesto[] = r.rows.map((row) => ({
    id: Number(row.id),
    numero: String(row.numero),
    vehiculo_id: Number(row.vehiculo_id),
    nombre_cliente: String(row.nombre_cliente),
    telefono: row.telefono ?? null,
    email: row.email ?? null,
    estado: row.estado as EstadoPresupuesto,
    valido_hasta: dateToYMD(row.valido_hasta) ?? '',
    pdf_url: row.pdf_url ?? null,
    token_publico: String(row.token_publico),
    created_at: iso(row.created_at) ?? '',
    enviado_at: iso(row.enviado_at),
    visto_at: iso(row.visto_at),
    aceptado_at: iso(row.aceptado_at),
    marca: row.marca ?? '',
    modelo: row.modelo ?? '',
    matricula: row.matricula ?? '',
    total_sin_premium: numOrNull(row.total_sin_premium) ?? 0,
    total_premium: numOrNull(row.total_premium) ?? 0,
    desde_premium: numOrNull(row.desde_premium),
  }))
  return { rows, total: Number(total.rows[0]?.n ?? 0) }
}

export async function actualizarPresupuesto(
  id: number,
  patch: PatchPresupuesto
): Promise<PresupuestoRow | null> {
  const sets: string[] = []
  const vals: unknown[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (!COLUMNAS_PATCH.has(k)) throw new Error(`Columna no permitida: ${k}`)
    vals.push(COLUMNAS_JSONB.has(k) ? JSON.stringify(v) : v)
    sets.push(`${k} = $${vals.length}${COLUMNAS_JSONB.has(k) ? '::jsonb' : ''}`)
  }
  if (sets.length === 0) return leerPresupuesto(id)
  vals.push(id)
  const r = await pool.query(
    `UPDATE presupuestos SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${vals.length} RETURNING *`,
    vals
  )
  return r.rows.length ? mapPresupuesto(r.rows[0]) : null
}

export async function marcarVisto(token: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE presupuestos
        SET visto_at = COALESCE(visto_at, NOW()),
            estado = CASE WHEN estado = 'enviado' THEN 'visto' ELSE estado END,
            updated_at = NOW()
      WHERE token_publico = $1 AND estado <> 'anulado' RETURNING id`,
    [token]
  )
  return r.rows.length > 0
}

export async function marcarVencidos(): Promise<number> {
  const r = await pool.query(
    `UPDATE presupuestos SET estado = 'vencido', updated_at = NOW()
      WHERE estado IN ('enviado','visto') AND valido_hasta < CURRENT_DATE`
  )
  return r.rowCount ?? 0
}
