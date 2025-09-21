import { pool } from './database'

// Cache para consultas frecuentes
const queryCache = new Map<string, { data: any; timestamp: number; ttl: number }>()

// TTL por defecto: 5 minutos
const DEFAULT_TTL = 5 * 60 * 1000

interface QueryOptions {
  ttl?: number
  useCache?: boolean
}

/**
 * Ejecuta una consulta con caché opcional
 */
export async function executeCachedQuery<T>(
  query: string,
  params: any[] = [],
  options: QueryOptions = {}
): Promise<T[]> {
  const { ttl = DEFAULT_TTL, useCache = true } = options
  const cacheKey = `${query}:${JSON.stringify(params)}`
  
  // Verificar caché si está habilitado
  if (useCache) {
    const cached = queryCache.get(cacheKey)
    if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
      return cached.data
    }
  }

  try {
    const result = await pool.query(query, params)
    const data = result.rows

    // Guardar en caché si está habilitado
    if (useCache) {
      queryCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl
      })
    }

    return data
  } catch (error) {
    console.error('Error ejecutando consulta:', error)
    throw error
  }
}

/**
 * Limpia el caché de consultas
 */
export function clearQueryCache(pattern?: string) {
  if (pattern) {
    for (const [key] of queryCache) {
      if (key.includes(pattern)) {
        queryCache.delete(key)
      }
    }
  } else {
    queryCache.clear()
  }
}

/**
 * Consultas optimizadas para vehículos
 */
export const VehiculoQueries = {
  // Obtener vehículos con paginación optimizada
  getVehiculosPaginated: async (page: number = 1, limit: number = 20, filters: any = {}) => {
    const offset = (page - 1) * limit
    let whereClause = 'WHERE 1=1'
    const params: any[] = []
    let paramIndex = 1

    // Aplicar filtros
    if (filters.search) {
      whereClause += ` AND (marca ILIKE $${paramIndex} OR modelo ILIKE $${paramIndex} OR matricula ILIKE $${paramIndex})`
      params.push(`%${filters.search}%`)
      paramIndex++
    }

    if (filters.tipo) {
      whereClause += ` AND tipo = $${paramIndex}`
      params.push(filters.tipo)
      paramIndex++
    }

    if (filters.estado) {
      whereClause += ` AND estado = $${paramIndex}`
      params.push(filters.estado)
      paramIndex++
    }

    // Consulta principal con JOIN optimizado
    const query = `
      SELECT 
        v.*,
        i.nombre as inversor_nombre,
        d.nombre as deposito_nombre
      FROM vehiculos v
      LEFT JOIN inversores i ON v.inversor_id = i.id
      LEFT JOIN depositos d ON v.deposito_id = d.id
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    
    params.push(limit, offset)

    return executeCachedQuery(query, params, { ttl: 2 * 60 * 1000 }) // 2 minutos para vehículos
  },

  // Obtener estadísticas de vehículos
  getVehiculoStats: async () => {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN estado = 'publicado' THEN 1 END) as publicados,
        COUNT(CASE WHEN estado IN ('inicial', 'mecauto', 'pintura', 'limpieza', 'fotos') THEN 1 END) as en_proceso,
        COUNT(CASE WHEN itv = 'No' THEN 1 END) as itv_vencida
      FROM vehiculos
    `
    
    return executeCachedQuery(query, [], { ttl: 5 * 60 * 1000 }) // 5 minutos para estadísticas
  },

  // Obtener vehículo por ID con relaciones
  getVehiculoById: async (id: number) => {
    const query = `
      SELECT 
        v.*,
        i.nombre as inversor_nombre,
        i.email as inversor_email,
        d.nombre as deposito_nombre
      FROM vehiculos v
      LEFT JOIN inversores i ON v.inversor_id = i.id
      LEFT JOIN depositos d ON v.deposito_id = d.id
      WHERE v.id = $1
    `
    
    return executeCachedQuery(query, [id], { ttl: 10 * 60 * 1000 }) // 10 minutos para vehículo individual
  }
}

/**
 * Consultas optimizadas para clientes
 */
export const ClienteQueries = {
  // Obtener clientes con paginación
  getClientesPaginated: async (page: number = 1, limit: number = 20, filters: any = {}) => {
    const offset = (page - 1) * limit
    let whereClause = 'WHERE 1=1'
    const params: any[] = []
    let paramIndex = 1

    if (filters.search) {
      whereClause += ` AND (nombre ILIKE $${paramIndex} OR apellidos ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`
      params.push(`%${filters.search}%`)
      paramIndex++
    }

    if (filters.estado) {
      whereClause += ` AND estado = $${paramIndex}`
      params.push(filters.estado)
      paramIndex++
    }

    const query = `
      SELECT * FROM clientes
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    
    params.push(limit, offset)

    return executeCachedQuery(query, params, { ttl: 3 * 60 * 1000 }) // 3 minutos para clientes
  }
}

/**
 * Consultas optimizadas para deals
 */
export const DealQueries = {
  // Obtener deals con paginación
  getDealsPaginated: async (page: number = 1, limit: number = 20, filters: any = {}) => {
    const offset = (page - 1) * limit
    let whereClause = 'WHERE 1=1'
    const params: any[] = []
    let paramIndex = 1

    if (filters.estado) {
      whereClause += ` AND estado = $${paramIndex}`
      params.push(filters.estado)
      paramIndex++
    }

    const query = `
      SELECT 
        d.*,
        c.nombre as cliente_nombre,
        c.apellidos as cliente_apellidos,
        v.marca,
        v.modelo,
        v.matricula
      FROM deals d
      LEFT JOIN clientes c ON d.cliente_id = c.id
      LEFT JOIN vehiculos v ON d.vehiculo_id = v.id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    
    params.push(limit, offset)

    return executeCachedQuery(query, params, { ttl: 2 * 60 * 1000 }) // 2 minutos para deals
  }
}

/**
 * Consultas optimizadas para inversores
 */
export const InversorQueries = {
  // Obtener inversores con estadísticas
  getInversoresWithStats: async () => {
    const query = `
      SELECT 
        i.*,
        COUNT(v.id) as total_vehiculos,
        COUNT(CASE WHEN v.estado = 'vendido' THEN 1 END) as vehiculos_vendidos,
        COALESCE(SUM(CASE WHEN v.estado = 'vendido' THEN v.precio_venta ELSE 0 END), 0) as total_ventas
      FROM inversores i
      LEFT JOIN vehiculos v ON i.id = v.inversor_id
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `
    
    return executeCachedQuery(query, [], { ttl: 5 * 60 * 1000 }) // 5 minutos para inversores
  }
}

/**
 * Consultas optimizadas para depósitos
 */
export const DepositoQueries = {
  // Obtener depósitos con estadísticas
  getDepositosWithStats: async () => {
    const query = `
      SELECT 
        d.*,
        COUNT(v.id) as total_vehiculos,
        COUNT(CASE WHEN v.estado = 'vendido' THEN 1 END) as vehiculos_vendidos
      FROM depositos d
      LEFT JOIN vehiculos v ON d.id = v.deposito_id
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `
    
    return executeCachedQuery(query, [], { ttl: 5 * 60 * 1000 }) // 5 minutos para depósitos
  }
}

/**
 * Limpia el caché cuando se actualizan datos
 */
export function invalidateCacheOnUpdate(table: string) {
  const patterns = {
    'vehiculos': ['vehiculos', 'inversores', 'depositos'],
    'clientes': ['clientes'],
    'deals': ['deals', 'clientes', 'vehiculos'],
    'inversores': ['inversores', 'vehiculos'],
    'depositos': ['depositos', 'vehiculos']
  }

  const tablesToInvalidate = patterns[table as keyof typeof patterns] || [table]
  
  tablesToInvalidate.forEach(pattern => {
    clearQueryCache(pattern)
  })
}
