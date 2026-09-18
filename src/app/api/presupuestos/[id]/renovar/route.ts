/**
 * POST /api/presupuestos/[id]/renovar — nuevo presupuesto para el mismo
 * contacto y las mismas opciones, con el precio y los parámetros de hoy.
 * El anterior conserva sus números como historial: si seguía vivo
 * (borrador/enviado/visto) pasa a anulado para que no queden dos enlaces.
 * Aceptados no se renuevan (409).
 */
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import { requireApiSession } from '@/lib/apiAuth'
import { urlPublicaPresupuesto } from '@/lib/presupuesto/enlaces'
import {
  actualizarPresupuesto,
  crearPresupuesto,
  leerPresupuesto,
} from '@/lib/presupuesto/repo'
import { construirPresupuesto, versionDe } from '@/lib/presupuesto/servicio'

const VIVOS = new Set(['borrador', 'enviado', 'visto'])

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  try {
    const p = await leerPresupuesto(id)
    if (!p) {
      return NextResponse.json(
        { error: 'Presupuesto no encontrado' },
        { status: 404 }
      )
    }
    if (p.estado === 'aceptado') {
      return NextResponse.json(
        { error: 'Presupuesto aceptado: no se puede renovar' },
        { status: 409 }
      )
    }
    const c = await construirPresupuesto(p.vehiculo_id, p.opciones)
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
    const nuevo = await crearPresupuesto({
      vehiculoId: p.vehiculo_id,
      interesadoId: p.interesado_id,
      clienteId: p.cliente_id,
      nombreCliente: p.nombre_cliente,
      telefono: p.telefono,
      email: p.email,
      opciones: p.opciones,
      calculo: c.calculo,
      version: versionDe(c.contexto),
      creadoPor: await nombreUsuario(auth.session.uid),
    })
    let anterior: { id: number; estado: string } = {
      id: p.id,
      estado: p.estado,
    }
    if (VIVOS.has(p.estado)) {
      await actualizarPresupuesto(p.id, { estado: 'anulado' })
      anterior = { id: p.id, estado: 'anulado' }
    }
    return NextResponse.json(
      {
        presupuesto: nuevo,
        urlPublica: urlPublicaPresupuesto(nuevo.token_publico),
        anterior,
      },
      { status: 201 }
    )
  } catch (e) {
    console.error('[presupuestos renovar]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
