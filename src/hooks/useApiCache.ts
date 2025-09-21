import { useState, useEffect, useCallback, useRef } from 'react'

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
}

interface UseApiCacheOptions {
  ttl?: number // Time to live in milliseconds (default: 5 minutes)
  enabled?: boolean // Whether to enable caching (default: true)
}

export function useApiCache<T>(
  url: string,
  options: UseApiCacheOptions = {}
) {
  const { ttl = 5 * 60 * 1000, enabled = true } = options // 5 minutes default
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map())

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled) return

    const now = Date.now()
    const cacheKey = url
    const cached = cacheRef.current.get(cacheKey)

    // Return cached data if it's still valid and not forcing refresh
    if (!forceRefresh && cached && (now - cached.timestamp) < cached.ttl) {
      setData(cached.data)
      return cached.data
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(url, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      
      // Cache the result
      cacheRef.current.set(cacheKey, {
        data: result,
        timestamp: now,
        ttl
      })

      setData(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [url, ttl, enabled])

  const invalidateCache = useCallback(() => {
    cacheRef.current.delete(url)
  }, [url])

  const invalidateAllCache = useCallback(() => {
    cacheRef.current.clear()
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
    invalidateCache,
    invalidateAllCache
  }
}

// Hook específico para datos que cambian frecuentemente (sin caché)
export function useApiNoCache<T>(url: string) {
  return useApiCache<T>(url, { ttl: 0, enabled: false })
}

// Hook para datos que raramente cambian (caché largo)
export function useApiLongCache<T>(url: string) {
  return useApiCache<T>(url, { ttl: 30 * 60 * 1000 }) // 30 minutes
}
