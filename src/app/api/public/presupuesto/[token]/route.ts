/**
 * GET /api/public/presupuesto/[token] — presupuesto para la página pública
 * /p/[token]. Sin sesión (prefijo /api/public en el middleware). Nunca expone
 * id, creado_por, teléfono, email, ids de cliente/interesado, parámetros ni
 * pdf_url. Sin caché.
 */
import { NextRequest, NextResponse } from 'next/server'
import { leerFicha } from '@/lib/fichaComercial'
import { cargarParametros, leerPorToken } from '@/lib/presupuesto/repo'
import { aPublico, cargarVehiculoPresupuesto } from '@/lib/presupuesto/servicio'

const NO_STORE = { 'Cache-Control': 'no-store' }
const RE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/

function noEncontrado() {
  return NextResponse.json(
    { error: 'Presupuesto no disponible' },
    { status: 404, headers: NO_STORE }
  )
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!RE_TOKEN.test(token)) return noEncontrado()
  try {
    const p = await leerPorToken(token)
    if (!p || p.estado === 'anulado') return noEncontrado()
    const [v, f, parametros] = await Promise.all([
      cargarVehiculoPresupuesto(p.vehiculo_id),
      leerFicha(p.vehiculo_id),
      cargarParametros(),
    ])
    if (!v) return noEncontrado()
    return NextResponse.json(aPublico(p, v, f, parametros), {
      headers: NO_STORE,
    })
  } catch (e) {
    console.error('[public presupuesto GET]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500, headers: NO_STORE }
    )
  }
}
