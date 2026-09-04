/**
 * Paginación opcional de las listas (/api/clientes, /api/interesados,
 * /api/deals, /api/depositos).
 *
 * Sin `page` en la query la ruta responde como siempre (array completo):
 * kanban, selects, buscadores y `?limit=5` de fichas antiguas dependen de esa
 * forma. Con `page` se pagina en SQL y la respuesta lleva `pagination`.
 */
export const LIMIT_POR_DEFECTO = 50
export const LIMIT_MAXIMO = 200

export interface PaginacionPedida {
  page: number
  limit: number
  offset: number
  q: string | undefined
}

export interface Pagination {
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

function enteroPositivo(raw: string | null): number | null {
  if (raw === null) return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** `null` si la petición no pide paginación (no trae `page`). */
export function leerPaginacion(
  searchParams: URLSearchParams
): PaginacionPedida | null {
  const rawPage = searchParams.get('page')
  if (rawPage === null) return null
  const page = enteroPositivo(rawPage) ?? 1
  const limit = Math.min(
    enteroPositivo(searchParams.get('limit')) ?? LIMIT_POR_DEFECTO,
    LIMIT_MAXIMO
  )
  const q = searchParams.get('q')?.trim() || undefined
  return { page, limit, offset: (page - 1) * limit, q }
}

export function construirPagination(
  total: number,
  page: number,
  limit: number
): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  }
}
