'use client'

import { useState, useCallback, useEffect } from 'react'
import { MagnifyingGlassIcon, FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface SearchFilterProps {
  onSearch: (search: string) => void
  onFilter: (filters: Record<string, string>) => void
  filters?: {
    tipo?: string
    estado?: string
    inversorId?: string
  }
  className?: string
}

export default function SearchFilter({ 
  onSearch, 
  onFilter, 
  filters = {}, 
  className = '' 
}: SearchFilterProps) {
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [localFilters, setLocalFilters] = useState(filters)

  // Debounce para búsqueda
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      onSearch(search)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [search, onSearch])

  const handleFilterChange = useCallback((key: string, value: string) => {
    const newFilters = { ...localFilters, [key]: value }
    setLocalFilters(newFilters)
    onFilter(newFilters)
  }, [localFilters, onFilter])

  const clearFilters = useCallback(() => {
    setLocalFilters({})
    setSearch('')
    onFilter({})
    onSearch('')
  }, [onFilter, onSearch])

  const hasActiveFilters = Object.values(localFilters).some(value => value) || search

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Barra de búsqueda */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por referencia, marca, modelo, matrícula..."
          className="block w-full pl-10 pr-12 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1 rounded-md ${
              showFilters || hasActiveFilters
                ? 'text-blue-600 bg-blue-100'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            title="Filtros"
          >
            <FunnelIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Panel de filtros */}
      {showFilters && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Filtros</h3>
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1"
            >
              <XMarkIcon className="h-4 w-4" />
              <span>Limpiar</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Filtro por tipo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo
              </label>
              <select
                value={localFilters.tipo || ''}
                onChange={(e) => handleFilterChange('tipo', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos los tipos</option>
                <option value="Compra">Compra</option>
                <option value="Coche R">Coche R</option>
                <option value="Deposito Venta">Depósito Venta</option>
              </select>
            </div>

            {/* Filtro por estado */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <select
                value={localFilters.estado || ''}
                onChange={(e) => handleFilterChange('estado', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos los estados</option>
                <option value="disponible">Disponible</option>
                <option value="reservado">Reservado</option>
                <option value="vendido">Vendido</option>
                <option value="en_reparacion">En Reparación</option>
              </select>
            </div>

            {/* Filtro por inversor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inversor
              </label>
              <select
                value={localFilters.inversorId || ''}
                onChange={(e) => handleFilterChange('inversorId', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos los inversores</option>
                <option value="null">Sin inversor</option>
                {/* Aquí se cargarían los inversores desde la API */}
              </select>
            </div>
          </div>

          {/* Indicador de filtros activos */}
          {hasActiveFilters && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <span>Filtros activos:</span>
              {search && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Búsqueda: &quot;{search}&quot;
                </span>
              )}
              {localFilters.tipo && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Tipo: {localFilters.tipo}
                </span>
              )}
              {localFilters.estado && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  Estado: {localFilters.estado}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
