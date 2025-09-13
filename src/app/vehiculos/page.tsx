'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/components/Toast'
import { useConfirmModal } from '@/components/ConfirmModal'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import VehicleCard from '@/components/VehicleCard'

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  tipo: string
  estado: string
  orden: number
  createdAt: string
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
}

export default function ListaVehiculos() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [filteredVehiculos, setFilteredVehiculos] = useState<Vehiculo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'lista' | 'cartas'>('cartas')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchField, setSearchField] = useState<'todos' | 'referencia' | 'marca' | 'modelo' | 'matricula' | 'bastidor' | 'tipo'>('todos')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'activos' | 'vendidos'>('todos')
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
    inversorId: ''
  })
  const [inversores, setInversores] = useState<any[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  const { showToast, ToastContainer } = useToast()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()

  const getTipoText = (tipo: string) => {
    const tipos = {
      'Compra': 'Compra',
      'Coche R': 'Coche R',
      'Deposito Venta': 'Deposito Venta',
      'Inversor': 'Inversor'
    }
    return tipos[tipo as keyof typeof tipos] || tipo
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'Compra':
        return 'bg-blue-100 text-blue-800'
      case 'Coche R':
        return 'bg-orange-100 text-orange-800'
      case 'Deposito Venta':
        return 'bg-green-100 text-green-800'
      case 'Inversor':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  useEffect(() => {
    // Limpiar cache al cargar la página para mostrar datos actuales
    localStorage.removeItem('vehiculos-cache')
    localStorage.removeItem('vehiculos-cache-time')
    fetchVehiculos(true)
    fetchInversores()
  }, [])

  const fetchInversores = async () => {
    try {
      const response = await fetch('/api/inversores')
      if (response.ok) {
        const data = await response.json()
        setInversores(data)
      }
    } catch (error) {
      console.error('Error al cargar inversores:', error)
    }
  }

  useEffect(() => {
    filterVehiculos()
  }, [vehiculos, searchTerm, searchField, statusFilter])

  const filterVehiculos = () => {
    let filtered = vehiculos

    // Aplicar filtro de estado primero
    if (statusFilter !== 'todos') {
      filtered = filtered.filter(vehiculo => {
        const isVendido = (estado: string | null | undefined): boolean => {
          if (!estado) return false
          const normalized = estado.toString().toLowerCase().trim()
          return normalized === 'vendido'
        }
        
        if (statusFilter === 'activos') {
          return !isVendido(vehiculo.estado)
        } else if (statusFilter === 'vendidos') {
          return isVendido(vehiculo.estado)
        }
        return true
      })
    }

    // Aplicar filtro de búsqueda
    if (searchTerm.trim()) {
      filtered = filtered.filter(vehiculo => {
        if (searchField === 'todos') {
          return (
            vehiculo.referencia.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vehiculo.marca.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vehiculo.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vehiculo.matricula.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vehiculo.bastidor.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vehiculo.tipo.toLowerCase().includes(searchTerm.toLowerCase())
          )
        } else {
          const fieldValue = vehiculo[searchField].toString().toLowerCase()
          return fieldValue.includes(searchTerm.toLowerCase())
        }
      })
    }

    setFilteredVehiculos(filtered)
  }

  const fetchVehiculos = async (forceRefresh = false) => {
    try {
      setIsLoading(true)
      
      // Usar cache del navegador si está disponible y no se fuerza refresh
      const cacheKey = 'vehiculos-cache'
      const cachedData = localStorage.getItem(cacheKey)
      const cacheTime = localStorage.getItem(`${cacheKey}-time`)
      
      // Si hay datos en cache y son recientes (menos de 5 minutos), usarlos
      if (!forceRefresh && cachedData && cacheTime) {
        const now = Date.now()
        const cacheAge = now - parseInt(cacheTime)
        if (cacheAge < 5 * 60 * 1000) { // 5 minutos
          const cachedVehiculos = JSON.parse(cachedData)
          setVehiculos(cachedVehiculos)
          setIsLoading(false)
          return
        }
      }
      
      const response = await fetch('/api/vehiculos', {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setVehiculos(data)
        
        // Guardar en cache
        localStorage.setItem(cacheKey, JSON.stringify(data))
        localStorage.setItem(`${cacheKey}-time`, Date.now().toString())
      } else {
        showToast('Error al cargar los vehículos', 'error')
      }
    } catch (error) {
      console.error('Error obteniendo vehículos:', error)
      showToast('Error al cargar los vehículos', 'error')
    } finally {
      setIsLoading(false)
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
      tipo: vehiculo.tipo,
      inversorId: vehiculo.inversorId?.toString() || ''
    })
    setShowEditModal(true)
  }

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleDelete = (id: number) => {
    const vehiculo = vehiculos.find(v => v.id === id)
    const vehiculoName = vehiculo ? `${vehiculo.marca} ${vehiculo.modelo} (#${vehiculo.referencia})` : 'este vehículo'
    
    showConfirm(
      'Eliminar Vehículo',
      `¿Estás seguro de que quieres eliminar ${vehiculoName}? Esta acción no se puede deshacer.`,
      async () => {
        try {
          const response = await fetch(`/api/vehiculos?id=${id}`, {
            method: 'DELETE'
          })

          if (response.ok) {
            // Forzar recarga sin usar cache
            await fetchVehiculos(true)
            showToast('Vehículo eliminado exitosamente', 'success')
          } else {
            const error = await response.json()
            showToast(`Error: ${error.error}`, 'error')
          }
        } catch (error) {
          console.error('Error eliminando vehículo:', error)
          showToast('Error al eliminar el vehículo', 'error')
        }
      },
      'danger'
    )
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
        esCocheInversor: editFormData.tipo === 'Inversor',
        inversorId: editFormData.tipo === 'Inversor' ? parseInt(editFormData.inversorId) : undefined
      }

      const response = await fetch('/api/vehiculos', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedVehiculo)
      })

      if (response.ok) {
        // Forzar recarga sin usar cache
        await fetchVehiculos(true)
        setShowEditModal(false)
        setEditingVehiculo(null)
        showToast('Vehículo actualizado exitosamente', 'success')
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      console.error('Error actualizando vehículo:', error)
      showToast('Error al actualizar el vehículo', 'error')
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
      inversorId: ''
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Vehículos</h1>
            <p className="text-slate-600">Gestiona tu inventario de vehículos</p>
          </div>
          <LoadingSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-green-50 to-emerald-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Header */}
        <div className="mb-8">
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-slate-200/60 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-800 mb-2">
                  📋 Lista de Vehículos
                </h1>
                <p className="text-slate-600">
                  {vehiculos.length} vehículo{vehiculos.length !== 1 ? 's' : ''} registrado{vehiculos.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="mt-4 sm:mt-0 flex flex-col space-y-4">
                {/* Barra de búsqueda */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Buscar vehículos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-3 pl-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                      />
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <select
                    value={searchField}
                    onChange={(e) => setSearchField(e.target.value as any)}
                    className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300 min-w-[150px]"
                  >
                    <option value="todos">Todos los campos</option>
                    <option value="referencia">Referencia</option>
                    <option value="marca">Marca</option>
                    <option value="modelo">Modelo</option>
                    <option value="matricula">Matrícula</option>
                    <option value="bastidor">Bastidor</option>
                    <option value="tipo">Tipo</option>
                  </select>
                </div>

                {/* Filtros y acciones */}
                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                  {/* Filtro de vista */}
                  <div className="flex bg-slate-100 rounded-xl p-1">
                    <button
                      onClick={() => setViewMode('lista')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'lista'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      📋 Lista
                    </button>
                    <button
                      onClick={() => setViewMode('cartas')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'cartas'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      🃏 Cartas
                    </button>
                  </div>

                  <div className="flex space-x-4">
                    <button
                      onClick={() => {
                        localStorage.removeItem('vehiculos-cache')
                        localStorage.removeItem('vehiculos-cache-time')
                        fetchVehiculos(true)
                      }}
                      className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
                      title="Actualizar datos desde la base de datos"
                    >
                      🔄 Actualizar
                    </button>
                    <div className="bg-blue-100 rounded-xl px-4 py-2">
                      <span className="text-blue-800 font-semibold text-sm">Total: {vehiculos.length}</span>
                    </div>
                    <div className="bg-green-100 rounded-xl px-4 py-2">
                      <span className="text-green-800 font-semibold text-sm">Mostrando: {filteredVehiculos.length}</span>
                    </div>
                    <a
                      href="/cargar-vehiculo"
                      className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
                    >
                      ➕ Nuevo Vehículo
                    </a>
                    <button
                      onClick={() => {
                        showConfirm(
                          'Borrar Todos los Vehículos',
                          `¿Estás seguro de que quieres eliminar TODOS los ${vehiculos.length} vehículos? Esta acción no se puede deshacer.`,
                          async () => {
                            try {
                              const response = await fetch('/api/vehiculos/clear-all', {
                                method: 'DELETE'
                              })
                              
                              if (response.ok) {
                                localStorage.removeItem('vehiculos-cache')
                                localStorage.removeItem('vehiculos-cache-time')
                                await fetchVehiculos(true)
                                showToast('Todos los vehículos han sido eliminados', 'success')
                              } else {
                                showToast('Error al eliminar los vehículos', 'error')
                              }
                            } catch (error) {
                              console.error('Error eliminando vehículos:', error)
                              showToast('Error al eliminar los vehículos', 'error')
                            }
                          },
                          'danger'
                        )
                      }}
                      className="px-6 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
                    >
                      🗑️ Borrar Todos
                    </button>
                  </div>
                </div>

                {/* Filtros de estado */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-slate-700">Estado:</span>
                    <div className="flex bg-slate-100 rounded-lg p-1">
                      <button
                        onClick={() => setStatusFilter('todos')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                          statusFilter === 'todos'
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        Todos
                      </button>
                      <button
                        onClick={() => setStatusFilter('activos')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                          statusFilter === 'activos'
                            ? 'bg-white text-green-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        Activos
                      </button>
                      <button
                        onClick={() => setStatusFilter('vendidos')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                          statusFilter === 'vendidos'
                            ? 'bg-white text-red-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                        }`}
                      >
                        Vendidos
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contenido principal */}
        {vehiculos.length === 0 ? (
          <div className="text-center py-16">
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-12 border border-slate-200/60 shadow-lg">
              <div className="text-6xl mb-6">🚗</div>
              <h3 className="text-2xl font-bold text-slate-800 mb-4">No hay vehículos registrados</h3>
              <p className="text-slate-600 mb-8 text-lg">Comienza cargando tu primer vehículo al sistema</p>
              <a
                href="/cargar-vehiculo"
                className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
              >
                ➕ Cargar Vehículo
              </a>
            </div>
          </div>
        ) : filteredVehiculos.length === 0 ? (
          <div className="text-center py-16">
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-12 border border-slate-200/60 shadow-lg">
              <div className="text-6xl mb-6">🔍</div>
              <h3 className="text-2xl font-bold text-slate-800 mb-4">No se encontraron vehículos</h3>
              <p className="text-slate-600 mb-8 text-lg">
                No hay vehículos que coincidan con tu búsqueda "{searchTerm}"
              </p>
              <button
                onClick={() => setSearchTerm('')}
                className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
              >
                🔄 Limpiar búsqueda
              </button>
            </div>
          </div>
        ) : viewMode === 'lista' ? (
          /* Vista de Lista */
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden">
            <div className="overflow-hidden">
              <table className="w-full divide-y divide-slate-200 table-fixed">
                <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
                  <tr>
                    <th className="w-24 px-3 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Ref.
                    </th>
                    <th className="w-48 px-3 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Vehículo
                    </th>
                    <th className="w-32 px-3 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Matrícula
                    </th>
                    <th className="w-40 px-3 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider hidden md:table-cell">
                      Bastidor
                    </th>
                    <th className="w-24 px-3 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      KMs
                    </th>
                    <th className="w-32 px-3 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider hidden sm:table-cell">
                      Tipo
                    </th>
                    <th className="w-28 px-3 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider hidden lg:table-cell">
                      Fecha
                    </th>
                    <th className="w-32 px-3 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredVehiculos.map((vehiculo) => (
                    <tr key={vehiculo.id} className="hover:bg-slate-50/80 transition-colors duration-200">
                      <td className="px-3 py-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center mr-2">
                            <span className="text-white font-bold text-xs">
                              #{vehiculo.referencia.length > 4 
                                ? vehiculo.referencia.substring(0, 4) 
                                : vehiculo.referencia
                              }
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div>
                          <div className="text-slate-900 font-semibold text-sm truncate">
                            {vehiculo.marca} {vehiculo.modelo}
                          </div>
                {/* Alerta de ITV vencida o info básica */}
                {(vehiculo.itv === 'No' || vehiculo.itv === 'no' || vehiculo.itv === 'NO' || vehiculo.itv === false || !vehiculo.itv) && vehiculo.itv !== 'Sí' && vehiculo.itv !== 'si' && vehiculo.itv !== 'SI' ? (
                            <div className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-red-600 rounded-full mt-1">
                              <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              <span className="text-xs text-white font-semibold">ITV VENCIDA</span>
                            </div>
                          ) : (
                            <div className="text-slate-500 text-xs">Vehículo</div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="bg-slate-100 rounded-lg px-2 py-1 inline-block">
                          <span className="text-slate-800 font-mono font-bold text-sm">
                            {vehiculo.matricula}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-4 hidden md:table-cell">
                        <span className="text-slate-600 font-mono text-xs bg-slate-50 px-2 py-1 rounded truncate block">
                          {vehiculo.bastidor.length > 12 
                            ? `${vehiculo.bastidor.substring(0, 12)}...` 
                            : vehiculo.bastidor
                          }
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <span className="text-slate-800 font-bold text-sm">
                          {vehiculo.kms.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-4 hidden sm:table-cell">
                        <div className="flex flex-col space-y-1">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTipoColor(vehiculo.tipo)}`}>
                            {getTipoText(vehiculo.tipo)}
                          </span>
                          {vehiculo.esCocheInversor && vehiculo.inversorNombre && (
                            <span className="inline-flex px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded border border-purple-200">
                              {vehiculo.inversorNombre}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4 hidden lg:table-cell text-slate-600 text-xs">
                        {new Date(vehiculo.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-1">
                          <button 
                            onClick={() => handleEdit(vehiculo)}
                            className="text-green-600 hover:text-green-800 hover:bg-green-50 px-2 py-1 rounded text-xs transition-all duration-200"
                          >
                            ✏️
                          </button>
                          <button 
                            onClick={() => handleDelete(vehiculo.id)}
                            className="text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded text-xs transition-all duration-200"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Vista de Cartas */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {filteredVehiculos.map((vehiculo) => (
              <VehicleCard
                key={vehiculo.id}
                vehiculo={vehiculo}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onView={(id) => {
                  // Función para ver detalles del vehículo
                  console.log('Ver vehículo:', id)
                }}
              />
            ))}
          </div>
        )}

        {/* Botón flotante para agregar vehículo */}
        <div className="fixed bottom-6 right-6 z-50">
          <a
            href="/cargar-vehiculo"
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-2xl p-4 shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-110 hover:-translate-y-1"
            title="Cargar nuevo vehículo"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </a>
        </div>

        {/* Modal de Edición */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-200/60 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header del Modal */}
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 rounded-t-2xl">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-white">Editar Vehículo</h2>
                  <button
                    onClick={closeEditModal}
                    className="text-white hover:text-green-100 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Formulario de Edición */}
              <form onSubmit={handleUpdate} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="edit-referencia" className="block text-sm font-semibold text-slate-700">
                      Referencia *
                    </label>
                    <input
                      type="text"
                      id="edit-referencia"
                      name="referencia"
                      value={editFormData.referencia}
                      onChange={handleEditInputChange}
                      required
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                      placeholder="Ej: #1040"
                    />
                  </div>

                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="edit-marca" className="block text-sm font-semibold text-slate-700">
                      Marca *
                    </label>
                    <input
                      type="text"
                      id="edit-marca"
                      name="marca"
                      value={editFormData.marca}
                      onChange={handleEditInputChange}
                      required
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                      placeholder="Ej: Opel"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="edit-modelo" className="block text-sm font-semibold text-slate-700">
                      Modelo *
                    </label>
                    <input
                      type="text"
                      id="edit-modelo"
                      name="modelo"
                      value={editFormData.modelo}
                      onChange={handleEditInputChange}
                      required
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                      placeholder="Ej: Corsa"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="edit-matricula" className="block text-sm font-semibold text-slate-700">
                      Matrícula *
                    </label>
                    <input
                      type="text"
                      id="edit-matricula"
                      name="matricula"
                      value={editFormData.matricula}
                      onChange={handleEditInputChange}
                      required
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300 font-mono text-lg"
                      placeholder="Ej: 1234ABC"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="edit-bastidor" className="block text-sm font-semibold text-slate-700">
                      Bastidor *
                    </label>
                    <input
                      type="text"
                      id="edit-bastidor"
                      name="bastidor"
                      value={editFormData.bastidor}
                      onChange={handleEditInputChange}
                      required
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300 font-mono"
                      placeholder="Ej: W0L00000000000000"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="edit-kms" className="block text-sm font-semibold text-slate-700">
                    Kilómetros *
                  </label>
                  <input
                    type="number"
                    id="edit-kms"
                    name="kms"
                    value={editFormData.kms}
                    onChange={handleEditInputChange}
                    required
                    min="0"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                    placeholder="Ej: 50000"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="edit-tipo" className="block text-sm font-semibold text-slate-700">
                    Tipo *
                  </label>
                  <select
                    id="edit-tipo"
                    name="tipo"
                    value={editFormData.tipo}
                    onChange={handleEditInputChange}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                  >
                    <option value="">Seleccionar tipo...</option>
                    <option value="Compra">Compra</option>
                    <option value="Coche R">Coche R</option>
                    <option value="Deposito Venta">Deposito Venta</option>
                    <option value="Inversor">Inversor</option>
                  </select>
                </div>

                {/* Campo de inversor - solo visible cuando tipo es "Inversor" */}
                {editFormData.tipo === 'Inversor' && (
                  <div className="space-y-2">
                    <label htmlFor="edit-inversor" className="block text-sm font-semibold text-slate-700">
                      Inversor *
                    </label>
                    <select
                      id="edit-inversor"
                      name="inversorId"
                      value={editFormData.inversorId}
                      onChange={handleEditInputChange}
                      required={editFormData.tipo === 'Inversor'}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                    >
                      <option value="">Seleccionar inversor...</option>
                      {inversores.map((inversor) => (
                        <option key={inversor.id} value={inversor.id}>
                          {inversor.nombre} (ID: {inversor.id})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500">
                      Este vehículo aparecerá en la ficha del inversor seleccionado
                    </p>
                  </div>
                )}

                {/* Botones del Modal */}
                <div className="flex justify-end space-x-4 pt-6">
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition-all duration-300 font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
                  >
                    {isUpdating ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        <span>Actualizando...</span>
                      </div>
                    ) : (
                      '💾 Actualizar Vehículo'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <ToastContainer />
      <ConfirmModalComponent />
    </div>
  )
}