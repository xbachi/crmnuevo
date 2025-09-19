'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { useConfirmModal } from '@/components/ConfirmModal'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import VehicleCard from '@/components/VehicleCard'
import { formatVehicleReference } from '@/lib/utils'

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

interface PaginationInfo {
  page: number
  limit: number
  total: number
  pages: number
  hasNext: boolean
  hasPrev: boolean
}

export default function ListaVehiculos() {
  const router = useRouter()
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [filteredVehiculos, setFilteredVehiculos] = useState<Vehiculo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'lista' | 'cartas'>('cartas')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchField, setSearchField] = useState<'todos' | 'referencia' | 'marca' | 'modelo' | 'matricula' | 'bastidor' | 'tipo'>('todos')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'activos' | 'vendidos'>('activos')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [typeFilter, setTypeFilter] = useState<'todos' | 'Compra' | 'Coche R' | 'D' | 'inversores'>('todos')
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
    color: '',
    fechaMatriculacion: '',
    inversorId: ''
  })
  const [inversores, setInversores] = useState<any[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  
  // Estados para paginación
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0,
    hasNext: false,
    hasPrev: false
  })
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  
  const { showToast, ToastContainer } = useToast()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()

  const getTipoText = (tipo: string) => {
    const tipos = {
      'Compra': 'Compra',
      'C': 'Compra',
      'Coche R': 'Coche R',
      'R': 'Coche R',
      'Deposito Venta': 'Deposito Venta',
      'D': 'Deposito Venta',
      'Inversor': 'Inversor',
      'I': 'Inversor'
    }
    return tipos[tipo as keyof typeof tipos] || tipo
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'Compra':
      case 'C':
        return 'bg-blue-100 text-blue-800'
      case 'Coche R':
      case 'R':
        return 'bg-orange-100 text-orange-800'
      case 'Deposito Venta':
      case 'D':
        return 'bg-cyan-100 text-cyan-800'
      case 'Inversor':
      case 'I':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const loadMoreVehiculos = async () => {
    if (pagination.hasNext && !isLoadingMore) {
      await fetchVehiculos(currentPage + 1)
    }
  }

  const refreshVehiculos = async () => {
    setCurrentPage(1)
    await fetchVehiculos(1, true)
  }

  const handleCleanupOrphanVehicles = async () => {
    setIsCleaning(true)
    try {
      const response = await fetch('/api/vehiculos/cleanup-orphans', {
        method: 'POST'
      })
      
      if (response.ok) {
        const result = await response.json()
        showToast(result.message, 'success')
        
        // Refrescar la lista de vehículos
        await fetchVehiculos(1, true)
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al limpiar vehículos huérfanos', 'error')
      }
    } catch (error) {
      console.error('Error limpiando vehículos huérfanos:', error)
      showToast('Error al limpiar vehículos huérfanos', 'error')
    } finally {
      setIsCleaning(false)
    }
  }

  useEffect(() => {
    // Verificar si hay parámetro de refresh en la URL
    const urlParams = new URLSearchParams(window.location.search)
    const shouldRefresh = urlParams.get('refresh') === 'true'
    
    if (shouldRefresh) {
      fetchVehiculos(1, true)
      // Limpiar la URL
      window.history.replaceState({}, '', '/vehiculos')
    } else {
      fetchVehiculos()
    }
    
    fetchInversores()
    
    // Verificar si necesita refrescar por cambios en deals
    const needsRefresh = localStorage.getItem('needsVehicleRefresh')
    if (needsRefresh) {
      localStorage.removeItem('needsVehicleRefresh')
      fetchVehiculos(1, true)
    }
    
    // Escuchar cuando la ventana recupera el foco (usuario regresa de otra página)
    const handleFocus = () => {
      // Verificar si hay un timestamp reciente de creación de vehículo
      const lastVehicleCreation = localStorage.getItem('lastVehicleCreation')
      if (lastVehicleCreation) {
        const now = Date.now()
        const timeDiff = now - parseInt(lastVehicleCreation)
        // Si fue hace menos de 10 segundos, refrescar
        if (timeDiff < 10000) {
          fetchVehiculos(1, true)
          localStorage.removeItem('lastVehicleCreation')
        }
      }
    }
    
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Escuchar cambios de visibilidad de la página para refrescar
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Verificar si necesita refrescar por cambios en deals
        const needsRefresh = localStorage.getItem('needsVehicleRefresh')
        if (needsRefresh) {
          localStorage.removeItem('needsVehicleRefresh')
          fetchVehiculos(1, true)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
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
  }, [vehiculos, searchTerm, statusFilter, sortOrder, typeFilter])

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

    // Aplicar filtro de tipo
    if (typeFilter !== 'todos') {
      filtered = filtered.filter(vehiculo => {
        if (typeFilter === 'inversores') {
          return vehiculo.esCocheInversor === true
        } else {
          return vehiculo.tipo === typeFilter
        }
      })
    }

    // Aplicar filtro de búsqueda (siempre en todos los campos)
    if (searchTerm.trim()) {
      filtered = filtered.filter(vehiculo => {
        return (
          vehiculo.referencia.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehiculo.marca.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehiculo.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehiculo.matricula.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehiculo.bastidor.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehiculo.tipo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (vehiculo.inversorNombre && vehiculo.inversorNombre.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      })
    }

    // Aplicar ordenamiento por referencia
    filtered.sort((a, b) => {
      // Intentar convertir a número, si falla usar comparación de strings
      const refA = a.referencia
      const refB = b.referencia
      
      // Si ambos son números
      const numA = parseInt(refA)
      const numB = parseInt(refB)
      
      if (!isNaN(numA) && !isNaN(numB)) {
        return sortOrder === 'asc' ? numA - numB : numB - numA
      }
      
      // Si no son números, ordenar alfabéticamente
      if (sortOrder === 'asc') {
        return refA.localeCompare(refB)
      } else {
        return refB.localeCompare(refA)
      }
    })

    setFilteredVehiculos(filtered)
  }

  const fetchVehiculos = async (page = 1, forceRefresh = false) => {
    try {
      if (page === 1) {
        setIsLoading(true)
      } else {
        setIsLoadingMore(true)
      }
      
      
      const response = await fetch(`/api/vehiculos?page=${page}&limit=50`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log(`🚗 Vehículos cargados - Página ${page}:`, data.vehiculos.length)
        
        
        if (page === 1) {
          setVehiculos(data.vehiculos)
        } else {
          setVehiculos(prev => [...prev, ...data.vehiculos])
        }
        setPagination(data.pagination)
        setCurrentPage(page)
      } else {
        showToast('Error al cargar los vehículos', 'error')
      }
    } catch (error) {
      console.error('Error obteniendo vehículos:', error)
      showToast('Error al cargar los vehículos', 'error')
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }

  const handleEdit = (vehiculo: Vehiculo) => {
    console.log('✏️ Abriendo modal de edición para vehículo:', vehiculo.id)
    console.log('✏️ Color del vehículo:', vehiculo.color)
    setEditingVehiculo(vehiculo)
    const formData = {
      referencia: vehiculo.referencia,
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      matricula: vehiculo.matricula,
      bastidor: vehiculo.bastidor,
      kms: vehiculo.kms.toString(),
      tipo: vehiculo.tipo,
      color: vehiculo.color || '',
      fechaMatriculacion: vehiculo.fechaMatriculacion || '',
      inversorId: vehiculo.inversorId?.toString() || ''
    }
    console.log('✏️ Datos del formulario inicializados:', formData)
    console.log('✏️ Color inicializado:', formData.color)
    setEditFormData(formData)
    setShowEditModal(true)
  }

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    console.log('🔄 Cambiando campo:', name, 'a valor:', value)
    if (name === 'color') {
      console.log('🎨 CAMBIO DE COLOR DETECTADO:', value)
    }
    setEditFormData(prev => {
      const newData = {
        ...prev,
        [name]: value
      }
      console.log('📝 Nuevos datos del formulario:', newData)
      if (name === 'color') {
        console.log('🎨 Color en formulario:', newData.color)
      }
      return newData
    })
  }

  const handleDelete = (id: number) => {
    const vehiculo = vehiculos.find(v => v.id === id)
    const vehiculoName = vehiculo ? `${vehiculo.marca} ${vehiculo.modelo} (${formatVehicleReference(vehiculo.referencia, vehiculo.tipo)})` : 'este vehículo'
    
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
            await fetchVehiculos(1, true)
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

    console.log('🚀 Iniciando actualización de vehículo:', editingVehiculo.id)
    console.log('📋 Datos del formulario:', editFormData)

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
        color: editFormData.color,
        fechaMatriculacion: editFormData.fechaMatriculacion,
        esCocheInversor: editFormData.tipo === 'Inversor',
        inversorId: editFormData.tipo === 'Inversor' ? parseInt(editFormData.inversorId) : undefined
      }

      console.log('📤 Enviando a API:', updatedVehiculo)
      console.log('🔗 URL de la API:', `/api/vehiculos/${editingVehiculo.id}`)
      console.log('🎨 COLOR ENVIADO:', updatedVehiculo.color)
      console.log('🎨 editFormData.color:', editFormData.color)

      const response = await fetch(`/api/vehiculos/${editingVehiculo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedVehiculo)
      })

      console.log('📥 Respuesta de la API:', response.status, response.statusText)
      
      if (response.ok) {
        const result = await response.json()
        console.log('✅ Vehículo actualizado exitosamente:', result)
        console.log('🔍 result.vehiculo:', result.vehiculo)
        console.log('🔍 result.vehiculo.color:', result.vehiculo?.color)
        console.log('🔍 result.vehiculo.fechaMatriculacion:', result.vehiculo?.fechaMatriculacion)
        
        
        // Recargar datos frescos de la base de datos inmediatamente
        console.log('🔄 Recargando datos frescos...')
        await fetchVehiculos(1, true)
        
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
        {/* Header Moderno - Estilo Navegación */}
        <div className="mb-6">
          {/* Título y stats compactos */}
          <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 mb-4">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-white">Vehículos</h1>
                    <p className="text-slate-300 text-sm">
                      {vehiculos.length} registrados • {filteredVehiculos.length} mostrados
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={refreshVehiculos}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Actualizar</span>
                  </button>
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
                              await fetchVehiculos(1, true)
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
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>Borrar Todos</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Barra de filtros mejorada - Dos líneas */}
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/60 p-4 space-y-4">
            
            {/* LÍNEA 1: Búsqueda + Botón Nuevo + Vista */}
            <div className="flex items-center gap-4">
              {/* Búsqueda al 50% del ancho */}
              <div className="flex-1 max-w-1/2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar vehículos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-all shadow-sm"
                  />
                  <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Botón Nuevo Vehículo */}
              <a
                href="/cargar-vehiculo"
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Nuevo Vehículo</span>
              </a>

              {/* Vista con iconos */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600">👁️ Vista:</span>
                <div className="flex bg-slate-100 rounded-xl p-1">
                  <button
                    onClick={() => setViewMode('cartas')}
                    className={`px-3 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                      viewMode === 'cartas' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                    title="Vista de cartas"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-7v16l-2-2v-12a2 2 0 00-2-2H9a2 2 0 00-2 2v12l-2 2V4a2 2 0 012-2h10a2 2 0 012 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode('lista')}
                    className={`px-3 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                      viewMode === 'lista' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                    title="Vista de lista"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>
                </div>
              </div>

            </div>

            {/* LÍNEA 2: Filtros centrados con más espaciado */}
            <div className="flex items-center justify-center gap-12">
              
              {/* Filtros de tipo sin iconos */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-slate-700">
                  Tipo:
                </span>
                <div className="flex bg-slate-50 rounded-lg p-1 border border-slate-200">
                  <button
                    onClick={() => setTypeFilter('todos')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      typeFilter === 'todos' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setTypeFilter('Compra')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      typeFilter === 'Compra' ? 'bg-green-50 text-green-700 shadow-sm border border-green-200' : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    Compra
                  </button>
                  <button
                    onClick={() => setTypeFilter('Coche R')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      typeFilter === 'Coche R' ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-200' : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    R
                  </button>
                  <button
                    onClick={() => setTypeFilter('D')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      typeFilter === 'D' ? 'bg-purple-50 text-purple-700 shadow-sm border border-purple-200' : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    Dep.
                  </button>
                  <button
                    onClick={() => setTypeFilter('inversores')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      typeFilter === 'inversores' ? 'bg-amber-50 text-amber-700 shadow-sm border border-amber-200' : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    Inv.
                  </button>
                </div>
              </div>

              {/* Filtros de estado con iconos - Orden: Activos, Vendidos, Todos */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                  📊 Estado:
                </span>
                <div className="flex bg-slate-50 rounded-lg p-1 border border-slate-200">
                  <button
                    onClick={() => setStatusFilter('activos')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                      statusFilter === 'activos' ? 'bg-green-50 text-green-700 shadow-sm border border-green-200' : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    <span className="text-xs">✅</span>
                    Activos
                  </button>
                  <button
                    onClick={() => setStatusFilter('vendidos')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                      statusFilter === 'vendidos' ? 'bg-red-50 text-red-700 shadow-sm border border-red-200' : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    <span className="text-xs">💰</span>
                    Vendidos
                  </button>
                  <button
                    onClick={() => setStatusFilter('todos')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                      statusFilter === 'todos' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    <span className="text-xs">⚪</span>
                    Todos
                  </button>
                </div>
              </div>

              {/* Ordenamiento */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600">📊 Orden:</span>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all flex items-center space-x-2 ${
                    sortOrder === 'asc' 
                      ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' 
                      : 'bg-orange-50 border-orange-200 text-orange-700 shadow-sm'
                  }`}
                >
                  <span>Ref.</span>
                  {sortOrder === 'asc' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
                  {filteredVehiculos.map((vehiculo, index) => {
                    const isVendido = (estado: string | null | undefined): boolean => {
                      if (!estado) return false
                      const normalized = estado.toString().toLowerCase().trim()
                      return normalized === 'vendido'
                    }
                    const vehiculoVendido = isVendido(vehiculo.estado)
                    
                    // Determinar el color de fondo según el tipo (más oscuros como las cabeceras de tarjetas)
                    const getRowBackgroundColor = (tipo: string) => {
                      switch (tipo) {
                        case 'Compra':
                        case 'C':
                          return 'bg-white hover:bg-slate-50/80'
                        case 'Inversor':
                        case 'I':
                          return 'bg-gradient-to-r from-orange-200 to-amber-200 hover:from-orange-300 hover:to-amber-300'
                        case 'Deposito Venta':
                        case 'D':
                          return 'bg-gradient-to-r from-cyan-200 to-blue-200 hover:from-cyan-300 hover:to-blue-300'
                        case 'Coche R':
                        case 'R':
                          return 'bg-gradient-to-r from-green-200 to-emerald-200 hover:from-green-300 hover:to-emerald-300'
                        default:
                          return 'bg-white hover:bg-slate-50/80'
                      }
                    }
                    
                    return (
                    <tr 
                      key={`${vehiculo.id}-${vehiculo.updatedAt}-${index}`} 
                      className={`${getRowBackgroundColor(vehiculo.tipo)} transition-colors duration-200 ${vehiculoVendido ? 'opacity-60 grayscale' : ''} cursor-pointer hover:bg-blue-50`}
                      onClick={() => router.push(`/vehiculos/${vehiculo.id}`)}
                    >
                      <td className="px-3 py-4">
                        <div className="flex items-center">
                          <div className={`w-12 h-10 rounded-lg flex items-center justify-center mr-2 ${
                            vehiculoVendido 
                              ? 'bg-red-600' 
                              : 'bg-gradient-to-r from-blue-500 to-cyan-600'
                          }`}>
                            <span className="text-white font-bold text-xs">
                              {formatVehicleReference(vehiculo.referencia, vehiculo.tipo)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div>
                          <div className={`font-semibold text-sm truncate ${vehiculoVendido ? 'text-gray-500' : 'text-slate-900'}`}>
                            {vehiculo.marca} {vehiculo.modelo}
                          </div>
                {/* Indicador de VENDIDO o Alerta de ITV vencida o info básica */}
                {(() => {
                  if (vehiculoVendido) {
                    return (
                      <div className="inline-flex items-center space-x-1 px-2 py-1 bg-red-600 rounded-full mt-1">
                        <span className="text-xs">🚗</span>
                        <span className="text-xs text-white font-bold">VENDIDO</span>
                      </div>
                    )
                  }
                  
                  const itvValue = vehiculo.itv
                  const isItvValid = itvValue && (
                    itvValue.toString().toLowerCase() === 'sí' || 
                    itvValue.toString().toLowerCase() === 'si' || 
                    itvValue.toString().toLowerCase() === 'yes' ||
                    itvValue.toString().toLowerCase() === 'true'
                  )
                  
                  if (itvValue && !isItvValid) {
                    return (
                      <div className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-red-600 rounded-full mt-1">
                        <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs text-white font-semibold">ITV VENCIDA</span>
                      </div>
                    )
                  }
                  return (
                    <div className="text-slate-500 text-xs">Vehículo</div>
                  )
                })()}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className={`rounded-lg px-2 py-1 inline-block ${
                          vehiculoVendido 
                            ? 'bg-gray-200' 
                            : 'bg-slate-100'
                        }`}>
                          <span className={`font-mono font-bold text-sm ${
                            vehiculoVendido 
                              ? 'text-gray-500' 
                              : 'text-slate-800'
                          }`}>
                            {vehiculo.matricula}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-4 hidden md:table-cell">
                        <span className={`font-mono text-xs px-2 py-1 rounded truncate block ${
                          vehiculoVendido 
                            ? 'text-gray-500 bg-gray-200' 
                            : 'text-slate-600 bg-slate-50'
                        }`}>
                          {vehiculo.bastidor}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <span className={`font-bold text-sm ${
                          vehiculoVendido 
                            ? 'text-gray-500' 
                            : 'text-slate-800'
                        }`}>
                          {vehiculo.kms.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-2 py-4 hidden sm:table-cell">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${
                          vehiculoVendido 
                            ? 'bg-red-600 text-white' 
                            : getTipoColor(vehiculo.tipo)
                        }`}>
                          {vehiculoVendido ? 'VENDIDO' : getTipoText(vehiculo.tipo)}
                        </span>
                      </td>
                      <td className="px-3 py-4 hidden lg:table-cell text-xs">
                        <span className={vehiculoVendido ? 'text-gray-500' : 'text-slate-600'}>
                          {new Date(vehiculo.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex space-x-2">
                          <button 
                            onClick={() => handleEdit(vehiculo)}
                            className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button 
                            onClick={() => handleDelete(vehiculo.id)}
                            className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
        ) : (
          /* Vista de Cartas */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {filteredVehiculos.map((vehiculo, index) => (
              <VehicleCard
                key={`${vehiculo.id}-${vehiculo.updatedAt}-${index}`}
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

        {/* Botón para cargar más vehículos */}
        {pagination.hasNext && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={loadMoreVehiculos}
              disabled={isLoadingMore}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg font-medium transition-all duration-200 flex items-center space-x-2"
            >
              {isLoadingMore ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Cargando...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>Cargar más vehículos ({pagination.total - vehiculos.length} restantes)</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Información de paginación */}
        {pagination.total > 0 && (
          <div className="mt-6 text-center text-sm text-slate-600">
            Mostrando {vehiculos.length} de {pagination.total} vehículos
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

                {/* Color y Fecha de Matriculación */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="edit-color" className="block text-sm font-semibold text-slate-700">
                      Color
                    </label>
                    <input
                      type="text"
                      id="edit-color"
                      name="color"
                      value={editFormData.color}
                      onChange={handleEditInputChange}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                      placeholder="Ej: Blanco, Negro, Azul..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="edit-fechaMatriculacion" className="block text-sm font-semibold text-slate-700">
                      Fecha de Matriculación
                    </label>
                    <input
                      type="date"
                      id="edit-fechaMatriculacion"
                      name="fechaMatriculacion"
                      value={editFormData.fechaMatriculacion}
                      onChange={handleEditInputChange}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-300"
                    />
                  </div>
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