'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { capitalizeText } from '@/lib/utils'

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  color: string
  año: number
  kms: number
  estado: string
  tipo: string
  createdAt: string
  updatedAt: string
}

export default function CochesRPage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')

  useEffect(() => {
    fetchCochesR()
  }, [])

  const fetchCochesR = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/coches-r')
      if (response.ok) {
        const data = await response.json()
        setVehiculos(data)
      } else {
        setError('Error al cargar Coches R')
      }
    } catch (error) {
      console.error('Error fetching Coches R:', error)
      setError('Error al cargar Coches R')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredVehiculos = vehiculos.filter((vehiculo) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      capitalizeText(vehiculo.marca).toLowerCase().includes(searchLower) ||
      capitalizeText(vehiculo.modelo).toLowerCase().includes(searchLower) ||
      vehiculo.referencia.toLowerCase().includes(searchLower) ||
      vehiculo.matricula.toLowerCase().includes(searchLower) ||
      vehiculo.bastidor.toLowerCase().includes(searchLower)
    )
  })

  const formatVehicleReference = (referencia: string, tipo: string) => {
    if (tipo === 'R') {
      return `R-${referencia}`
    }
    return `#${referencia}`
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'PUBLICADO':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'RESERVADO':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'VENDIDO':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'EN_PROCESO':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case 'PUBLICADO':
        return 'Disponible'
      case 'RESERVADO':
        return 'Reservado'
      case 'VENDIDO':
        return 'Vendido'
      case 'EN_PROCESO':
        return 'En Proceso'
      default:
        return estado
    }
  }

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="w-[80%] mx-auto">
            <LoadingSkeleton />
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (error) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="w-[80%] mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
              <button
                onClick={fetchCochesR}
                className="mt-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="w-[80%] mx-auto">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                  Coches R
                </h1>
                <p className="text-sm sm:text-base text-gray-600">
                  Vehículos vendidos "en el estado" sin garantía
                </p>
              </div>
              <Link
                href="/cargar-vehiculo"
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm text-sm sm:text-base"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span>Nuevo Coche R</span>
              </Link>
            </div>
          </div>

          {/* Filtros y búsqueda */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Búsqueda */}
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4"
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
                  <input
                    type="text"
                    placeholder="Buscar por marca, modelo, referencia..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              </div>

              {/* Botones de vista */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'cards'
                      ? 'bg-red-100 text-red-700'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title="Vista de tarjetas"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'list'
                      ? 'bg-red-100 text-red-700'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title="Vista de lista"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Contenido */}
          {filteredVehiculos.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1V8a1 1 0 00-1-1h-3z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay Coches R
              </h3>
              <p className="text-gray-500 mb-4">
                {searchTerm
                  ? 'No se encontraron Coches R que coincidan con tu búsqueda.'
                  : 'No hay Coches R registrados en el sistema.'}
              </p>
              <Link
                href="/cargar-vehiculo"
                className="inline-flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span>Crear primer Coche R</span>
              </Link>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredVehiculos.map((vehiculo) => (
                <Link
                  key={vehiculo.id}
                  href={`/coches-r/${vehiculo.id}`}
                  className="group bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow overflow-hidden"
                >
                  <div className="p-4">
                    {/* Referencia */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="min-w-12 h-10 px-2 bg-red-100 text-red-800 rounded-lg flex items-center justify-center">
                        <span className="text-sm font-bold whitespace-nowrap">
                          {formatVehicleReference(
                            vehiculo.referencia,
                            vehiculo.tipo
                          )}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium border ${getEstadoColor(vehiculo.estado)}`}
                      >
                        {getEstadoLabel(vehiculo.estado)}
                      </span>
                    </div>

                    {/* Marca y Modelo */}
                    <h3 className="text-base font-bold text-gray-900 group-hover:text-red-600 transition-colors mb-2">
                      {capitalizeText(vehiculo.marca)}{' '}
                      {capitalizeText(vehiculo.modelo)}
                    </h3>

                    {/* Detalles */}
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex justify-between">
                        <span>Matrícula:</span>
                        <span className="font-mono font-medium">
                          {vehiculo.matricula.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Año:</span>
                        <span className="font-medium">{vehiculo.año}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Kms:</span>
                        <span className="font-medium">
                          {vehiculo.kms.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tipo:</span>
                        <span className="font-bold text-red-600">
                          {vehiculo.tipo}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Referencia
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vehículo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Matrícula
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Año
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Kms
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredVehiculos.map((vehiculo) => (
                      <tr
                        key={vehiculo.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() =>
                          (window.location.href = `/coches-r/${vehiculo.id}`)
                        }
                      >
                        <td className="px-4 py-3">
                          <div className="min-w-12 h-8 px-2 bg-red-100 text-red-800 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-bold whitespace-nowrap">
                              {formatVehicleReference(
                                vehiculo.referencia,
                                vehiculo.tipo
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className={`font-semibold text-xs lg:text-sm truncate ${
                              vehiculo.estado === 'VENDIDO'
                                ? 'text-gray-500'
                                : 'text-slate-900'
                            }`}
                          >
                            {capitalizeText(vehiculo.marca)}{' '}
                            {capitalizeText(vehiculo.modelo)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs lg:text-sm font-mono">
                            {vehiculo.matricula.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs lg:text-sm">
                            {vehiculo.año}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs lg:text-sm">
                            {vehiculo.kms.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs lg:text-sm font-bold text-red-600">
                            {vehiculo.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium border ${getEstadoColor(vehiculo.estado)}`}
                          >
                            {getEstadoLabel(vehiculo.estado)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
