import { createClient } from 'redis'

const globalForRedis = globalThis as unknown as {
  redis: ReturnType<typeof createClient> | undefined
}

export const redis = globalForRedis.redis ?? createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    connectTimeout: 60000,
    lazyConnect: true
  }
})

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

// Conectar a Redis
export async function connectRedis() {
  try {
    if (!redis.isOpen) {
      await redis.connect()
      console.log('✅ Redis connected successfully')
    }
  } catch (error) {
    console.error('❌ Redis connection failed:', error)
    // En desarrollo, continuar sin Redis
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️ Continuing without Redis in development mode')
    }
  }
}

// Función para obtener datos del cache
export async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    if (!redis.isOpen) return null
    
    const cached = await redis.get(key)
    return cached ? JSON.parse(cached) : null
  } catch (error) {
    console.error('Error getting from cache:', error)
    return null
  }
}

// Función para guardar datos en el cache
export async function setCache(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  try {
    if (!redis.isOpen) return
    
    await redis.setEx(key, ttlSeconds, JSON.stringify(value))
  } catch (error) {
    console.error('Error setting cache:', error)
  }
}

// Función para invalidar cache
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    if (!redis.isOpen) return
    
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(keys)
    }
  } catch (error) {
    console.error('Error invalidating cache:', error)
  }
}

// Función para cache con fallback
export async function withCache<T>(
  key: string,
  fetchFunction: () => Promise<T>,
  ttlSeconds = 300
): Promise<T> {
  // Intentar obtener del cache
  const cached = await getFromCache<T>(key)
  if (cached) {
    return cached
  }

  // Si no está en cache, obtener los datos
  const data = await fetchFunction()
  
  // Guardar en cache para futuras consultas
  await setCache(key, data, ttlSeconds)
  
  return data
}

// Claves de cache predefinidas
export const CACHE_KEYS = {
  VEHICULOS: 'vehiculos',
  VEHICULOS_PAGE: (page: number, limit: number, filters: string) => 
    `vehiculos:page:${page}:limit:${limit}:filters:${filters}`,
  CLIENTES: 'clientes',
  CLIENTES_PAGE: (page: number, limit: number, filters: string) => 
    `clientes:page:${page}:limit:${limit}:filters:${filters}`,
  INVERSORES: 'inversores',
  INVERSOR_METRICS: (id: number) => `inversor:metrics:${id}`,
  CLIENTE_NOTAS: (id: number) => `cliente:notes:${id}`
} as const

// Función para limpiar cache relacionado
export async function clearRelatedCache(entity: string, id?: number) {
  const patterns = {
    vehiculos: ['vehiculos:*'],
    clientes: ['clientes:*', id ? `cliente:notes:${id}` : 'cliente:notes:*'],
    inversores: ['inversores:*', id ? `inversor:metrics:${id}` : 'inversor:metrics:*']
  }

  const entityPatterns = patterns[entity as keyof typeof patterns] || []
  
  for (const pattern of entityPatterns) {
    await invalidateCache(pattern)
  }
}
