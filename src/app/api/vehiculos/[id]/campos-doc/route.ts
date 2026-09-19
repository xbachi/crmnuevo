/**
 * GET /api/vehiculos/[id]/campos-doc — qué le falta a este coche.
 *
 *  · `pendientes`  → campos que rellenó el permiso de circulación / la tarjeta
 *                    ITV y todavía no ha confirmado nadie.
 *  · `faltantes`   → todo lo que impide pasarlo a PUBLICADO (lo mismo que
 *                    devuelve el 409), para poder avisar antes de intentarlo.
 *
 * Las dos cosas van juntas porque el bloque «Datos del permiso» de la ficha las
 * pinta a la vez y no tiene sentido pagar dos viajes.
 *
 * Sesión: middleware de /api/*.
 */
import { NextRequest, NextResponse } from 'next/server'
import { CAMPOS_DOC_POR_NOMBRE } from '@/lib/camposVehiculo'
import { faltantesParaPublicar, pendientesDe } from '@/lib/vehiculoCamposDoc'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const vehiculoId = parseInt(id, 10)
  if (!Number.isFinite(vehiculoId) || vehiculoId <= 0) {
    return NextResponse.json(
      { error: 'ID de vehículo inválido' },
      { status: 400 }
    )
  }
  const [pendientes, faltantes] = await Promise.all([
    pendientesDe(vehiculoId),
    faltantesParaPublicar(vehiculoId),
  ])
  return NextResponse.json({
    pendientes: pendientes.map((p) => ({
      ...p,
      etiqueta: CAMPOS_DOC_POR_NOMBRE[p.campo]?.etiqueta ?? p.campo,
    })),
    faltantes,
  })
}
