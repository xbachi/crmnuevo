/**
 * GET/PUT /api/admin/presupuestos/parametros — parámetros del motor y tarifas
 * de financiación (solo admin). PUT: { parametros?: {...}, tarifa?: {...} }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/apiAuth'
import { esFechaYMD } from '@/lib/fechas'
import {
  cargarTarifaPorId,
  guardarParametros,
  guardarTarifa,
  listarParametros,
  listarTarifas,
  type TarifaRow,
} from '@/lib/presupuesto/repo'
import {
  PARAMETROS_DEFECTO,
  PLAZOS,
  type ParametrosPresupuesto,
} from '@/lib/presupuesto/tipos'

const NUMERICOS: ReadonlyArray<keyof ParametrosPresupuesto> = [
  'gestion',
  'tope_dto_base',
  'pct_normal',
  'pct_especial',
  'extension_umbral',
  'extension_precio_bajo',
  'extension_precio_alto',
  'validez_dias',
  'plazo_max_meses',
  'plazo_corto_max',
  'sustitucion_edad_max_meses',
  'extension_min_meses',
  'ratio_aviso',
]
const CLAVES = Object.keys(PARAMETROS_DEFECTO)
const MAX_NOMBRE_TARIFA = 80
const MAX_WHATSAPP = 30

function numeroFinito(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return typeof v !== 'boolean' && v !== '' && v != null && Number.isFinite(n)
    ? n
    : null
}

async function validarParametros(
  raw: unknown
): Promise<{ patch: Record<string, unknown>; errores: string[] }> {
  const errores: string[] = []
  const patch: Record<string, unknown> = {}
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { patch, errores: ['parametros: debe ser un objeto'] }
  }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!CLAVES.includes(k)) {
      errores.push(`${k}: parámetro desconocido`)
      continue
    }
    if ((NUMERICOS as readonly string[]).includes(k)) {
      const n = numeroFinito(v)
      if (n == null || n < 0) errores.push(`${k}: debe ser un número >= 0`)
      else patch[k] = n
    } else if (k === 'gp_bandas') {
      const ok =
        Array.isArray(v) &&
        v.length > 0 &&
        v.every(
          (b) =>
            Array.isArray(b) &&
            b.length === 2 &&
            (b[0] === null || (typeof b[0] === 'number' && b[0] > 0)) &&
            typeof b[1] === 'number' &&
            b[1] >= 0
        ) &&
        (v[v.length - 1] as unknown[])[0] === null
      if (!ok) {
        errores.push(
          'gp_bandas: array de [limite|null, importe] con último limite null'
        )
      } else patch[k] = v
    } else if (k === 'tarifa_sin_premium_id') {
      if (v === null || v === '') patch[k] = null
      else {
        const id = numeroFinito(v)
        if (id == null || !Number.isInteger(id) || id <= 0) {
          errores.push('tarifa_sin_premium_id: id inválido')
        } else if (!(await cargarTarifaPorId(id))) {
          errores.push('tarifa_sin_premium_id: la tarifa no existe')
        } else patch[k] = id
      }
    } else if (k === 'reserva_url_defecto') {
      const s = String(v ?? '').trim()
      if (!/^https?:\/\//i.test(s)) {
        errores.push('reserva_url_defecto: debe ser una URL http(s)')
      } else patch[k] = s
    } else if (k === 'whatsapp_empresa') {
      const s = String(v ?? '').trim()
      if (s.length > MAX_WHATSAPP) {
        errores.push(`whatsapp_empresa: máximo ${MAX_WHATSAPP} caracteres`)
      } else patch[k] = s
    }
  }
  return { patch, errores }
}

function validarTarifa(raw: unknown): {
  tarifa: Omit<TarifaRow, 'id'> & { id?: number }
  errores: string[]
} {
  const errores: string[] = []
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      tarifa: {
        nombre: '',
        entidad: null,
        tin: null,
        vigente_desde: null,
        vigente_hasta: null,
        coeficientes: {},
        activa: false,
      },
      errores: ['tarifa: debe ser un objeto'],
    }
  }
  const t = raw as Record<string, unknown>
  let id: number | undefined
  if (t.id != null) {
    const n = numeroFinito(t.id)
    if (n == null || !Number.isInteger(n) || n <= 0)
      errores.push('tarifa.id: inválido')
    else id = n
  }
  const nombre = String(t.nombre ?? '').trim()
  if (!nombre) errores.push('tarifa.nombre: obligatorio')
  else if (nombre.length > MAX_NOMBRE_TARIFA)
    errores.push(`tarifa.nombre: máximo ${MAX_NOMBRE_TARIFA} caracteres`)
  const entidad = String(t.entidad ?? '').trim() || null
  let tin: number | null = null
  if (t.tin != null && t.tin !== '') {
    tin = numeroFinito(t.tin)
    if (tin == null || tin < 0)
      errores.push('tarifa.tin: debe ser un número >= 0')
  }
  const fecha = (k: 'vigente_desde' | 'vigente_hasta'): string | null => {
    if (t[k] == null || t[k] === '') return null
    if (!esFechaYMD(t[k])) {
      errores.push(`tarifa.${k}: fecha YYYY-MM-DD`)
      return null
    }
    return t[k] as string
  }
  const vigente_desde = fecha('vigente_desde')
  const vigente_hasta = fecha('vigente_hasta')
  const coeficientes: Record<string, number> = {}
  const c = t.coeficientes
  if (c == null || typeof c !== 'object' || Array.isArray(c)) {
    errores.push('tarifa.coeficientes: debe ser un objeto {plazo: coeficiente}')
  } else {
    const plazos = PLAZOS.map(String)
    for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
      if (v === null || v === '') continue
      if (!plazos.includes(k)) {
        errores.push(`tarifa.coeficientes.${k}: plazo desconocido`)
        continue
      }
      const n = numeroFinito(v)
      if (n == null || n <= 0 || n >= 1) {
        errores.push(`tarifa.coeficientes.${k}: debe estar entre 0 y 1`)
      } else coeficientes[k] = n
    }
    if (!errores.length && Object.keys(coeficientes).length === 0) {
      errores.push('tarifa.coeficientes: al menos un plazo')
    }
  }
  if (typeof t.activa !== 'boolean') errores.push('tarifa.activa: booleano')
  return {
    tarifa: {
      id,
      nombre,
      entidad,
      tin,
      vigente_desde,
      vigente_hasta,
      coeficientes,
      activa: t.activa === true,
    },
    errores,
  }
}

async function respuesta() {
  const [parametros, tarifas] = await Promise.all([
    listarParametros(),
    listarTarifas(),
  ])
  return NextResponse.json({ parametros, tarifas })
}

export async function GET(request: NextRequest) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response
  try {
    return await respuesta()
  } catch (e) {
    console.error('[admin presupuestos parametros GET]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdminSession(request)
  if (auth.response) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) ?? {}
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (body.parametros === undefined && body.tarifa === undefined) {
    return NextResponse.json(
      { error: 'Nada que guardar: falta parametros o tarifa' },
      { status: 400 }
    )
  }

  try {
    const errores: string[] = []
    let patch: Record<string, unknown> = {}
    if (body.parametros !== undefined) {
      const r = await validarParametros(body.parametros)
      errores.push(...r.errores)
      patch = r.patch
    }
    let tarifa: ReturnType<typeof validarTarifa>['tarifa'] | null = null
    if (body.tarifa !== undefined) {
      const r = validarTarifa(body.tarifa)
      errores.push(...r.errores)
      tarifa = r.tarifa
    }
    if (errores.length) {
      return NextResponse.json(
        { error: 'Datos inválidos', errores },
        { status: 400 }
      )
    }
    if (tarifa) {
      try {
        await guardarTarifa(tarifa)
      } catch (e) {
        if ((e as { code?: string }).code === '23505') {
          return NextResponse.json(
            { error: 'Datos inválidos', errores: ['tarifa.nombre: ya existe'] },
            { status: 400 }
          )
        }
        throw e
      }
    }
    if (Object.keys(patch).length) await guardarParametros(patch)
    return await respuesta()
  } catch (e) {
    console.error('[admin presupuestos parametros PUT]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
