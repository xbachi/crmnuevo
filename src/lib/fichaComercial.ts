/**
 * Ficha comercial del vehículo (web y presupuesto): tabla
 * vehiculo_ficha_comercial + "Vehiculo"."precioPublicacion" (precio_contado es
 * un alias de esa columna: una sola fuente para el precio al público).
 */
import { pool } from '@/lib/direct-database'

export const REGIMENES = ['IVA21', 'REBU'] as const
export type Regimen = (typeof REGIMENES)[number]
export const TARIFAS = ['NORMAL', 'ESPECIAL', 'SIN_DTO', 'CONSULTAR'] as const
export type Tarifa = (typeof TARIFAS)[number]

export interface FichaComercial {
  regimen: Regimen | null
  nombre_comercial: string | null
  precio_contado: number | null
  url_imagen: string | null
  url_qr: string | null
  mantenimientos: string | null
  tarifa_financiacion: Tarifa | null
  garantia: boolean | null
  gp: number | null
  pct_dto: number | null
  meses_garantia_fabrica: number | null
  motor_cv: number | null
  motor_kw: number | null
  cubicaje: number | null
  plazas: number | null
  caja: string | null
  combustible: string | null
  updated_at?: string | null
}

/** Columnas propias de la tabla (precio_contado vive en "Vehiculo"). */
export const CAMPOS_FICHA = [
  'regimen',
  'nombre_comercial',
  'url_imagen',
  'url_qr',
  'mantenimientos',
  'tarifa_financiacion',
  'garantia',
  'gp',
  'pct_dto',
  'meses_garantia_fabrica',
  'motor_cv',
  'motor_kw',
  'cubicaje',
  'plazas',
  'caja',
  'combustible',
] as const

const TEXTOS = [
  'nombre_comercial',
  'url_imagen',
  'url_qr',
  'mantenimientos',
  'caja',
  'combustible',
] as const
const ENTEROS = [
  'meses_garantia_fabrica',
  'motor_cv',
  'motor_kw',
  'cubicaje',
  'plazas',
] as const

function vacio(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}

/** "12.485,50" → 12485.5, "0,07" → 0.07, 12 → 12; no numérico → null. */
export function parseNumeroFicha(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '')
    .trim()
    .replace(/[€%\s]/g, '')
  if (!s) return null
  let n: number
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    n = Number(s.replace(/\./g, '').replace(',', '.'))
  } else if (/^-?\d+(,\d+)?$/.test(s)) {
    n = Number(s.replace(',', '.'))
  } else if (/^-?\d+(\.\d+)?$/.test(s)) {
    n = Number(s)
  } else {
    return null
  }
  return Number.isFinite(n) ? n : null
}

function parseBooleano(v: unknown): boolean | null | undefined {
  if (typeof v === 'boolean') return v
  const s = String(v ?? '')
    .trim()
    .toUpperCase()
  if (s === 'SI' || s === 'SÍ' || s === 'TRUE' || s === '1') return true
  if (s === 'NO' || s === 'FALSE' || s === '0') return false
  return undefined
}

export type ValidacionFicha =
  | { ok: true; patch: Partial<FichaComercial> }
  | { ok: false; errores: string[] }

/**
 * Valida un body parcial (sólo entran las claves presentes; '' = null).
 * Rangos: precio_contado > 0, gp 0–2000, pct_dto 0–0,2, enteros >= 0.
 */
export function validarFicha(body: unknown): ValidacionFicha {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errores: ['body inválido'] }
  }
  const b = body as Record<string, unknown>
  const patch: Partial<FichaComercial> = {}
  const errores: string[] = []
  const numero = (k: string, v: unknown): number | null => {
    const n = parseNumeroFicha(v)
    if (n == null) errores.push(`${k}: no numérico`)
    return n
  }

  for (const k of TEXTOS) {
    if (!(k in b)) continue
    patch[k] = vacio(b[k]) ? null : String(b[k]).trim()
  }
  if ('regimen' in b) {
    if (vacio(b.regimen)) patch.regimen = null
    else if ((REGIMENES as readonly string[]).includes(String(b.regimen)))
      patch.regimen = b.regimen as Regimen
    else errores.push(`regimen: debe ser ${REGIMENES.join('|')}`)
  }
  if ('tarifa_financiacion' in b) {
    if (vacio(b.tarifa_financiacion)) patch.tarifa_financiacion = null
    else if (
      (TARIFAS as readonly string[]).includes(String(b.tarifa_financiacion))
    )
      patch.tarifa_financiacion = b.tarifa_financiacion as Tarifa
    else errores.push(`tarifa_financiacion: debe ser ${TARIFAS.join('|')}`)
  }
  if ('garantia' in b) {
    if (vacio(b.garantia)) patch.garantia = null
    else {
      const g = parseBooleano(b.garantia)
      if (g === undefined) errores.push('garantia: debe ser SI/NO')
      else patch.garantia = g
    }
  }
  if ('precio_contado' in b) {
    if (vacio(b.precio_contado)) patch.precio_contado = null
    else {
      const n = numero('precio_contado', b.precio_contado)
      if (n != null) {
        if (n > 0) patch.precio_contado = n
        else errores.push('precio_contado: debe ser > 0')
      }
    }
  }
  if ('gp' in b) {
    if (vacio(b.gp)) patch.gp = null
    else {
      const n = numero('gp', b.gp)
      if (n != null) {
        if (n >= 0 && n <= 2000) patch.gp = n
        else errores.push('gp: fuera de rango (0–2000)')
      }
    }
  }
  if ('pct_dto' in b) {
    if (vacio(b.pct_dto)) patch.pct_dto = null
    else {
      const n = numero('pct_dto', b.pct_dto)
      if (n != null) {
        if (n >= 0 && n <= 0.2) patch.pct_dto = n
        else errores.push('pct_dto: fuera de rango (0–0,2)')
      }
    }
  }
  for (const k of ENTEROS) {
    if (!(k in b)) continue
    if (vacio(b[k])) {
      patch[k] = null
      continue
    }
    const n = numero(k, b[k])
    if (n == null) continue
    if (Number.isInteger(n) && n >= 0) patch[k] = n
    else errores.push(`${k}: debe ser entero >= 0`)
  }
  if (errores.length) return { ok: false, errores }
  return { ok: true, patch }
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function leerFicha(
  vehiculoId: number
): Promise<FichaComercial | null> {
  const res = await pool.query(
    `SELECT v."precioPublicacion" AS precio_contado,
            f.regimen, f.nombre_comercial, f.url_imagen, f.url_qr, f.mantenimientos,
            f.tarifa_financiacion, f.garantia, f.gp, f.pct_dto,
            f.meses_garantia_fabrica, f.motor_cv, f.motor_kw, f.cubicaje,
            f.plazas, f.caja, f.combustible,
            f.updated_at
       FROM "Vehiculo" v
       LEFT JOIN vehiculo_ficha_comercial f ON f.vehiculo_id = v.id
      WHERE v.id = $1`,
    [vehiculoId]
  )
  const r = res.rows[0]
  if (!r) return null
  return {
    regimen: r.regimen ?? null,
    nombre_comercial: r.nombre_comercial ?? null,
    precio_contado: num(r.precio_contado),
    url_imagen: r.url_imagen ?? null,
    url_qr: r.url_qr ?? null,
    mantenimientos: r.mantenimientos ?? null,
    tarifa_financiacion: r.tarifa_financiacion ?? null,
    garantia: r.garantia ?? null,
    gp: num(r.gp),
    pct_dto: num(r.pct_dto),
    meses_garantia_fabrica: num(r.meses_garantia_fabrica),
    motor_cv: num(r.motor_cv),
    motor_kw: num(r.motor_kw),
    cubicaje: num(r.cubicaje),
    plazas: num(r.plazas),
    caja: r.caja ?? null,
    combustible: r.combustible ?? null,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  }
}

/** Upsert parcial: sólo las claves presentes en `patch`. Devuelve la ficha resultante. */
export async function guardarFicha(
  vehiculoId: number,
  patch: Partial<FichaComercial>
): Promise<FichaComercial | null> {
  if ('precio_contado' in patch) {
    const up = await pool.query(
      `UPDATE "Vehiculo" SET "precioPublicacion" = $2, "updatedAt" = NOW()
        WHERE id = $1 RETURNING id`,
      [vehiculoId, patch.precio_contado ?? null]
    )
    if (!up.rows[0]) return null
  }
  await escribirCamposFicha(vehiculoId, patch)
  return leerFicha(vehiculoId)
}

/**
 * Upsert de las columnas propias de vehiculo_ficha_comercial, sin leer de
 * vuelta. Lo usa el cron de fichas técnicas, que escribe varios campos de
 * muchos coches seguidos y no necesita la ficha resultante (el pool es
 * compartido: cada consulta de más cuenta).
 */
export async function escribirCamposFicha(
  vehiculoId: number,
  patch: Partial<FichaComercial>
): Promise<void> {
  const claves = CAMPOS_FICHA.filter((k) => k in patch)
  if (!claves.length) return
  const cols = claves.map((k) => `"${k}"`)
  const params: unknown[] = [vehiculoId, ...claves.map((k) => patch[k] ?? null)]
  const marcas = claves.map((_, i) => `$${i + 2}`)
  const sets = claves.map((k) => `"${k}" = EXCLUDED."${k}"`)
  await pool.query(
    `INSERT INTO vehiculo_ficha_comercial (vehiculo_id, ${cols.join(', ')})
       VALUES ($1, ${marcas.join(', ')})
       ON CONFLICT (vehiculo_id) DO UPDATE
         SET ${sets.join(', ')}, updated_at = NOW()`,
    params
  )
}
