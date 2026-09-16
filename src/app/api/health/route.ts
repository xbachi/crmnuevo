/**
 * GET /api/health — sin auth (whitelist del middleware). Ping de la DB con
 * timeout corto + versión/commit desplegados. 503 si la DB no responde.
 * Sin datos sensibles: pensado para un monitor externo (UptimeRobot, n8n).
 */

import { getSessionSecretSource } from '@/lib/sessionSecret'
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

// Sólo booleanos: si cada integración está encendida en este despliegue. Se leen
// las variables directamente (misma semántica que sheetsVehiculo/onedriveCarpetas/
// webSync) para no cargar googleapis en un endpoint que debe ser instantáneo.
function integraciones() {
  const env = process.env
  return {
    hojas:
      env.SHEETS_VEHICULO_DISABLED !== '1' &&
      env.SHEETS_VEHICULO_ENABLED === '1',
    carpetasOneDrive: env.ONEDRIVE_CARPETAS_ENABLED === '1',
    webSync: Boolean(env.SEVEN_WEB_SYNC_URL && env.SEVEN_WEB_SYNC_SECRET),
    n8n: Boolean(env.N8N_RENAME_WEBHOOK_URL || env.N8N_INVOICE_WEBHOOK_URL),
    appUrl: Boolean(env.NEXT_PUBLIC_APP_URL),
  }
}

export async function GET() {
  const dbOk = await pingDb()
  const body = {
    ok: dbOk,
    db: dbOk ? 'ok' : 'error',
    version: (pkg as { version?: string }).version ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    sessionSecret: getSessionSecretSource(),
    integraciones: integraciones(),
    ts: new Date().toISOString(),
  }
  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  })
}
