/**
 * GET/PUT /api/vehiculos/[id]/ficha-comercial — ficha comercial del vehículo
 * (web y presupuesto). precio_contado es "Vehiculo"."precioPublicacion".
 * Un PUT encola el upsert de la fila en las hojas (Base_Datos incluida).
 * Sesión: middleware de /api/*.
 */
import { NextRequest, NextResponse } from 'next/server'
import { guardarFicha, leerFicha, validarFicha } from '@/lib/fichaComercial'
import { encolarSheetsVehiculo } from '@/lib/sheetsVehiculo'

type Params = { params: Promise<{ id: string }> }

function parseId(id: string): number | null {
  const n = parseInt(id, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const vehiculoId = parseId(id)
  if (vehiculoId == null) {
    return NextResponse.json(
      { error: 'ID de vehículo inválido' },
      { status: 400 }
    )
  }
  try {
    const ficha = await leerFicha(vehiculoId)
    if (!ficha) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }
    return NextResponse.json(ficha)
  } catch (error) {
    console.error('[ficha-comercial GET]', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params
  const vehiculoId = parseId(id)
  if (vehiculoId == null) {
    return NextResponse.json(
      { error: 'ID de vehículo inválido' },
      { status: 400 }
    )
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const val = validarFicha(body)
  if (!val.ok) {
    return NextResponse.json(
      { error: 'Ficha comercial inválida', errores: val.errores },
      { status: 400 }
    )
  }
  try {
    const ficha = await guardarFicha(vehiculoId, val.patch)
    if (!ficha) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }
    if (Object.keys(val.patch).length > 0) {
      try {
        await encolarSheetsVehiculo(vehiculoId, 'ficha')
      } catch (err) {
        console.error('encolar sheets:', (err as Error)?.message ?? err)
      }
    }
    return NextResponse.json(ficha)
  } catch (error) {
    console.error('[ficha-comercial PUT]', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
