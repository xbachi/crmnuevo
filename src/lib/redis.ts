import IORedis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined
}

function createRedis() {
  const url = process.env.REDIS_URL
  if (!url) {
    throw new Error('Missing REDIS_URL')
  }

  // BullMQ recommends maxRetriesPerRequest=null for long-running workers
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  })
}

export function getRedis() {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createRedis()
  }
  return globalForRedis.redis
}
