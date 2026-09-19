/**
 * POST /api/automatizaciones/worker/resultado — la PC devuelve el resultado
 * de un trabajo en curso: {id, worker, rc, salida, para_verificar, url}.
 * rc 0 → ok; otro → error. La salida se recorta a los últimos 100 KB también
 * acá. id inexistente o que no está en_curso → 409.
 * Auth: X-Worker-Secret (AUTOMATIZACIONES_WORKER_SECRET), sin sesión.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  autorizarWorker,
  registrarResultado,
  validarResultado,
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
  const val = validarResultado(body)
  if (!val.ok) return NextResponse.json({ error: val.error }, { status: 400 })

  try {
    if (!(await registrarResultado(val.resultado))) {
      return NextResponse.json(
        { error: `trabajo ${val.resultado.id} inexistente o no en_curso` },
        { status: 409 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[automatizaciones/worker/resultado]', err)
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'error' },
      { status: 500 }
    )
  }
}
