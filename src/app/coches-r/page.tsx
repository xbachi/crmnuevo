'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { useConfirmModal } from '@/components/ConfirmModal'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import VehicleCard from '@/components/VehicleCard'
import {
  formatVehicleReference,
  generateVehicleSlug,
  capitalizeText,
} from '@/lib/utils'
import ProtectedRoute from '@/components/ProtectedRoute'

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  tipo: string
  estado:
    | 'SIN_ESTADO'
    | 'REVI_INIC'
    | 'MECAUTO'
    | 'REVI_PINTURA'
    | 'PINTURA'
    | 'LIMPIEZA'
    | 'FOTOS'
    | 'PUBLICADO'
    | 'VENDIDO'
    | 'RESERVADO'
  orden: number
  createdAt: string
  updatedAt?: string
  color?: string
  fechaMatriculacion?: string
  esCocheInversor?: boolean
  inversorId?: number
  inversorNombre?: string
  fechaCompra?: string
  precioCompra?: number
  gastosTransporte?: number
  gastosTasas?: number
  gastosMecanica?: number
  gastosPintura?: number
  gastosLimpieza?: number
  gastosOtros?: number
  precioPublicacion?: number
  precioVenta?: number
  beneficioNeto?: number
  notasInversor?: string
  itv?: string
  fotoInversor?: string
  seguro?: string
  segundaLlave?: string
  carpeta?: string
  master?: string
  hojasA?: string
  documentacion?: string
}

export default function CochesRPage() {
  const router = useRouter()
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [filteredVehiculos, setFilteredVehiculos] = useState<Vehiculo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'lista' | 'cartas'>('cartas')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'todos' | 'publicados' | 'enProceso' | 'vendidos' | 'reservados'
  >('todos')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [editingVehiculo, setEditingVehiculo] = useState<Vehiculo | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editFormData, setEditFormData] = useState({
    referencia: '',
    marca: '',
    modelo: '',
    matricula: '',
    bastidor: '',
    kms: '',
    tipo: '',
    estado: 'SIN_ESTADO',
    color: '',
    fechaMatriculacion: '',
    inversorId: '',
  })
  const [isUpdating, setIsUpdating] = useState(false)
  const { showToast, ToastContainer } = useToast()
  const { showConfirm } = useConfirmModal()

  useEffect(() => {
    fetchCochesR()
  }, [])

  useEffect(() => {
    filterVehiculos()
  }, [vehiculos, searchTerm, statusFilter, sortOrder])

  const fetchCochesR = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/coches-r')
      if (response.ok) {
        const data = await response.json()
        setVehiculos(data)
      } else {
        showToast('Error al cargar Coches R', 'error')
      }
    } catch (error) {
      console.error('Error fetching Coches R:', error)
      showToast('Error al cargar Coches R', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const filterVehiculos = () => {
    let filtered = [...vehiculos]

    // Filtrar por término de búsqueda
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter((vehiculo) => {
        return (
          capitalizeText(vehiculo.marca).toLowerCase().includes(searchLower) ||
          capitalizeText(vehiculo.modelo).toLowerCase().includes(searchLower) ||
          vehiculo.referencia.toLowerCase().includes(searchLower) ||
          vehiculo.matricula.toLowerCase().includes(searchLower) ||
          vehiculo.bastidor.toLowerCase().includes(searchLower)
        )
      })
    }

    // Filtrar por estado
    if (statusFilter !== 'todos') {
      filtered = filtered.filter((vehiculo) => {
        const estado = vehiculo.estado?.toString().toLowerCase() || ''

        switch (statusFilter) {
          case 'publicados':
            return estado === 'publicado'
          case 'enProceso':
            return (
              !estado ||
              estado === '' ||
              [
                'sin_estado',
                'inicial',
                'revi_inic',
                'mecauto',
                'revi_pintura',
                'pintura',
                'limpieza',
                'fotos',
              ].includes(estado)
            )
          case 'reservados':
            return estado === 'reservado'
          case 'vendidos':
            return estado === 'vendido'
          default:
            return true
        }
      })
    }

    // Aplicar ordenamiento por referencia
    filtered.sort((a, b) => {
      const refA = a.referencia
      const refB = b.referencia

      const numA = parseInt(refA)
      const numB = parseInt(refB)

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortOrder === 'asc' ? numA - numB : numB - numA
      }

      if (sortOrder === 'asc') {
        return refA.localeCompare(refB)
      } else {
        return refB.localeCompare(refA)
      }
    })

    setFilteredVehiculos(filtered)
  }

  // Funciones para contar vehículos por estado
  const getStatusCounts = () => {
    const isVendido = (estado: string | null | undefined): boolean => {
      if (!estado) return false
      const normalized = estado.toString().toLowerCase().trim()
      return normalized === 'vendido'
    }

    const isReservado = (estado: string | null | undefined): boolean => {
      if (!estado) return false
      const normalized = estado.toString().toLowerCase().trim()
      return normalized === 'reservado'
    }

    const isPublicado = (estado: string | null | undefined): boolean => {
      if (!estado) return false
      const normalized = estado.toString().toLowerCase().trim()
      return normalized === 'publicado'
    }

    const isEnProceso = (estado: string | null | undefined): boolean => {
      if (!estado || estado.trim() === '') return true
      const normalized = estado.toString().toLowerCase().trim()
      const estadosProceso = [
        'sin_estado',
        'inicial',
        'revi_inic',
        'mecauto',
        'revi_pintura',
        'pintura',
        'limpieza',
        'fotos',
      ]
      return estadosProceso.includes(normalized)
    }

    return {
      publicados: vehiculos.filter((v) => isPublicado(v.estado)).length,
      enProceso: vehiculos.filter((v) => isEnProceso(v.estado)).length,
      vendidos: vehiculos.filter((v) => isVendido(v.estado)).length,
      reservados: vehiculos.filter((v) => isReservado(v.estado)).length,
      todos: vehiculos.length,
    }
  }

  const handleEdit = (vehiculo: Vehiculo) => {
    setEditingVehiculo(vehiculo)
    setEditFormData({
      referencia: vehiculo.referencia,
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      matricula: vehiculo.matricula,
      bastidor: vehiculo.bastidor,
      kms: vehiculo.kms.toString(),
      tipo: 'R',
      estado: vehiculo.estado || 'SIN_ESTADO',
      color: vehiculo.color || '',
      fechaMatriculacion: vehiculo.fechaMatriculacion || '',
      inversorId: vehiculo.inversorId?.toString() || '',
    })
    setShowEditModal(true)
  }

  const handleDelete = (vehiculo: Vehiculo) => {
    const vehiculoName = vehiculo
      ? `${capitalizeText(vehiculo.marca)} ${capitalizeText(vehiculo.modelo)} (${formatVehicleReference(vehiculo.referencia, vehiculo.tipo)})`
      : 'este vehículo'

    showConfirm(
      'Eliminar Coche R',
      `¿Estás seguro de que quieres eliminar ${vehiculoName}? Esta acción no se puede deshacer.`,
      async () => {
        try {
          const response = await fetch(`/api/vehiculos/${vehiculo.id}`, {
            method: 'DELETE',
          })

          if (response.ok) {
            await fetchCochesR()
            showToast('Coche R eliminado exitosamente', 'success')
          } else {
            showToast('Error al eliminar el Coche R', 'error')
          }
        } catch (error) {
          console.error('Error eliminando Coche R:', error)
          showToast('Error al eliminar el Coche R', 'error')
        }
      },
      'danger'
    )
  }

  const handleEditInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setEditFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingVehiculo) return

    setIsUpdating(true)
    try {
      const updatedVehiculo = {
        id: editingVehiculo.id,
        referencia: editFormData.referencia,
        marca: editFormData.marca,
        modelo: editFormData.modelo,
        matricula: editFormData.matricula,
        bastidor: editFormData.bastidor,
        kms: parseInt(editFormData.kms),
        tipo: editFormData.tipo,
        estado: editFormData.estado,
        color: editFormData.color,
        fechaMatriculacion: editFormData.fechaMatriculacion,
        esCocheInversor: editFormData.tipo === 'Inversor',
        inversorId:
          editFormData.tipo === 'Inversor'
            ? parseInt(editFormData.inversorId)
            : undefined,
      }

      const response = await fetch(`/api/vehiculos/${editingVehiculo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedVehiculo),
      })

      if (response.ok) {
        await fetchCochesR()
        setShowEditModal(false)
        setEditingVehiculo(null)
        showToast('Coche R actualizado exitosamente', 'success')
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      console.error('Error actualizando Coche R:', error)
      showToast('Error al actualizar el Coche R', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const closeEditModal = () => {
    setShowEditModal(false)
    setEditingVehiculo(null)
    setEditFormData({
      referencia: '',
      marca: '',
      modelo: '',
      matricula: '',
      bastidor: '',
      kms: '',
      tipo: '',
      estado: 'SIN_ESTADO',
      color: '',
      fechaMatriculacion: '',
      inversorId: '',
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-red-50 to-red-100">
        <div className="w-[80%] mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Coches R</h1>
            <p className="text-slate-600">
              Vehículos vendidos "en el estado" sin garantía
            </p>
          </div>
          <LoadingSkeleton />
        </div>
      </div>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-red-50 to-red-100">
        <div className="w-full px-4 sm:px-8 xl:px-12 py-4 sm:py-8 md:ml-0">
          {/* Header Moderno - Estilo Navegación */}
          <div className="mb-4 sm:mb-6">
            {/* Título y stats compactos */}
            <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 mb-4">
              <div className="px-4 sm:px-6 py-3 sm:py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center space-x-3 sm:space-x-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-5 h-5 sm:w-6 sm:h-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                        <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1V8a1 1 0 00-1-1h-3z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-lg sm:text-xl font-bold text-white">
                        Coches R
                      </h1>
                      <p className="text-slate-300 text-xs sm:text-sm">
                        {vehiculos.length} registrados •{' '}
                        {filteredVehiculos.length} mostrados
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <a
                      href="/cargar-vehiculo"
                      className="px-3 sm:px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 flex items-center space-x-1 sm:space-x-2 shadow-lg"
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
                      <span className="hidden sm:inline">Nuevo Coche R</span>
                      <span className="sm:hidden">+</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Panel de Filtros y Búsqueda */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200/60 p-4 sm:p-6">
              <div className="space-y-4">
                {/* Búsqueda */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <svg
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4"
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
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white/80 backdrop-blur-sm"
                      />
                    </div>
                  </div>

                  {/* Botones de vista */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setViewMode('cartas')}
                      className={`p-2 rounded-lg transition-colors ${
                        viewMode === 'cartas'
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
                      onClick={() => setViewMode('lista')}
                      className={`p-2 rounded-lg transition-colors ${
                        viewMode === 'lista'
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

                {/* Filtros de estado */}
                <div className="flex flex-col xl:flex-row items-start xl:items-center gap-2 xl:gap-4">
                  <span className="text-xs xl:text-sm font-semibold text-slate-700 flex items-center gap-1">
                    📊 Estado:
                  </span>
                  <div className="flex flex-wrap bg-slate-50 rounded-lg p-1 border border-slate-200 gap-1">
                    <button
                      onClick={() => setStatusFilter('publicados')}
                      className={`px-2 xl:px-4 py-1 xl:py-2 text-xs xl:text-sm font-medium rounded-md transition-all flex items-center gap-1 ${
                        statusFilter === 'publicados'
                          ? 'bg-green-50 text-green-700 shadow-sm border border-green-200'
                          : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                      }`}
                    >
                      <span className="text-xs">✅</span>
                      <span className="hidden xl:inline">Publicados</span>
                      <span className="text-xs">
                        ({getStatusCounts().publicados})
                      </span>
                    </button>
                    <button
                      onClick={() => setStatusFilter('enProceso')}
                      className={`px-2 xl:px-4 py-1 xl:py-2 text-xs xl:text-sm font-medium rounded-md transition-all flex items-center gap-1 ${
                        statusFilter === 'enProceso'
                          ? 'bg-orange-50 text-orange-700 shadow-sm border border-orange-200'
                          : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                      }`}
                    >
                      <span className="text-xs">🔧</span>
                      <span className="hidden xl:inline">En Proceso</span>
                      <span className="text-xs">
                        ({getStatusCounts().enProceso})
                      </span>
                    </button>
                    <button
                      onClick={() => setStatusFilter('reservados')}
                      className={`px-2 xl:px-4 py-1 xl:py-2 text-xs xl:text-sm font-medium rounded-md transition-all flex items-center gap-1 ${
                        statusFilter === 'reservados'
                          ? 'bg-yellow-50 text-yellow-700 shadow-sm border border-yellow-200'
                          : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                      }`}
                    >
                      <span className="text-xs">🔒</span>
                      <span className="hidden xl:inline">Reservados</span>
                      <span className="text-xs">
                        ({getStatusCounts().reservados})
                      </span>
                    </button>
                    <button
                      onClick={() => setStatusFilter('vendidos')}
                      className={`px-2 xl:px-4 py-1 xl:py-2 text-xs xl:text-sm font-medium rounded-md transition-all flex items-center gap-1 ${
                        statusFilter === 'vendidos'
                          ? 'bg-red-50 text-red-700 shadow-sm border border-red-200'
                          : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                      }`}
                    >
                      <span className="text-xs">💰</span>
                      <span className="hidden xl:inline">Vendidos</span>
                      <span className="text-xs">
                        ({getStatusCounts().vendidos})
                      </span>
                    </button>
                    <button
                      onClick={() => setStatusFilter('todos')}
                      className={`px-2 xl:px-4 py-1 xl:py-2 text-xs xl:text-sm font-medium rounded-md transition-all flex items-center gap-1 ${
                        statusFilter === 'todos'
                          ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                          : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                      }`}
                    >
                      <span className="text-xs">⚪</span>
                      <span className="hidden xl:inline">Todos</span>
                      <span className="text-xs">
                        ({getStatusCounts().todos})
                      </span>
                    </button>
                  </div>
                </div>

                {/* Ordenamiento */}
                <div className="flex items-center gap-2">
                  <span className="text-xs xl:text-sm font-medium text-slate-600">
                    📊 Orden:
                  </span>
                  <button
                    onClick={() =>
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                    }
                    className={`px-2 xl:px-4 py-1 xl:py-2 text-xs xl:text-sm font-medium rounded-lg border-2 transition-all flex items-center space-x-1 xl:space-x-2 ${
                      sortOrder === 'asc'
                        ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                        : 'bg-orange-50 border-orange-200 text-orange-700 shadow-sm'
                    }`}
                  >
                    <span className="hidden xl:inline">Ref.</span>
                    <span className="xl:hidden">#</span>
                    {sortOrder === 'asc' ? (
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
                          d="M5 15l7-7 7 7"
                        />
                      </svg>
                    ) : (
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
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Contenido principal */}
          {vehiculos.length === 0 ? (
            <div className="text-center py-16">
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-12 border border-slate-200/60 shadow-lg">
                <div className="text-6xl mb-6">🚗</div>
                <h3 className="text-2xl font-bold text-slate-800 mb-4">
                  No hay Coches R registrados
                </h3>
                <p className="text-slate-600 mb-8 text-lg">
                  Comienza cargando tu primer Coche R al sistema
                </p>
                <a
                  href="/cargar-vehiculo"
                  className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
                >
                  ➕ Cargar Coche R
                </a>
              </div>
            </div>
          ) : filteredVehiculos.length === 0 ? (
            <div className="text-center py-16">
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-12 border border-slate-200/60 shadow-lg">
                <div className="text-6xl mb-6">🔍</div>
                <h3 className="text-2xl font-bold text-slate-800 mb-4">
                  No se encontraron Coches R
                </h3>
                <p className="text-slate-600 mb-8 text-lg">
                  No hay Coches R que coincidan con tu búsqueda "{searchTerm}"
                </p>
                <button
                  onClick={() => setSearchTerm('')}
                  className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
                >
                  🔄 Limpiar búsqueda
                </button>
              </div>
            </div>
          ) : viewMode === 'cartas' ? (
            /* Vista de Tarjetas */
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              }}
            >
              {filteredVehiculos.map((vehiculo, index) => (
                <VehicleCard
                  key={`${vehiculo.id}-${vehiculo.updatedAt}-${index}`}
                  vehiculo={vehiculo}
                  onEdit={handleEdit}
                  onDelete={(id: number) => {
                    const v = filteredVehiculos.find((veh) => veh.id === id)
                    if (v) handleDelete(v)
                  }}
                  onView={() => {
                    router.push(`/vehiculos/${generateVehicleSlug(vehiculo)}`)
                  }}
                />
              ))}
            </div>
          ) : (
            /* Vista de Lista - Implementar si es necesario */
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden max-w-[1400px] mx-auto">
              <div className="p-8 text-center">
                <h3 className="text-xl font-semibold text-slate-800 mb-2">
                  Vista de Lista
                </h3>
                <p className="text-slate-600">
                  La vista de lista para Coches R estará disponible próximamente
                </p>
              </div>
            </div>
          )}

          {/* Modal de Edición */}
          {showEditModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-200/60 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header del Modal */}
                <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 rounded-t-2xl">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-white">
                      Editar Coche R
                    </h2>
                    <button
                      onClick={closeEditModal}
                      className="text-white hover:text-red-100 transition-colors"
                    >
                      <svg
                        className="w-6 h-6"
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
                  </div>
                </div>

                {/* Formulario de Edición */}
                <form onSubmit={handleUpdate} className="p-6 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-2">
                      <label
                        htmlFor="edit-referencia"
                        className="block text-sm font-semibold text-slate-700"
                      >
                        Referencia *
                      </label>
                      <input
                        type="text"
                        id="edit-referencia"
                        name="referencia"
                        value={editFormData.referencia}
                        onChange={handleEditInputChange}
                        required
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                        placeholder="Ej: R-08"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="edit-tipo"
                        className="block text-sm font-semibold text-slate-700"
                      >
                        Tipo *
                      </label>
                      <select
                        id="edit-tipo"
                        name="tipo"
                        value={editFormData.tipo}
                        onChange={handleEditInputChange}
                        required
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                      >
                        <option value="R">Coche R</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="edit-marca"
                        className="block text-sm font-semibold text-slate-700"
                      >
                        Marca *
                      </label>
                      <input
                        type="text"
                        id="edit-marca"
                        name="marca"
                        value={editFormData.marca}
                        onChange={handleEditInputChange}
                        required
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                        placeholder="Ej: Citroën"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="edit-modelo"
                        className="block text-sm font-semibold text-slate-700"
                      >
                        Modelo *
                      </label>
                      <input
                        type="text"
                        id="edit-modelo"
                        name="modelo"
                        value={editFormData.modelo}
                        onChange={handleEditInputChange}
                        required
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                        placeholder="Ej: C4"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="edit-matricula"
                        className="block text-sm font-semibold text-slate-700"
                      >
                        Matrícula *
                      </label>
                      <input
                        type="text"
                        id="edit-matricula"
                        name="matricula"
                        value={editFormData.matricula}
                        onChange={handleEditInputChange}
                        required
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                        placeholder="Ej: 0539GNZ"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="edit-bastidor"
                        className="block text-sm font-semibold text-slate-700"
                      >
                        Bastidor *
                      </label>
                      <input
                        type="text"
                        id="edit-bastidor"
                        name="bastidor"
                        value={editFormData.bastidor}
                        onChange={handleEditInputChange}
                        required
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                        placeholder="Ej: VF7LC9HXC9Y538403"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="edit-kms"
                        className="block text-sm font-semibold text-slate-700"
                      >
                        Kilómetros *
                      </label>
                      <input
                        type="number"
                        id="edit-kms"
                        name="kms"
                        value={editFormData.kms}
                        onChange={handleEditInputChange}
                        required
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                        placeholder="Ej: 150000"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="edit-color"
                        className="block text-sm font-semibold text-slate-700"
                      >
                        Color
                      </label>
                      <input
                        type="text"
                        id="edit-color"
                        name="color"
                        value={editFormData.color}
                        onChange={handleEditInputChange}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                        placeholder="Ej: Blanco"
                      />
                    </div>
                  </div>

                  {/* Botones */}
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4">
                    <button
                      type="button"
                      onClick={closeEditModal}
                      className="flex-1 px-6 py-3 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-all duration-200 font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdating}
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl transition-all duration-200 font-medium flex items-center justify-center space-x-2"
                    >
                      {isUpdating ? (
                        <>
                          <svg
                            className="w-5 h-5 animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          <span>Actualizando...</span>
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span>Actualizar Coche R</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
      <ToastContainer />
    </ProtectedRoute>
  )
}
