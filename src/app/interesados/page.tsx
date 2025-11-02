'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSimpleToast } from '@/hooks/useSimpleToast'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import ProtectedRoute from '@/components/ProtectedRoute'
import { capitalizeText } from '@/lib/utils'

interface Interesado {
  id: number
  nombre: string
  apellidos: string
  telefono: string
  vehiculosInteres?: string
  presupuestoMaximo?: number
  kilometrajeMaximo?: number
  añoMinimo?: number
  combustiblePreferido?: string
  cambioPreferido?: string
  formaPagoPreferida?: string
  createdAt?: string
  updatedAt?: string
}

export default function InteresadosPage() {
  const router = useRouter()
  const { showToast, ToastContainer } = useSimpleToast()

  const [interesados, setInteresados] = useState<Interesado[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [interesadoToDelete, setInteresadoToDelete] =
    useState<Interesado | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [precioMaxFilter, setPrecioMaxFilter] = useState('')
  const [kilometrajeFilter, setKilometrajeFilter] = useState('')
  const [añoMinFilter, setAñoMinFilter] = useState('')
  const [combustibleFilter, setCombustibleFilter] = useState('')
  const [cambioFilter, setCambioFilter] = useState('')
  const [pagoFilter, setPagoFilter] = useState('')

  const fetchInteresados = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/interesados')
      if (!response.ok) throw new Error('Error al cargar interesados')
      const data = await response.json()
      setInteresados(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar interesados', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchInteresados()
  }, [])

  const handleView = (id: number) => {
    router.push(`/interesados/${id}`)
  }

  const handleCreate = () => {
    router.push('/interesados/crear')
  }

  const handleDeleteClick = (interesado: Interesado) => {
    setInteresadoToDelete(interesado)
  }

  const handleDeleteConfirm = async () => {
    if (!interesadoToDelete) return

    try {
      setIsDeleting(true)
      const response = await fetch(
        `/api/interesados/${interesadoToDelete.id}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        await fetchInteresados()
        showToast('Interesado eliminado correctamente', 'success')
        setInteresadoToDelete(null)
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al eliminar interesado', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al eliminar interesado', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteCancel = () => {
    setInteresadoToDelete(null)
  }

  const filteredInteresados = interesados.filter((interesado) => {
    const matchesSearch =
      !searchTerm ||
      interesado.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interesado.apellidos.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interesado.telefono.includes(searchTerm) ||
      (interesado.vehiculosInteres &&
        JSON.parse(interesado.vehiculosInteres).some((vehiculo: string) =>
          vehiculo.toLowerCase().includes(searchTerm.toLowerCase())
        ))

    // Filtros por intereses
    const precioMaxValue = parseInt(precioMaxFilter)
    const interesadoPrecio = interesado.presupuestoMaximo || 0
    const matchesPrecioMax =
      !precioMaxFilter ||
      (interesadoPrecio > 0 &&
        precioMaxValue > 0 &&
        interesadoPrecio >= precioMaxValue)

    const matchesKilometraje =
      !kilometrajeFilter ||
      ((interesado.kilometrajeMaximo || 0) > 0 &&
        parseInt(kilometrajeFilter) > 0 &&
        (interesado.kilometrajeMaximo || 0) >= parseInt(kilometrajeFilter))

    const matchesAñoMin =
      !añoMinFilter ||
      ((interesado.añoMinimo || 0) > 0 &&
        parseInt(añoMinFilter) > 0 &&
        (interesado.añoMinimo || 0) <= parseInt(añoMinFilter))

    const matchesCombustible =
      !combustibleFilter ||
      interesado.combustiblePreferido === combustibleFilter ||
      (combustibleFilter === 'cualquiera' &&
        interesado.combustiblePreferido === 'cualquiera')

    const matchesCambio =
      !cambioFilter ||
      interesado.cambioPreferido === cambioFilter ||
      (cambioFilter === 'cualquiera' &&
        interesado.cambioPreferido === 'cualquiera')

    const matchesPago =
      !pagoFilter ||
      interesado.formaPagoPreferida === pagoFilter ||
      (pagoFilter === 'cualquiera' &&
        interesado.formaPagoPreferida === 'cualquiera')

    return (
      matchesSearch &&
      matchesPrecioMax &&
      matchesKilometraje &&
      matchesAñoMin &&
      matchesCombustible &&
      matchesCambio &&
      matchesPago
    )
  })

  if (isLoading) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">
              Gestión de Interesados
            </h1>
            <p className="text-slate-600">
              Registra y haz seguimiento de todos los interesados
            </p>
          </div>
          <LoadingSkeleton />
        </main>
      </div>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-orange-50 to-red-100">
        <main className="w-[80%] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          {/* Header Moderno - Estilo Navegación */}
          <div className="mb-4 sm:mb-6">
            {/* Título y stats compactos */}
            <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 mb-4">
              <div className="px-4 sm:px-6 py-3 sm:py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center space-x-3 sm:space-x-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-5 h-5 sm:w-6 sm:h-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-lg sm:text-xl font-bold text-white">
                        Interesados
                      </h1>
                      <p className="text-slate-300 text-xs sm:text-sm">
                        {interesados.length} registrados •{' '}
                        {filteredInteresados.length} mostrados
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <button
                      onClick={handleCreate}
                      className="px-3 sm:px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg text-xs sm:text-sm font-medium transition-all shadow-lg flex items-center space-x-1 sm:space-x-2"
                    >
                      <svg
                        className="w-3 h-3 sm:w-4 sm:h-4"
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
                      <span>Nuevo</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Barra de filtros mejorada - Dos líneas */}
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/60 p-4 space-y-4">
              {/* LÍNEA 1: Búsqueda + Vista */}
              <div className="flex items-center gap-4">
                {/* Búsqueda unificada */}
                <div className="flex-1">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar por nombre, teléfono o vehículo de interés..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white transition-all shadow-sm"
                    />
                    <svg
                      className="absolute left-4 top-3.5 h-5 w-5 text-slate-400"
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
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                      >
                        <svg
                          className="h-5 w-5"
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
                </div>

                {/* Vista con iconos - Solo a la derecha */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-600">
                    👁️ Vista:
                  </span>
                  <div className="flex bg-slate-100 rounded-xl p-1">
                    <button
                      onClick={() => setViewMode('cards')}
                      className={`px-3 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                        viewMode === 'cards'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                      title="Vista de cartas"
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
                          d="M19 11H5m14-7v16l-2-2v-12a2 2 0 00-2-2H9a2 2 0 00-2 2v12l-2 2V4a2 2 0 012-2h10a2 2 0 012 2z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`px-3 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                        viewMode === 'list'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                      title="Vista de lista"
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
                          d="M4 6h16M4 10h16M4 14h16M4 18h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* LÍNEA 2: Filtros avanzados */}
              <div className="flex items-center justify-center">
                {/* Filtros avanzados */}
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`px-3 lg:px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center space-x-1 lg:space-x-2 ${
                    showAdvancedFilters
                      ? 'bg-orange-100 text-orange-700 border border-orange-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
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
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z"
                    />
                  </svg>
                  <span className="hidden lg:inline">Filtros Avanzados</span>
                  <span className="lg:hidden">Avanzados</span>
                </button>
              </div>

              {/* Filtros avanzados expandibles */}
              {showAdvancedFilters && (
                <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/60 p-4">
                  <h3 className="text-sm font-medium text-slate-700 mb-4">
                    🔍 Filtros por Intereses
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Precio máximo (€)
                      </label>
                      <input
                        type="number"
                        placeholder="Ej: 15000"
                        value={precioMaxFilter}
                        onChange={(e) => setPrecioMaxFilter(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Kilometraje máximo
                      </label>
                      <input
                        type="number"
                        placeholder="Ej: 50000"
                        value={kilometrajeFilter}
                        onChange={(e) => setKilometrajeFilter(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Año mínimo
                      </label>
                      <input
                        type="number"
                        placeholder="Ej: 2020"
                        value={añoMinFilter}
                        onChange={(e) => setAñoMinFilter(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Combustible
                      </label>
                      <select
                        value={combustibleFilter}
                        onChange={(e) => setCombustibleFilter(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      >
                        <option value="">Todos</option>
                        <option value="diesel">Diésel</option>
                        <option value="gasolina">Gasolina</option>
                        <option value="hibrido">Híbrido</option>
                        <option value="electrico">Eléctrico</option>
                        <option value="cualquiera">Cualquiera</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Cambio
                      </label>
                      <select
                        value={cambioFilter}
                        onChange={(e) => setCambioFilter(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      >
                        <option value="">Todos</option>
                        <option value="manual">Manual</option>
                        <option value="automatico">Automático</option>
                        <option value="cualquiera">Cualquiera</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Forma de pago
                      </label>
                      <select
                        value={pagoFilter}
                        onChange={(e) => setPagoFilter(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      >
                        <option value="">Todas</option>
                        <option value="financiacion">Financiación</option>
                        <option value="contado">Contado</option>
                        <option value="entrega_usado">Entrega de usado</option>
                        <option value="cualquiera">Cualquiera</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-600">
                      Mostrando {filteredInteresados.length} de{' '}
                      {interesados.length} interesados
                    </div>
                    <button
                      onClick={() => {
                        setPrecioMaxFilter('')
                        setKilometrajeFilter('')
                        setAñoMinFilter('')
                        setCombustibleFilter('')
                        setCambioFilter('')
                        setPagoFilter('')
                      }}
                      className="text-sm text-gray-600 hover:text-gray-800 underline"
                    >
                      Limpiar filtros
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Lista de interesados */}
          {filteredInteresados.length === 0 ? (
            <div className="text-center py-12">
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
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm
                  ? 'No se encontraron interesados'
                  : 'No hay interesados registrados'}
              </h3>
              <p className="text-gray-500 mb-6">
                {searchTerm
                  ? 'Intenta con otros términos de búsqueda'
                  : 'Comienza creando tu primer interesado'}
              </p>
              {!searchTerm && (
                <button
                  onClick={handleCreate}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  Crear Primer Interesado
                </button>
              )}
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredInteresados.map((interesado) => {
                const vehiculos = interesado.vehiculosInteres
                  ? (() => {
                      try {
                        return JSON.parse(interesado.vehiculosInteres)
                      } catch {
                        return []
                      }
                    })()
                  : []

                return (
                  <div
                    key={interesado.id}
                    className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-xl transition-all duration-200 cursor-pointer group"
                    onClick={() => handleView(interesado.id)}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {capitalizeText(interesado.nombre)}{' '}
                          {capitalizeText(interesado.apellidos)}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {interesado.telefono}
                        </p>
                      </div>
                      <div
                        className="flex space-x-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleDeleteClick(interesado)}
                          className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                          title="Eliminar interesado"
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600">
                      <p>
                        <span className="font-medium">Interés:</span>{' '}
                        <span>
                          {vehiculos.length > 0
                            ? vehiculos.join(', ')
                            : 'No especificado'}
                        </span>
                      </p>
                      {interesado.presupuestoMaximo && (
                        <p>
                          <span className="font-medium">Presupuesto:</span>{' '}
                          <span>
                            €{interesado.presupuestoMaximo.toLocaleString()}
                          </span>
                        </p>
                      )}
                      {interesado.formaPagoPreferida &&
                        interesado.formaPagoPreferida !== 'cualquiera' && (
                          <p>
                            <span className="font-medium">Pago:</span>{' '}
                            <span className="capitalize">
                              {interesado.formaPagoPreferida}
                            </span>
                          </p>
                        )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Interesado
                      </th>
                      <th className="hidden sm:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contacto
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Interés
                      </th>
                      <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Precio Máx
                      </th>
                      <th className="hidden xl:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Forma de Pago
                      </th>
                      <th className="hidden xl:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredInteresados.map((interesado) => {
                      const vehiculos = interesado.vehiculosInteres
                        ? (() => {
                            try {
                              return JSON.parse(interesado.vehiculosInteres)
                            } catch {
                              return []
                            }
                          })()
                        : []

                      return (
                        <tr
                          key={interesado.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => handleView(interesado.id)}
                        >
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-xs sm:text-sm font-medium text-gray-900">
                              {capitalizeText(interesado.nombre)}{' '}
                              {capitalizeText(interesado.apellidos)}
                            </div>
                          </td>
                          <td className="hidden sm:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-xs sm:text-sm text-gray-600">
                              {interesado.telefono}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-xs sm:text-sm text-gray-600">
                              {vehiculos.length > 0
                                ? vehiculos.join(', ')
                                : 'No especificado'}
                            </div>
                          </td>
                          <td className="hidden lg:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-xs sm:text-sm text-gray-600">
                              {interesado.presupuestoMaximo
                                ? `€${interesado.presupuestoMaximo.toLocaleString()}`
                                : '-'}
                            </div>
                          </td>
                          <td className="hidden xl:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-xs sm:text-sm text-gray-600 capitalize">
                              {interesado.formaPagoPreferida || '-'}
                            </div>
                          </td>
                          <td className="hidden xl:table-cell px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                            <div
                              className="flex space-x-1 sm:space-x-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => handleDeleteClick(interesado)}
                                className="p-1 sm:p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                title="Eliminar interesado"
                              >
                                <svg
                                  className="w-3 h-3 sm:w-4 sm:h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Modal de confirmación de eliminación */}
          {interesadoToDelete && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0">
                    <svg
                      className="w-8 h-8 text-red-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-medium text-gray-900">
                      Eliminar Interesado
                    </h3>
                    <p className="text-sm text-gray-500">
                      Esta acción no se puede deshacer
                    </p>
                  </div>
                </div>

                <div className="mb-6">
                  <p className="text-sm text-gray-600">
                    ¿Estás seguro de que quieres eliminar al interesado{' '}
                    <strong>
                      {interesadoToDelete.nombre} {interesadoToDelete.apellidos}
                    </strong>
                    ?
                    <br />
                    <span className="text-red-600 font-medium">
                      Todos los datos asociados se perderán permanentemente.
                    </span>
                  </p>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={handleDeleteCancel}
                    disabled={isDeleting}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    disabled={isDeleting}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                  >
                    {isDeleting ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <ToastContainer />
        </main>
      </div>
    </ProtectedRoute>
  )
}
