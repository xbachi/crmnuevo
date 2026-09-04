'use client'

import type { Pagination } from '@/lib/listPagination'

interface PaginadorListaProps {
  pagination: Pagination | null
  onCambiarPagina: (pagina: number) => void
  /** Sustantivo para el contador: "12 clientes". */
  etiqueta?: string
  disabled?: boolean
}

// Paginador de las listas con paginación en servidor (/clientes, /interesados,
// /depositos). Sin resultados no se pinta.
export default function PaginadorLista({
  pagination,
  onCambiarPagina,
  etiqueta = 'resultados',
  disabled = false,
}: PaginadorListaProps) {
  if (!pagination || pagination.total === 0) return null

  const botonClase =
    'px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100'

  return (
    <div className="mt-4 flex items-center justify-between px-4 py-3 bg-white rounded-xl shadow-sm border border-gray-200">
      <span className="text-sm text-gray-600">
        {pagination.total} {etiqueta} • Página {pagination.page} de{' '}
        {pagination.totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onCambiarPagina(pagination.page - 1)}
          disabled={disabled || !pagination.hasPrev}
          className={botonClase}
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => onCambiarPagina(pagination.page + 1)}
          disabled={disabled || !pagination.hasNext}
          className={botonClase}
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}
