/**
 * GET /api/presupuestos/[id] — detalle + vehículo + URL pública.
 * PUT /api/presupuestos/[id] — edita cliente/opciones (recalcula con el
 * contexto actual y borra el PDF), anula, o marca enviado un borrador (el
 * comercial mandó el PDF por su cuenta). Aceptados/anulados: solo lectura.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/apiAuth'
import { urlPublicaPresupuesto } from '@/lib/presupuesto/enlaces'
import { actualizarPresupuesto, leerPresupuesto } from '@/lib/presupuesto/repo'
import {
  cargarVehiculoPresupuesto,
  construirPresupuesto,
  normalizarOpciones,
  versionDe,
} from '@/lib/presupuesto/servicio'

const MAX_NOMBRE = 120
const MAX_TELEFONO = 40
const MAX_EMAIL = 254
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

function textoOpcional(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s || null
}

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  try {
    const presupuesto = await leerPresupuesto(id)
    if (!presupuesto) {
      return NextResponse.json(
        { error: 'Presupuesto no encontrado' },
        { status: 404 }
      )
    }
    const v = await cargarVehiculoPresupuesto(presupuesto.vehiculo_id)
    return NextResponse.json({
      presupuesto,
      urlPublica: urlPublicaPresupuesto(presupuesto.token_publico),
      vehiculo: v
        ? {
            marca: v.marca,
            modelo: v.modelo,
            matricula: v.matricula,
            referencia: v.referencia,
          }
        : null,
    })
  } catch (e) {
    console.error('[presupuestos GET id]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) ?? {}
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  try {
    const actual = await leerPresupuesto(id)
    if (!actual) {
      return NextResponse.json(
        { error: 'Presupuesto no encontrado' },
        { status: 404 }
      )
    }
    const anular = body.estado === 'anulado'
    const marcarEnviado = body.estado === 'enviado'
    if (body.estado !== undefined && !anular && !marcarEnviado) {
      return NextResponse.json(
        { error: "estado: solo se admite 'anulado' o 'enviado'" },
        { status: 400 }
      )
    }
    if (marcarEnviado && actual.estado !== 'borrador') {
      return NextResponse.json(
        {
          error: `Presupuesto ${actual.estado}: solo un borrador se marca enviado`,
        },
        { status: 409 }
      )
    }
    if (
      actual.estado === 'aceptado' ||
      (actual.estado === 'anulado' && !anular)
    ) {
      return NextResponse.json(
        { error: `Presupuesto ${actual.estado}: no se puede modificar` },
        { status: 409 }
      )
    }

    const patch: Parameters<typeof actualizarPresupuesto>[1] = {}
    const errores: string[] = []
    if ('nombreCliente' in body) {
      const n = String(body.nombreCliente ?? '').trim()
      if (!n) errores.push('nombreCliente: obligatorio')
      else if (n.length > MAX_NOMBRE)
        errores.push(`nombreCliente: máximo ${MAX_NOMBRE} caracteres`)
      else patch.nombre_cliente = n
    }
    if ('telefono' in body) {
      const t = textoOpcional(body.telefono)
      if (t && t.length > MAX_TELEFONO)
        errores.push(`telefono: máximo ${MAX_TELEFONO} caracteres`)
      else patch.telefono = t
    }
    if ('email' in body) {
      const e = textoOpcional(body.email)
      if (e && (e.length > MAX_EMAIL || !RE_EMAIL.test(e)))
        errores.push('email: formato inválido')
      else patch.email = e
    }
    if ('opciones' in body) {
      const op = normalizarOpciones(body.opciones)
      if (!op.ok) errores.push(...op.errores)
      else {
        const c = await construirPresupuesto(actual.vehiculo_id, op.opciones)
        if ('error' in c) {
          return NextResponse.json(
            {
              error:
                c.error === 'SIN_PRECIO'
                  ? 'El vehículo no tiene precio contado en la ficha comercial'
                  : 'Vehículo no encontrado',
              code: c.error,
            },
            { status: c.error === 'SIN_PRECIO' ? 409 : 404 }
          )
        }
        patch.opciones = op.opciones
        patch.calculo = c.calculo
        patch.version_parametros = versionDe(c.contexto)
        patch.valido_hasta = c.calculo.validoHasta
        patch.tarifa_id = c.contexto.tarifaPremium.id
        patch.tarifa_sin_premium_id = c.contexto.tarifaSinPremium.id
        patch.pdf_url = null
        // Recalculado → nueva validez: un vencido vuelve a borrador.
        if (actual.estado === 'vencido') patch.estado = 'borrador'
      }
    }
    if (anular) patch.estado = 'anulado'
    if (marcarEnviado) {
      patch.estado = 'enviado'
      patch.enviado_at = new Date().toISOString()
    }
    if (errores.length) {
      return NextResponse.json(
        { error: 'Datos inválidos', errores },
        { status: 400 }
      )
    }

    const presupuesto = await actualizarPresupuesto(id, patch)
    return NextResponse.json({ presupuesto })
  } catch (e) {
    console.error('[presupuestos PUT id]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
