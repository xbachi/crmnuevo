/**
 * GET /api/vehiculos/[id]/campos-doc — campos que rellenó el permiso de
 * circulación / la tarjeta ITV en este coche y siguen sin confirmar.
 *
 * Lo pinta el bloque «Datos del permiso» de la ficha del vehículo. Un campo
 * confirmado desaparece de aquí (y deja de bloquear la publicación).
 *
 * Sesión: middleware de /api/*.
 */
import { NextRequest, NextResponse } from 'next/server'
import { CAMPOS_DOC_POR_NOMBRE } from '@/lib/camposVehiculo'
import { pendientesDe } from '@/lib/vehiculoCamposDoc'

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
  const pendientes = await pendientesDe(vehiculoId)
  return NextResponse.json({
    pendientes: pendientes.map((p) => ({
      ...p,
      etiqueta: CAMPOS_DOC_POR_NOMBRE[p.campo]?.etiqueta ?? p.campo,
    })),
  })
}
