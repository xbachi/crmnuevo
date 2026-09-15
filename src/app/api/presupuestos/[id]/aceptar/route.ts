/**
 * POST /api/presupuestos/[id]/aceptar — body { columna: 'premium'|'sin_premium', clienteId? }.
 * Con cliente: crea el deal y lo pasa a reservado (updateDeal reserva el
 * vehículo). Sin cliente: marca aceptado y manda al wizard con el vehículo.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/apiAuth'
import {
  createDeal,
  pool,
  updateDeal,
  type DealCreateData,
} from '@/lib/direct-database'
import { puedePreseleccionarVehiculo } from '@/lib/dealWizard'
import { actualizarPresupuesto, leerPresupuesto } from '@/lib/presupuesto/repo'
import { cargarVehiculoPresupuesto } from '@/lib/presupuesto/servicio'
import type { ColumnaClave } from '@/lib/presupuesto/tipos'

const COLUMNAS = ['premium', 'sin_premium'] as const

function parseId(raw: unknown): number | null {
  const id = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw)
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

  let body: Record<string, unknown>
  try {
    body = (await request.json()) ?? {}
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (!(COLUMNAS as readonly string[]).includes(String(body.columna))) {
    return NextResponse.json(
      { error: `columna: debe ser ${COLUMNAS.join('|')}` },
      { status: 400 }
    )
  }
  const columna = body.columna as ColumnaClave
  if (body.clienteId != null && !parseId(body.clienteId)) {
    return NextResponse.json({ error: 'clienteId: inválido' }, { status: 400 })
  }

  try {
    const p = await leerPresupuesto(id)
    if (!p) {
      return NextResponse.json(
        { error: 'Presupuesto no encontrado' },
        { status: 404 }
      )
    }
    if (['aceptado', 'anulado', 'vencido'].includes(p.estado)) {
      return NextResponse.json(
        { error: `Presupuesto ${p.estado}: no se puede aceptar` },
        { status: 409 }
      )
    }
    if (p.deal_id != null) {
      return NextResponse.json(
        { error: 'Ya tiene un deal asociado', dealId: p.deal_id },
        { status: 409 }
      )
    }
    const v = await cargarVehiculoPresupuesto(p.vehiculo_id)
    if (!v) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }
    if (!puedePreseleccionarVehiculo(v)) {
      return NextResponse.json(
        {
          error: 'El vehículo ya está reservado o vendido',
          code: 'VEHICULO_NO_DISPONIBLE',
        },
        { status: 409 }
      )
    }

    const clienteId =
      body.clienteId != null ? parseId(body.clienteId) : p.cliente_id
    const aceptadoAt = new Date().toISOString()

    if (!clienteId) {
      await actualizarPresupuesto(id, {
        estado: 'aceptado',
        aceptado_at: aceptadoAt,
      })
      return NextResponse.json({
        deal: null,
        url: `/deals/nuevo?vehiculoId=${p.vehiculo_id}`,
      })
    }

    let deal: Awaited<ReturnType<typeof createDeal>>
    try {
      deal = await createDeal({
        clienteId,
        vehiculoId: p.vehiculo_id,
        importeTotal: p.calculo.columnas[columna].total,
        financiacion: p.calculo.financiable,
        observaciones: `Presupuesto ${p.numero} (${columna})`,
        responsableComercial: await nombreUsuario(auth.session.uid),
      })
    } catch (e) {
      if ((e as { code?: string }).code === '23503') {
        return NextResponse.json(
          { error: 'Cliente no encontrado' },
          { status: 404 }
        )
      }
      throw e
    }
    // Enlazar ya el deal: si la reserva falla no se puede volver a crear otro.
    await actualizarPresupuesto(id, { deal_id: deal.id })
    try {
      // updateDeal lee `estado` del patch aunque DealCreateData no lo tipa.
      await updateDeal(deal.id, {
        estado: 'reservado',
      } as unknown as Partial<DealCreateData>)
    } catch (e) {
      console.error('[presupuestos aceptar] deal creado pero no reservado', e)
      return NextResponse.json(
        {
          error: 'Deal creado pero no se pudo reservar el vehículo',
          deal: { id: deal.id, numero: deal.numero },
        },
        { status: 502 }
      )
    }
    await actualizarPresupuesto(id, {
      estado: 'aceptado',
      aceptado_at: aceptadoAt,
      deal_id: deal.id,
      cliente_id: clienteId,
    })
    return NextResponse.json({
      deal: { id: deal.id, numero: deal.numero },
      url: `/deals/${deal.id}`,
    })
  } catch (e) {
    console.error('[presupuestos aceptar]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
