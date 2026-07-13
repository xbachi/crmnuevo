import { NextRequest, NextResponse } from 'next/server'
import {
  listVentasB2BByCliente,
  createVentaB2B,
  getClienteB2BById,
  marcarVehiculoDeVentaB2BVendido,
  type FormaPagoB2B,
} from '@/lib/b2b-database'
import { pool } from '@/lib/direct-database'

async function parseId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id: raw } = await params
  const n = parseInt(raw, 10)
  return Number.isNaN(n) ? null : n
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = await parseId(params)
  if (id == null) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    const rows = await listVentasB2BByCliente(id)
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[GET /api/clientes-b2b/[id]/ventas]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = await parseId(params)
  if (id == null) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  try {
    const cliente = await getClienteB2BById(id)
    if (!cliente) {
      return NextResponse.json(
        { error: 'Cliente B2B no encontrado' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const forma_pago = body.forma_pago as FormaPagoB2B
    const precio_venta = parseFloat(body.precio_venta)

    if (!['transferencia', 'efectivo', 'financiado', 'otro'].includes(forma_pago)) {
      return NextResponse.json(
        { error: 'forma_pago inválida' },
        { status: 400 }
      )
    }
    if (!Number.isFinite(precio_venta) || precio_venta <= 0) {
      return NextResponse.json(
        { error: 'precio_venta debe ser un número positivo' },
        { status: 400 }
      )
    }
    if (!body.vehiculo_marca || !body.vehiculo_modelo || !body.vehiculo_matricula) {
      return NextResponse.json(
        { error: 'Datos del vehículo incompletos (marca, modelo, matrícula)' },
        { status: 400 }
      )
    }

    const created = await createVentaB2B({
      cliente_b2b_id: id,
      vehiculo_id: body.vehiculo_id ? parseInt(body.vehiculo_id) : null,
      vehiculo_marca: body.vehiculo_marca,
      vehiculo_modelo: body.vehiculo_modelo,
      vehiculo_matricula: body.vehiculo_matricula,
      vehiculo_bastidor: body.vehiculo_bastidor || null,
      vehiculo_kms:
        body.vehiculo_kms != null && body.vehiculo_kms !== ''
          ? parseInt(body.vehiculo_kms)
          : null,
      vehiculo_anio:
        body.vehiculo_anio != null && body.vehiculo_anio !== ''
          ? parseInt(body.vehiculo_anio)
          : null,
      vehiculo_fecha_matriculacion: body.vehiculo_fecha_matriculacion || null,
      fecha_venta: body.fecha_venta || new Date().toISOString().slice(0, 10),
      lugar_venta: body.lugar_venta || 'Alaquàs',
      precio_venta,
      forma_pago,
      notas: body.notas || null,
      notas_estado_vehiculo: body.notas_estado_vehiculo || null,
    })

    // La venta B2B no tiene reserva: crearla YA es vender. Mismo efecto que el
    // Deal retail al pasar a 'vendido' — si no, el coche sigue en stock.
    await marcarVehiculoDeVentaB2BVendido(pool, {
      vehiculoId: created.vehiculo_id,
      origen: `venta-b2b:${created.numero}`,
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    console.error('[POST /api/clientes-b2b/[id]/ventas]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
