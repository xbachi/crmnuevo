'use client'

import { useState, useEffect, useRef } from 'react'
import { getVehiculoAño } from '@/lib/utils'

interface Vehiculo {
  id: number
  marca: string
  modelo: string
  año: number
  precio: number
  kilometraje: number
  combustible: string
  cambio: string
  color: string
  estado: string
}

interface VehicleSearchProps {
  onVehicleSelect: (vehiculo: Vehiculo) => void
  placeholder?: string
  className?: string
}

export default function VehicleSearch({
  onVehicleSelect,
  placeholder = 'Buscar vehículo...',
  className = '',
}: VehicleSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Vehiculo[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length >= 2) {
      searchVehicles()
    } else {
      setResults([])
      setIsOpen(false)
    }
  }, [query])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const searchVehicles = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/vehiculos')
      if (response.ok) {
        const data = await response.json()
        const queryLower = query.toLowerCase()

        const filteredVehicles = data.filter((vehiculo: Vehiculo) => {
          const marcaModelo =
            `${vehiculo.marca} ${vehiculo.modelo}`.toLowerCase()
          const color = vehiculo.color?.toLowerCase() || ''
          const combustible = vehiculo.combustible?.toLowerCase() || ''
          const cambio = vehiculo.cambio?.toLowerCase() || ''

          return (
            marcaModelo.includes(queryLower) ||
            color.includes(queryLower) ||
            combustible.includes(queryLower) ||
            cambio.includes(queryLower) ||
            (getVehiculoAño(vehiculo)?.toString() || '').includes(query)
          )
        })

        setResults(filteredVehicles.slice(0, 10))
        setIsOpen(filteredVehicles.length > 0)
      }
    } catch (error) {
      console.error('Error al buscar vehículos:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleVehicleSelect = (vehiculo: Vehiculo) => {
    setQuery(
      `${vehiculo.marca} ${vehiculo.modelo} ${getVehiculoAño(vehiculo) || ''}`
    )
    setIsOpen(false)
    onVehicleSelect(vehiculo)
  }

  const getEstadoColor = (estado: string) => {
    const colors = {
      disponible: 'bg-green-100 text-green-800',
      vendido: 'bg-red-100 text-red-800',
      reservado: 'bg-yellow-100 text-yellow-800',
      mantenimiento: 'bg-blue-100 text-blue-800',
    }
    return colors[estado as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(price)
  }

  const formatKilometraje = (km: number) => {
    return new Intl.NumberFormat('es-ES').format(km) + ' km'
  }

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          className="w-full px-4 py-2 pl-10 pr-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          placeholder={placeholder}
        />
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
          ) : (
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          )}
        </div>
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setResults([])
              setIsOpen(false)
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <svg
              className="h-4 w-4 text-gray-400 hover:text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto"
        >
          {results.map((vehiculo) => (
            <div
              key={vehiculo.id}
              onClick={() => handleVehicleSelect(vehiculo)}
              className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0 h-12 w-16">
                      <div className="h-12 w-16 bg-gray-100 rounded-lg flex items-center justify-center">
                        <svg
                          className="h-6 w-6 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {vehiculo.marca} {vehiculo.modelo}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {getVehiculoAño(vehiculo) || 'N/A'} • {vehiculo.color} •{' '}
                        {vehiculo.combustible}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {formatKilometraje(vehiculo.kilometraje)} •{' '}
                        {vehiculo.cambio}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-1 ml-4">
                  <span className="text-sm font-bold text-gray-900">
                    {formatPrice(vehiculo.precio)}
                  </span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(vehiculo.estado)}`}
                  >
                    {vehiculo.estado.charAt(0).toUpperCase() +
                      vehiculo.estado.slice(1)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isOpen && results.length === 0 && query.length >= 2 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
          <div className="px-4 py-3 text-center text-gray-500">
            <svg
              className="mx-auto h-8 w-8 text-gray-400 mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <p className="text-sm">No se encontraron vehículos</p>
            <p className="text-xs text-gray-400 mt-1">
              Intenta con otros términos de búsqueda
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
