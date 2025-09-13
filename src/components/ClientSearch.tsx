'use client'

import { useState, useEffect, useRef } from 'react'

interface Cliente {
  id: number
  nombre: string
  apellidos: string
  telefono: string
  email?: string
  estado: string
  prioridad: string
  intereses: {
    vehiculoPrincipal: string
    precioMaximo: number
  }
}

interface ClientSearchProps {
  onClientSelect: (cliente: Cliente) => void
  placeholder?: string
  className?: string
}

export default function ClientSearch({ onClientSelect, placeholder = "Buscar cliente...", className = "" }: ClientSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Cliente[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length >= 2) {
      searchClients()
    } else {
      setResults([])
      setIsOpen(false)
    }
  }, [query])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const searchClients = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(query)}`)
      if (response.ok) {
        const data = await response.json()
        setResults(data)
        setIsOpen(data.length > 0)
      }
    } catch (error) {
      console.error('Error al buscar clientes:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClientSelect = (cliente: Cliente) => {
    setQuery(`${cliente.nombre} ${cliente.apellidos}`)
    setIsOpen(false)
    onClientSelect(cliente)
  }

  const getEstadoColor = (estado: string) => {
    const colors = {
      'nuevo': 'bg-blue-100 text-blue-800',
      'en_seguimiento': 'bg-yellow-100 text-yellow-800',
      'cita_agendada': 'bg-purple-100 text-purple-800',
      'cerrado': 'bg-green-100 text-green-800',
      'descartado': 'bg-red-100 text-red-800'
    }
    return colors[estado as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  const getPrioridadColor = (prioridad: string) => {
    const colors = {
      'alta': 'bg-red-100 text-red-800',
      'media': 'bg-yellow-100 text-yellow-800',
      'baja': 'bg-green-100 text-green-800'
    }
    return colors[prioridad as keyof typeof colors] || 'bg-gray-100 text-gray-800'
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
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
            <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto"
        >
          {results.map((cliente) => (
            <div
              key={cliente.id}
              onClick={() => handleClientSelect(cliente)}
              className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0 h-8 w-8">
                      <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                        <span className="text-xs font-medium text-green-800">
                          {cliente.nombre.charAt(0)}{cliente.apellidos.charAt(0)}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {cliente.nombre} {cliente.apellidos}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {cliente.telefono} • {cliente.email || 'Sin email'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(cliente.estado)}`}>
                    {cliente.estado.charAt(0).toUpperCase() + cliente.estado.slice(1).replace('_', ' ')}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(cliente.prioridad)}`}>
                    {cliente.prioridad.charAt(0).toUpperCase() + cliente.prioridad.slice(1)}
                  </span>
                </div>
              </div>
              {cliente.intereses.vehiculoPrincipal && (
                <div className="mt-2 ml-11">
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">Vehículo:</span> {cliente.intereses.vehiculoPrincipal}
                    {cliente.intereses.precioMaximo > 0 && (
                      <span className="ml-2">
                        • <span className="font-medium">Hasta:</span> €{cliente.intereses.precioMaximo.toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isOpen && results.length === 0 && query.length >= 2 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
          <div className="px-4 py-3 text-center text-gray-500">
            <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.29-1.009-5.824-2.571M15 6H9a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V8a2 2 0 00-2-2z" />
            </svg>
            <p className="text-sm">No se encontraron clientes</p>
            <p className="text-xs text-gray-400 mt-1">Intenta con otros términos de búsqueda</p>
          </div>
        </div>
      )}
    </div>
  )
}

