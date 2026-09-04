/**
 * GET /api/health — sin auth (whitelist del middleware). Ping de la DB con
 * timeout corto + versión/commit desplegados. 503 si la DB no responde.
 * Sin datos sensibles: pensado para un monitor externo (UptimeRobot, n8n).
 */

import { NextResponse } from 'next/server'
import { pool } from '@/lib/direct-database'
import pkg from '../../../../package.json'

export const dynamic = 'force-dynamic'

const DB_TIMEOUT_MS = 3000

async function pingDb(): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('db timeout')), DB_TIMEOUT_MS)
  })
  try {
    await Promise.race([pool.query('SELECT 1'), timeout])
    return true
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function GET() {
  const dbOk = await pingDb()
  const body = {
    ok: dbOk,
    db: dbOk ? 'ok' : 'error',
    version: (pkg as { version?: string }).version ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    ts: new Date().toISOString(),
  }
  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  })
}
