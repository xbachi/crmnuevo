/**
 * GET  /api/presupuestos — lista (filtros estado, vencidos, vehiculoId, q; paginación opcional).
 * POST /api/presupuestos — crea un presupuesto desde la ficha comercial del vehículo.
 */
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import { construirPagination, leerPaginacion } from '@/lib/listPagination'
import { urlPublicaPresupuesto } from '@/lib/presupuesto/enlaces'
import { crearPresupuesto, listarPresupuestos } from '@/lib/presupuesto/repo'
import {
  construirPresupuesto,
  normalizarOpciones,
  versionDe,
} from '@/lib/presupuesto/servicio'
import {
  ESTADOS_PRESUPUESTO,
  type EstadoPresupuesto,
} from '@/lib/presupuesto/tipos'

const LIMIT_SIN_PAGINACION = 200
const MAX_NOMBRE = 120
const MAX_TELEFONO = 40
const MAX_EMAIL = 254
const MAX_Q = 100
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Nombre visible de quien crea; best-effort, nunca bloquea. */
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

function enteroPositivo(v: unknown): number | null {
  const n = typeof v === 'string' ? parseInt(v, 10) : Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

function textoOpcional(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s || null
}

export async function GET(request: NextRequest) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const sp = new URL(request.url).searchParams
  const estadoRaw = sp.get('estado')
  const estado =
    estadoRaw && (ESTADOS_PRESUPUESTO as readonly string[]).includes(estadoRaw)
      ? (estadoRaw as EstadoPresupuesto)
      : undefined
  const vehiculoId = enteroPositivo(sp.get('vehiculoId')) ?? undefined
  const pag = leerPaginacion(sp)
  const q = sp.get('q')?.trim() || undefined
  if (q && q.length > MAX_Q) {
    return NextResponse.json(
      { error: 'Datos inválidos', errores: [`q: máximo ${MAX_Q} caracteres`] },
      { status: 400 }
    )
  }

  try {
    const { rows, total } = await listarPresupuestos({
      estado,
      vencidos: sp.get('vencidos') === 'true',
      vehiculoId,
      q,
      limit: pag?.limit ?? LIMIT_SIN_PAGINACION,
      offset: pag?.offset ?? 0,
    })
    const presupuestos = rows.map((r) => ({
      ...r,
      urlPublica: urlPublicaPresupuesto(r.token_publico),
    }))
    return NextResponse.json(
      pag
        ? {
            presupuestos,
            pagination: construirPagination(total, pag.page, pag.limit),
          }
        : { presupuestos }
    )
  } catch (e) {
    console.error('[presupuestos GET]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) ?? {}
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const errores: string[] = []
  const vehiculoId = enteroPositivo(body.vehiculoId)
  if (!vehiculoId) errores.push('vehiculoId: obligatorio')
  const nombreCliente = String(body.nombreCliente ?? '').trim()
  if (!nombreCliente) errores.push('nombreCliente: obligatorio')
  else if (nombreCliente.length > MAX_NOMBRE)
    errores.push(`nombreCliente: máximo ${MAX_NOMBRE} caracteres`)
  const telefono = textoOpcional(body.telefono)
  if (telefono && telefono.length > MAX_TELEFONO)
    errores.push(`telefono: máximo ${MAX_TELEFONO} caracteres`)
  const email = textoOpcional(body.email)
  if (email && (email.length > MAX_EMAIL || !RE_EMAIL.test(email)))
    errores.push('email: formato inválido')
  const interesadoId =
    body.interesadoId == null ? null : enteroPositivo(body.interesadoId)
  if (body.interesadoId != null && !interesadoId)
    errores.push('interesadoId: inválido')
  const clienteId =
    body.clienteId == null ? null : enteroPositivo(body.clienteId)
  if (body.clienteId != null && !clienteId) errores.push('clienteId: inválido')
  const opciones = normalizarOpciones(body.opciones ?? {})
  if (!opciones.ok) errores.push(...opciones.errores)
  if (errores.length || !opciones.ok || !vehiculoId) {
    return NextResponse.json(
      { error: 'Datos inválidos', errores },
      { status: 400 }
    )
  }

  try {
    const c = await construirPresupuesto(vehiculoId, opciones.opciones)
    if ('error' in c) {
      if (c.error === 'VEHICULO_NO_ENCONTRADO') {
        return NextResponse.json(
          { error: 'Vehículo no encontrado' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        {
          error: 'El vehículo no tiene precio contado en la ficha comercial',
          code: 'SIN_PRECIO',
        },
        { status: 409 }
      )
    }
    const presupuesto = await crearPresupuesto({
      vehiculoId,
      interesadoId,
      clienteId,
      nombreCliente,
      telefono,
      email,
      opciones: opciones.opciones,
      calculo: c.calculo,
      version: versionDe(c.contexto),
      creadoPor: await nombreUsuario(auth.session.uid),
    })
    return NextResponse.json(
      {
        presupuesto,
        urlPublica: urlPublicaPresupuesto(presupuesto.token_publico),
      },
      { status: 201 }
    )
  } catch (e) {
    console.error('[presupuestos POST]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
