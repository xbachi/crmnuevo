/**
 * GET /api/presupuestos/parametros-calculo — params + tarifas activas para la
 * vista previa en cliente (motor puro). Uso interno con sesión.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/apiAuth'
import { cargarContextoCalculo } from '@/lib/presupuesto/repo'

export async function GET(request: NextRequest) {
  const auth = requireApiSession(request)
  if (auth.response) return auth.response
  try {
    return NextResponse.json(await cargarContextoCalculo())
  } catch (e) {
    console.error('[presupuestos parametros-calculo]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
