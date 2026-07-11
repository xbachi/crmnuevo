import { NextRequest, NextResponse } from 'next/server'
import { processGestoriaOutbox } from '@/lib/gestoriaOutbox'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET ?? ''
  const adminSecret = process.env.ADMIN_SECRET ?? ''
  const cronAuth = request.headers.get('authorization') ?? ''
  const adminAuth = request.headers.get('x-admin-secret') ?? ''
  const authorized =
    (!!cronSecret && cronAuth === `Bearer ${cronSecret}`) ||
    (!!adminSecret && adminAuth === adminSecret)
  if (!authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await processGestoriaOutbox({ limit: 2 }))
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
