/**
 * POST /api/public/presupuesto/[token]/visto — marca visto_at (idempotente)
 * y enviado → visto. 204 / 404. Sin sesión, sin body, sin caché.
 */
import { NextRequest, NextResponse } from 'next/server'
import { marcarVisto } from '@/lib/presupuesto/repo'

const NO_STORE = { 'Cache-Control': 'no-store' }
const RE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!RE_TOKEN.test(token)) {
    return NextResponse.json(
      { error: 'Presupuesto no disponible' },
      { status: 404, headers: NO_STORE }
    )
  }
  try {
    const ok = await marcarVisto(token)
    if (!ok) {
      return NextResponse.json(
        { error: 'Presupuesto no disponible' },
        { status: 404, headers: NO_STORE }
      )
    }
    return new NextResponse(null, { status: 204, headers: NO_STORE })
  } catch (e) {
    console.error('[public presupuesto visto]', e)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500, headers: NO_STORE }
    )
  }
}
