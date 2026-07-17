/**
 * GET /api/fiscal/registro — bandeja de facturas de proveedor (lista + filtros).
 *
 * Es la pantalla de trabajo del cierre: 188 facturas reales, todas en estado
 * 'registrada' (existen como archivo, sin datos fiscales extraídos). El filtro
 * por estado es lo que convierte esa pila en una cola: `pendiente-validar` +
 * `extraida` es "lo que hay que mirar hoy", `duplicados=1` es "lo que puede estar
 * contado dos veces".
 *
 * `resumen.porEstado` va SIEMPRE con los filtros aplicados MENOS el de estado: es
 * la botonera de la UI (cuántas hay en cada estado dentro de este año/proveedor),
 * y si se filtrara también por estado mostraría siempre un solo botón con el
 * total de la vista actual — inútil para navegar.
 *
 * Los params desconocidos se ignoran en silencio (la UI agrega/quita filtros sin
 * coordinar deploys); los conocidos pero inválidos → 400, porque un `anio=abc`
 * silencioso devuelve la lista entera y el usuario cree que está filtrando.
 *
 * Todos los importes pasan por Number() (ver fiscalApi): pg devuelve NUMERIC como
 * string y ese bug ya rompió las fórmulas de costoBeneficio.
 *
 * Auth: sesión.
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import { serializarRegistro } from '@/lib/fiscalApi'

export const maxDuration = 30

const ESTADOS = [
  'registrada',
  'extraida',
  'pendiente-validar',
  'validada',
  'en-borrador',
  'declarada',
  'rectificada',
  'anulada',
] as const

const LIMIT_DEFAULT = 50
const LIMIT_MAX = 200

export async function GET(request: NextRequest) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const { searchParams } = new URL(request.url)
  const errores: string[] = []

  // ── estado (csv) ──────────────────────────────────────────────────────────
  let estados: string[] = []
  const estadoRaw = searchParams.get('estado')
  if (estadoRaw != null && estadoRaw.trim() !== '') {
    estados = estadoRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const malos = estados.filter((e) => !(ESTADOS as readonly string[]).includes(e))
    if (malos.length > 0) {
      errores.push(`estado inválido: ${malos.join(', ')} (válidos: ${ESTADOS.join(', ')})`)
    }
  }

  const entero = (name: string, min: number, max: number): number | null => {
    const raw = searchParams.get(name)
    if (raw == null || raw.trim() === '') return null
    const n = parseInt(raw, 10)
    if (!Number.isInteger(n) || n < min || n > max) {
      errores.push(`${name} inválido: "${raw}" (esperado entero entre ${min} y ${max})`)
      return null
    }
    return n
  }

  const anio = entero('anio', 2000, 2100)
  const trimestre = entero('trimestre', 1, 4)
  const proveedorId = entero('proveedorId', 1, Number.MAX_SAFE_INTEGER)
  const limit = entero('limit', 1, LIMIT_MAX) ?? LIMIT_DEFAULT
  const offset = entero('offset', 0, Number.MAX_SAFE_INTEGER) ?? 0
  const q = (searchParams.get('q') ?? '').trim()
  const soloDuplicados = searchParams.get('duplicados') === '1'

  if (errores.length > 0) {
    return NextResponse.json({ error: errores.join('; '), errores }, { status: 400 })
  }

  // ── WHERE compartido ──────────────────────────────────────────────────────
  // `comunes` = todos los filtros MENOS estado (los reusa el resumen).
  const comunes: string[] = []
  const vals: unknown[] = []
  const push = (sql: string, v: unknown) => {
    vals.push(v)
    comunes.push(sql.replace('$?', `$${vals.length}`))
  }

  if (anio != null) push('f.anio = $?', anio)
  if (trimestre != null) push('f.trimestre = $?', trimestre)
  if (proveedorId != null) push('f.proveedor_id = $?', proveedorId)
  if (soloDuplicados) comunes.push('f.posible_duplicado')
  if (q) {
    // Una sola búsqueda para los 3 campos que el humano tiene a mano: el número
    // que le dictan por teléfono, el archivo que ve en OneDrive, o la matrícula.
    vals.push(`%${q}%`)
    comunes.push(
      `(f.numero_factura ILIKE $${vals.length} OR f.nombre_archivo ILIKE $${vals.length} OR f.matricula ILIKE $${vals.length})`
    )
  }

  // Los params de `comunes` son los primeros de `vals`; el resumen usa solo esos.
  // Se fija ACÁ, antes de push-ear el estado: contarlos después es frágil porque
  // hay condiciones sin param (duplicados) y otras con param compartido (q).
  const comunesParams = vals.length

  const whereItems = [...comunes]
  if (estados.length > 0) {
    vals.push(estados)
    whereItems.push(`f.estado = ANY($${vals.length})`)
  }

  const sqlWhere = (conds: string[]) => (conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '')

  try {
    // Queries SECUENCIALES a propósito: el pool está capado a 1 conexión por
    // instancia de Vercel, así que un Promise.all acá se auto-deadlockearía.
    const items = await pool.query(
      `SELECT f.*,
              COUNT(*) OVER() AS total_filas,
              (SELECT COUNT(*) FROM facturas_registro_lineas l WHERE l.registro_id = f.id) AS lineas
         FROM facturas_registro f
         ${sqlWhere(whereItems)}
         ORDER BY f.fecha_factura DESC NULLS LAST, f.id DESC
         LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
      [...vals, limit, offset]
    )

    // COUNT(*) OVER() no vuelve si no hay filas → total 0 en ese caso.
    const total = items.rows.length > 0 ? Number(items.rows[0].total_filas) : 0

    const resumen = await pool.query(
      `SELECT f.estado, COUNT(*) AS n
         FROM facturas_registro f
         ${sqlWhere(comunes)}
         GROUP BY f.estado`,
      vals.slice(0, comunesParams)
    )

    const porEstado: Record<string, number> = {}
    for (const r of resumen.rows) porEstado[String(r.estado)] = Number(r.n)

    return NextResponse.json({
      total,
      items: items.rows.map(serializarRegistro),
      resumen: { porEstado },
    })
  } catch (err) {
    console.error('[fiscal/registro] GET:', (err as Error)?.message ?? err)
    return NextResponse.json({ error: 'No se pudo leer el registro de facturas' }, { status: 500 })
  }
}
