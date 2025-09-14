'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import NotificationCenter from '@/components/NotificationCenter'
import DataExporter from '@/components/DataExporter'
import { Cliente } from '@/lib/database'
import { useSimpleToast } from '@/hooks/useSimpleToast'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'

export default function ClientesPage() {
  const router = useRouter()
  const { showToast, ToastContainer } = useSimpleToast()
  
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [clienteToDelete, setClienteToDelete] = useState<Cliente | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('')
  const [prioridadFilter, setPrioridadFilter] = useState('')
  const [precioMaxFilter, setPrecioMaxFilter] = useState('')
  const [kilometrajeFilter, setKilometrajeFilter] = useState('')
  const [añoMinFilter, setAñoMinFilter] = useState('')
  const [combustibleFilter, setCombustibleFilter] = useState('')
  const [cambioFilter, setCambioFilter] = useState('')
  const [pagoFilter, setPagoFilter] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list')
  const [showNotifications, setShowNotifications] = useState(false)
  const [showExporter, setShowExporter] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'fecha' | 'nombre' | 'prioridad'>('fecha')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const fetchClientes = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/clientes')
      if (!response.ok) throw new Error('Error al cargar clientes')
      const data = await response.json()
      
      // Mapear datos de la base de datos al formato esperado por el frontend
      const clientesMapeados = data.map((cliente: any) => {
        // Parsear vehiculosInteres
        let vehiculosInteres = []
        if (cliente.vehiculosInteres) {
          try {
            vehiculosInteres = JSON.parse(cliente.vehiculosInteres)
          } catch (e) {
            vehiculosInteres = []
          }
        }
        
        // Parsear etiquetas
        let etiquetas = []
        if (cliente.etiquetas) {
          try {
            etiquetas = JSON.parse(cliente.etiquetas)
          } catch (e) {
            etiquetas = []
          }
        }
        
        // Parsear coloresDeseados
        let coloresDeseados = []
        if (cliente.coloresDeseados) {
          try {
            coloresDeseados = JSON.parse(cliente.coloresDeseados)
          } catch (e) {
            coloresDeseados = []
          }
        }
        
        // Parsear necesidadesEspeciales
        let necesidadesEspeciales = []
        if (cliente.necesidadesEspeciales) {
          try {
            necesidadesEspeciales = JSON.parse(cliente.necesidadesEspeciales)
          } catch (e) {
            necesidadesEspeciales = []
          }
        }
        
        return {
          ...cliente,
          // Mapear para compatibilidad con el frontend existente
          intereses: {
            vehiculosInteres: vehiculosInteres,
            precioMaximo: cliente.presupuestoMaximo || 0,
            kilometrajeMaximo: cliente.kilometrajeMaximo || 0,
            añoMinimo: cliente.añoMinimo || 0,
            combustiblePreferido: cliente.combustiblePreferido || 'cualquiera',
            cambioPreferido: cliente.cambioPreferido || 'cualquiera',
            coloresDeseados: coloresDeseados,
            necesidadesEspeciales: necesidadesEspeciales,
            formaPagoPreferida: cliente.formaPagoPreferida || 'cualquiera'
          },
          etiquetas: etiquetas
        }
      })
      
      setClientes(clientesMapeados)
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar clientes', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchClientes()
  }, [])


  const handleView = (id: number) => {
    router.push(`/clientes/${id}`)
  }

  const handleCreate = () => {
    router.push('/clientes/crear')
  }


  const handleDeleteClick = (cliente: Cliente) => {
    setClienteToDelete(cliente)
  }

  const handleDeleteConfirm = async () => {
    if (!clienteToDelete) return

    try {
      setIsDeleting(true)
      const response = await fetch(`/api/clientes/${clienteToDelete.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchClientes()
        showToast('Cliente eliminado correctamente', 'success')
        setClienteToDelete(null)
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al eliminar cliente', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al eliminar cliente', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteCancel = () => {
    setClienteToDelete(null)
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'nuevo': return 'bg-blue-100 text-blue-800'
      case 'en_seguimiento': return 'bg-yellow-100 text-yellow-800'
      case 'cita_agendada': return 'bg-purple-100 text-purple-800'
      case 'cerrado': return 'bg-green-100 text-green-800'
      case 'descartado': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPrioridadColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta': return 'bg-red-100 text-red-800'
      case 'media': return 'bg-yellow-100 text-yellow-800'
      case 'baja': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const filteredClientes = clientes
    .filter(cliente => {
      const matchesSearch = cliente.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           cliente.apellidos.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           cliente.telefono.includes(searchTerm) ||
                           cliente.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           cliente.dni?.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesVehicleSearch = !vehicleSearchTerm || 
        cliente.intereses?.vehiculosInteres?.some(vehiculo => 
          vehiculo.toLowerCase().includes(vehicleSearchTerm.toLowerCase())
        )
      
      const matchesEstado = !estadoFilter || (cliente.estado || 'nuevo') === estadoFilter
      const matchesPrioridad = !prioridadFilter || (cliente.prioridad || 'media') === prioridadFilter
      
      // Filtros por intereses
      const precioMaxValue = parseInt(precioMaxFilter)
      const clientePrecio = cliente.intereses?.precioMaximo || 0
      // Lógica corregida: si filtro 15k, mostrar clientes que pueden gastar 15k o más
      const matchesPrecioMax = !precioMaxFilter || 
        (clientePrecio > 0 && precioMaxValue > 0 && clientePrecio >= precioMaxValue)
      
      // Debug log para verificar el filtro
      if (precioMaxFilter && clientePrecio > 0) {
        console.log(`Cliente: ${cliente.nombre}, Precio cliente: ${clientePrecio}, Filtro: ${precioMaxValue}, Match: ${matchesPrecioMax}`)
      }
      
      const matchesKilometraje = !kilometrajeFilter || 
        ((cliente.intereses?.kilometrajeMaximo || 0) > 0 && parseInt(kilometrajeFilter) > 0 && (cliente.intereses?.kilometrajeMaximo || 0) >= parseInt(kilometrajeFilter))
      
      const matchesAñoMin = !añoMinFilter || 
        ((cliente.intereses?.añoMinimo || 0) > 0 && parseInt(añoMinFilter) > 0 && (cliente.intereses?.añoMinimo || 0) <= parseInt(añoMinFilter))
      
      const matchesCombustible = !combustibleFilter || 
        cliente.intereses?.combustiblePreferido === combustibleFilter ||
        (combustibleFilter === 'cualquiera' && cliente.intereses?.combustiblePreferido === 'cualquiera')
      
      const matchesCambio = !cambioFilter || 
        cliente.intereses?.cambioPreferido === cambioFilter ||
        (cambioFilter === 'cualquiera' && cliente.intereses?.cambioPreferido === 'cualquiera')
      
      const matchesPago = !pagoFilter || 
        cliente.intereses?.formaPagoPreferida === pagoFilter ||
        (pagoFilter === 'cualquiera' && cliente.intereses?.formaPagoPreferida === 'cualquiera')
      
      return matchesSearch && matchesVehicleSearch && matchesEstado && matchesPrioridad &&
             matchesPrecioMax && matchesKilometraje && matchesAñoMin && 
             matchesCombustible && matchesCambio && matchesPago
    })
    .sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'fecha':
          comparison = new Date(a.fechaPrimerContacto).getTime() - new Date(b.fechaPrimerContacto).getTime()
          break
        case 'nombre':
          comparison = `${a.nombre} ${a.apellidos}`.localeCompare(`${b.nombre} ${b.apellidos}`)
          break
        case 'prioridad':
          const prioridadOrder = { alta: 3, media: 2, baja: 1 }
          comparison = prioridadOrder[a.prioridad as keyof typeof prioridadOrder] - prioridadOrder[b.prioridad as keyof typeof prioridadOrder]
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })

  if (isLoading) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Gestión de Clientes</h1>
            <p className="text-slate-600">Registra y haz seguimiento de todos los clientes</p>
          </div>
          <LoadingSkeleton />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-orange-50 to-red-100">
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header Moderno - Estilo Navegación */}
        <div className="mb-6">
          {/* Título y stats compactos */}
          <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 mb-4">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-white">Clientes</h1>
                    <p className="text-slate-300 text-sm">
                      {clientes.length} registrados • {filteredClientes.length} mostrados
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => fetchClientes()}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Actualizar</span>
                  </button>
                  <button
                    onClick={() => setShowNotifications(true)}
                    className="relative px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Notificaciones</span>
                    <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full"></div>
                  </button>
                  <button
                    onClick={() => setShowExporter(true)}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Exportar</span>
                  </button>
                  <button
                    onClick={() => router.push('/clientes/dashboard')}
                    className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Dashboard</span>
                  </button>
                  <button
                    onClick={handleCreate}
                    className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
              {/* Búsqueda de clientes */}
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar clientes por nombre, apellidos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white transition-all shadow-sm"
                  />
                  <svg className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Búsqueda de vehículo interesado */}
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar por coche interesado..."
                    value={vehicleSearchTerm}
                    onChange={(e) => setVehicleSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white transition-all shadow-sm"
                  />
                  <svg className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-7v16l-2-2v-12a2 2 0 00-2-2H9a2 2 0 00-2 2v12l-2 2V4a2 2 0 012-2h10a2 2 0 012 2z" />
                  </svg>
                  {vehicleSearchTerm && (
                    <button
                      onClick={() => setVehicleSearchTerm('')}
                      className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Vista con iconos - Solo a la derecha */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600">👁️ Vista:</span>
                <div className="flex bg-slate-100 rounded-xl p-1">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`px-3 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                      viewMode === 'cards' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                    title="Vista de cartas"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-7v16l-2-2v-12a2 2 0 00-2-2H9a2 2 0 00-2 2v12l-2 2V4a2 2 0 012-2h10a2 2 0 012 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                      viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
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

            {/* LÍNEA 2: Dropdowns de filtros */}
            <div className="flex items-center justify-center gap-8">
              
              {/* Dropdown de Estado */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">Estado:</span>
                <select
                  value={estadoFilter}
                  onChange={(e) => setEstadoFilter(e.target.value)}
                  className="px-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white transition-all shadow-sm"
                >
                  <option value="">Todos los estados</option>
                  <option value="nuevo">Nuevo</option>
                  <option value="en_seguimiento">En Seguimiento</option>
                  <option value="cita_agendada">Cita Agendada</option>
                  <option value="cerrado">Cerrado</option>
                  <option value="descartado">Descartado</option>
                </select>
              </div>

              {/* Dropdown de Prioridad */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">Prioridad:</span>
                <select
                  value={prioridadFilter}
                  onChange={(e) => setPrioridadFilter(e.target.value)}
                  className="px-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white transition-all shadow-sm"
                >
                  <option value="">Todas las prioridades</option>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>

              {/* Filtros avanzados */}
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center space-x-2 ${
                  showAdvancedFilters ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
                </svg>
                <span>Filtros Avanzados</span>
              </button>

            </div>
            
          {/* Filtros avanzados expandibles */}
          {showAdvancedFilters && (
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/60 p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-4">🔍 Filtros por Intereses del Cliente</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Precio máximo (€)</label>
                    <input
                      type="number"
                      placeholder="Ej: 15000"
                      value={precioMaxFilter}
                      onChange={(e) => setPrecioMaxFilter(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Kilometraje máximo</label>
                    <input
                      type="number"
                      placeholder="Ej: 50000"
                      value={kilometrajeFilter}
                      onChange={(e) => setKilometrajeFilter(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Año mínimo</label>
                    <input
                      type="number"
                      placeholder="Ej: 2020"
                      value={añoMinFilter}
                      onChange={(e) => setAñoMinFilter(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Combustible</label>
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
                    <label className="block text-xs text-slate-600 mb-1">Cambio</label>
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
                    <label className="block text-xs text-slate-600 mb-1">Forma de pago</label>
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
                    Mostrando {filteredClientes.length} de {clientes.length} clientes
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


        {/* Lista de clientes */}
        {filteredClientes.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm 
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza creando tu primer cliente'
              }
            </p>
            {!searchTerm && (
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Crear Primer Cliente
              </button>
            )}
          </div>
        ) : (
          viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredClientes.map((cliente) => (
                <div 
                  key={cliente.id} 
                  className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-xl transition-all duration-200 cursor-pointer group"
                  onClick={() => handleView(cliente.id)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{cliente.nombre} {cliente.apellidos}</h3>
                      <p className="text-sm text-gray-600">{cliente.telefono}</p>
                      {cliente.email && (
                        <p className="text-sm text-gray-500">{cliente.email}</p>
                      )}
                      {cliente.dni && (
                        <p className="text-sm text-gray-500">DNI: {cliente.dni}</p>
                      )}
                    </div>
                    <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDeleteClick(cliente)}
                        className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        title="Eliminar cliente"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center justify-between">
                      <span>Estado:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(cliente.estado || 'nuevo')}`}>
                        {(cliente.estado || 'nuevo').replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Prioridad:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(cliente.prioridad || 'media')}`}>
                        {cliente.prioridad || 'media'}
                      </span>
                    </div>
                    <p>Interés: <span className="font-medium">{cliente.intereses?.vehiculosInteres?.join(', ') || 'No especificado'}</span></p>
                    <p>Presupuesto: <span className="font-medium">€{(cliente.intereses?.precioMaximo || 0).toLocaleString()}</span></p>
                    {cliente.proximoPaso && (
                      <p className="text-blue-600 font-medium">Próximo: {cliente.proximoPaso}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contacto</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prioridad</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Interés</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Presupuesto</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredClientes.map((cliente) => (
                      <tr key={cliente.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleView(cliente.id)}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{cliente.nombre} {cliente.apellidos}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">{cliente.telefono}</div>
                          {cliente.email && (
                            <div className="text-sm text-gray-500">{cliente.email}</div>
                          )}
                          {cliente.dni && (
                            <div className="text-sm text-gray-500">DNI: {cliente.dni}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(cliente.estado || 'nuevo')}`}>
                            {(cliente.estado || 'nuevo').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(cliente.prioridad || 'media')}`}>
                            {cliente.prioridad || 'media'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">{cliente.intereses?.vehiculosInteres?.join(', ') || 'No especificado'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">€{(cliente.intereses?.precioMaximo || 0).toLocaleString()}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleDeleteClick(cliente)}
                              className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                              title="Eliminar cliente"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

      {/* Modal de confirmación de eliminación */}
      {clienteToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">Eliminar Cliente</h3>
                <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-gray-600">
                ¿Estás seguro de que quieres eliminar al cliente <strong>{clienteToDelete.nombre} {clienteToDelete.apellidos}</strong>?
                <br />
                <span className="text-red-600 font-medium">Todos los datos asociados se perderán permanentemente.</span>
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

        {/* Modales */}
        <NotificationCenter 
          isOpen={showNotifications} 
          onClose={() => setShowNotifications(false)} 
        />
        
        <DataExporter 
          clientes={clientes}
          isOpen={showExporter} 
          onClose={() => setShowExporter(false)} 
        />

      </main>
    </div>
  )
}
