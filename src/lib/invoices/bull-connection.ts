import type { ConnectionOptions } from 'bullmq'

export function getBullConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL
  if (!url) throw new Error('Missing REDIS_URL')

  const u = new URL(url)
  const port = u.port ? Number(u.port) : 6379
  const db = u.pathname ? Number(u.pathname.replace('/', '') || '0') : 0

  const isTls = u.protocol === 'rediss:'
  return {
    host: u.hostname,
    port,
    password: u.password || undefined,
    db: Number.isFinite(db) ? db : 0,
    ...(isTls ? { tls: {} } : {}),
  }
}
