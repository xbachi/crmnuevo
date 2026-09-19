/**
 * POST /api/vehiculos/[id]/campos-doc/confirmar — «sí, este dato del permiso de
 * circulación es correcto».
 *
 * Body: { campos: ['bastidor', 'plazas', ...] }. Sólo marca la confirmación; no
 * toca el valor. Para cambiarlo se edita el coche o su ficha comercial como
 * siempre, y eso también lo da por bueno (el valor deja de venir del documento).
 *
 * Confirmar un campo ya confirmado no es un error: devuelve `confirmados: []`.
 * Se exige sesión aquí además del middleware porque hace falta saber QUIÉN
 * confirma: es el único rastro de que una persona miró el dato.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/apiAuth'
import { esCampoDoc } from '@/lib/camposVehiculo'
import { confirmarCampos, pendientesDe } from '@/lib/vehiculoCamposDoc'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response

  const { id } = await params
  const vehiculoId = parseInt(id, 10)
  if (!Number.isFinite(vehiculoId) || vehiculoId <= 0) {
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

  const crudos = (body as { campos?: unknown })?.campos
  if (!Array.isArray(crudos) || crudos.length === 0) {
    return NextResponse.json(
      { error: 'campos debe ser un array con al menos un campo' },
      { status: 400 }
    )
  }

  const campos = [...new Set(crudos.map((c) => String(c)))]
  const desconocidos = campos.filter((c) => !esCampoDoc(c))
  if (desconocidos.length > 0) {
    return NextResponse.json(
      {
        error: `Campos no confirmables: ${desconocidos.join(', ')}`,
      },
      { status: 400 }
    )
  }

  try {
    const confirmados = await confirmarCampos(
      vehiculoId,
      campos,
      `uid:${auth.session.uid}`
    )
    return NextResponse.json({
      ok: true,
      confirmados,
      pendientes: await pendientesDe(vehiculoId),
    })
  } catch (error) {
    console.error('[campos-doc confirmar]', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
