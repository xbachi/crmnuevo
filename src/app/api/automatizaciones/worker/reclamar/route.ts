/**
 * POST /api/automatizaciones/worker/reclamar — la PC del dueño (vigilar.py)
 * pide trabajo. Body {worker, version, solo_latido}. Siempre registra el
 * latido; con solo_latido no reclama. Responde {trabajo | null, proximo_s}.
 * Auth: X-Worker-Secret (AUTOMATIZACIONES_WORKER_SECRET), sin sesión.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  PROXIMO_ACTIVO_S,
  autorizarWorker,
  calcularProximo,
  latido,
  reclamar,
  validarReclamo,
} from '@/lib/automatizaciones'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const rechazo = autorizarWorker(request)
  if (rechazo) return rechazo

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const val = validarReclamo(body)
  if (!val.ok) return NextResponse.json({ error: val.error }, { status: 400 })
  const { worker, version, solo_latido } = val.reclamo

  try {
    await latido(worker, version)
    const trabajo = solo_latido ? null : await reclamar(worker)
    const proximo_s = trabajo ? PROXIMO_ACTIVO_S : await calcularProximo()
    return NextResponse.json({ trabajo, proximo_s })
  } catch (err) {
    console.error('[automatizaciones/worker/reclamar]', err)
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'error' },
      { status: 500 }
    )
  }
}
