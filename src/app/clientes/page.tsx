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
  const [showForm, setShowForm] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list')
  const [showNotifications, setShowNotifications] = useState(false)
  const [showExporter, setShowExporter] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'fecha' | 'nombre' | 'prioridad'>('fecha')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  
  // Form data
  const [formData, setFormData] = useState({
    nombre: '',
    apellidos: '',
    telefono: '',
    email: '',
    comoLlego: '',
    estado: 'nuevo' as const,
    prioridad: 'media' as const,
    proximoPaso: '',
    etiquetas: [] as string[],
    intereses: {
      vehiculosInteres: [] as string[],
      precioMaximo: 0,
      kilometrajeMaximo: 0,
      añoMinimo: 0,
      combustiblePreferido: 'cualquiera' as const,
      cambioPreferido: 'cualquiera' as const,
      coloresDeseados: [] as string[],
      necesidadesEspeciales: [] as string[],
      formaPagoPreferida: 'cualquiera' as const,
      notasAdicionales: ''
    }
  })

  const fetchClientes = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/clientes')
      if (!response.ok) throw new Error('Error al cargar clientes')
      const data = await response.json()
      setClientes(data)
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    if (name.startsWith('intereses.')) {
      const field = name.split('.')[1]
      setFormData(prev => ({
        ...prev,
        intereses: {
          ...prev.intereses,
          [field]: value
        }
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  const addVehiculoInteres = () => {
    setFormData(prev => ({
      ...prev,
      intereses: {
        ...prev.intereses,
        vehiculosInteres: [...prev.intereses.vehiculosInteres, '']
      }
    }))
  }

  const updateVehiculoInteres = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      intereses: {
        ...prev.intereses,
        vehiculosInteres: prev.intereses.vehiculosInteres.map((v, i) => i === index ? value : v)
      }
    }))
  }

  const handleVehiculoKeyPress = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const value = (e.target as HTMLInputElement).value.trim()
      if (value) {
        updateVehiculoInteres(index, value)
        // Si es el último campo y tiene contenido, agregar uno nuevo
        if (index === formData.intereses.vehiculosInteres.length - 1) {
          setTimeout(() => {
            addVehiculoInteres()
          }, 100)
        }
      }
    }
  }

  const removeVehiculoInteres = (index: number) => {
    setFormData(prev => ({
      ...prev,
      intereses: {
        ...prev.intereses,
        vehiculosInteres: prev.intereses.vehiculosInteres.filter((_, i) => i !== index)
      }
    }))
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const response = await fetch('/api/clientes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          fechaPrimerContacto: new Date().toISOString().split('T')[0]
        })
      })

      if (response.ok) {
        await fetchClientes()
        setShowForm(false)
        setFormData({
          nombre: '',
          apellidos: '',
          telefono: '',
          email: '',
          comoLlego: '',
          estado: 'nuevo',
          prioridad: 'media',
          proximoPaso: '',
          etiquetas: [],
          intereses: {
            vehiculosInteres: [],
            precioMaximo: 0,
            kilometrajeMaximo: 0,
            añoMinimo: 0,
            combustiblePreferido: 'cualquiera',
            cambioPreferido: 'cualquiera',
            coloresDeseados: [],
            necesidadesEspeciales: [],
            formaPagoPreferida: 'cualquiera',
            notasAdicionales: ''
          }
        })
        showToast('Cliente creado correctamente', 'success')
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al crear cliente', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al crear cliente', 'error')
    }
  }

  const handleView = (id: number) => {
    router.push(`/clientes/${id}`)
  }

  const handleCreate = () => {
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setFormData({
      nombre: '',
      apellidos: '',
      telefono: '',
      email: '',
      whatsapp: '',
      comoLlego: '',
      fechaPrimerContacto: '',
      estado: 'nuevo',
      prioridad: 'media',
      proximoPaso: '',
      etiquetas: [],
      intereses: {
        vehiculoPrincipal: '',
        modelosAlternativos: [],
        precioMaximo: 0,
        kilometrajeMaximo: 0,
        añoMinimo: 0,
        combustiblePreferido: 'cualquiera',
        cambioPreferido: 'cualquiera',
        coloresDeseados: [],
        necesidadesEspeciales: [],
        formaPagoPreferida: 'cualquiera'
      }
    })
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
                           cliente.email?.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesVehicleSearch = !vehicleSearchTerm || 
        cliente.intereses.vehiculoPrincipal?.toLowerCase().includes(vehicleSearchTerm.toLowerCase()) ||
        cliente.intereses.modelosAlternativos?.some(modelo => 
          modelo.toLowerCase().includes(vehicleSearchTerm.toLowerCase())
        )
      
      const matchesEstado = !estadoFilter || cliente.estado === estadoFilter
      const matchesPrioridad = !prioridadFilter || cliente.prioridad === prioridadFilter
      
      // Filtros por intereses
      const precioMaxValue = parseInt(precioMaxFilter)
      const clientePrecio = cliente.intereses.precioMaximo
      // Lógica corregida: si filtro 15k, mostrar clientes que pueden gastar 15k o más
      const matchesPrecioMax = !precioMaxFilter || 
        (clientePrecio > 0 && precioMaxValue > 0 && clientePrecio >= precioMaxValue)
      
      // Debug log para verificar el filtro
      if (precioMaxFilter && clientePrecio > 0) {
        console.log(`Cliente: ${cliente.nombre}, Precio cliente: ${clientePrecio}, Filtro: ${precioMaxValue}, Match: ${matchesPrecioMax}`)
      }
      
      const matchesKilometraje = !kilometrajeFilter || 
        (cliente.intereses.kilometrajeMaximo > 0 && parseInt(kilometrajeFilter) > 0 && cliente.intereses.kilometrajeMaximo >= parseInt(kilometrajeFilter))
      
      const matchesAñoMin = !añoMinFilter || 
        (cliente.intereses.añoMinimo > 0 && parseInt(añoMinFilter) > 0 && cliente.intereses.añoMinimo >= parseInt(añoMinFilter))
      
      const matchesCombustible = !combustibleFilter || 
        cliente.intereses.combustiblePreferido === combustibleFilter ||
        (combustibleFilter === 'cualquiera' && cliente.intereses.combustiblePreferido === 'cualquiera')
      
      const matchesCambio = !cambioFilter || 
        cliente.intereses.cambioPreferido === cambioFilter ||
        (cambioFilter === 'cualquiera' && cliente.intereses.cambioPreferido === 'cualquiera')
      
      const matchesPago = !pagoFilter || 
        cliente.intereses.formaPagoPreferida === pagoFilter ||
        (pagoFilter === 'cualquiera' && cliente.intereses.formaPagoPreferida === 'cualquiera')
      
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
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 mb-2">Gestión de Clientes</h1>
              <p className="text-slate-600">Registra y haz seguimiento de todos los clientes</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowNotifications(true)}
                className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full"></div>
              </button>
              <button
                onClick={() => setShowExporter(true)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              <button
                onClick={() => router.push('/clientes/dashboard')}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Agregar Cliente</span>
              </button>
            </div>
          </div>

          {/* Búsqueda y filtros */}
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                <input
                  type="text"
                  placeholder="Buscar clientes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                
                <input
                  type="text"
                  placeholder="Buscar por coche interesado..."
                  value={vehicleSearchTerm}
                  onChange={(e) => setVehicleSearchTerm(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                
                <select
                  value={estadoFilter}
                  onChange={(e) => setEstadoFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Todos los estados</option>
                  <option value="nuevo">Nuevo</option>
                  <option value="en_seguimiento">En Seguimiento</option>
                  <option value="cita_agendada">Cita Agendada</option>
                  <option value="cerrado">Cerrado</option>
                  <option value="descartado">Descartado</option>
                </select>
                
                <select
                  value={prioridadFilter}
                  onChange={(e) => setPrioridadFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Todas las prioridades</option>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
              
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
                  </svg>
                  <span>Filtros Avanzados</span>
                </button>
                
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      viewMode === 'list' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Lista
                  </button>
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      viewMode === 'cards' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Tarjetas
                  </button>
                </div>
              </div>
            </div>
            
            {/* Filtros avanzados */}
            {showAdvancedFilters && (
              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Filtros por Intereses del Cliente</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Precio máximo (€)</label>
                    <input
                      type="number"
                      placeholder="Ej: 15000"
                      value={precioMaxFilter}
                      onChange={(e) => setPrecioMaxFilter(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Kilometraje máximo</label>
                    <input
                      type="number"
                      placeholder="Ej: 50000"
                      value={kilometrajeFilter}
                      onChange={(e) => setKilometrajeFilter(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Año mínimo</label>
                    <input
                      type="number"
                      placeholder="Ej: 2020"
                      value={añoMinFilter}
                      onChange={(e) => setAñoMinFilter(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Combustible</label>
                    <select
                      value={combustibleFilter}
                      onChange={(e) => setCombustibleFilter(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                    <label className="block text-xs text-gray-600 mb-1">Cambio</label>
                    <select
                      value={cambioFilter}
                      onChange={(e) => setCambioFilter(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">Todos</option>
                      <option value="manual">Manual</option>
                      <option value="automatico">Automático</option>
                      <option value="cualquiera">Cualquiera</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Forma de pago</label>
                    <select
                      value={pagoFilter}
                      onChange={(e) => setPagoFilter(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
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

        {/* Formulario de creación */}
        {showForm && (
          <div className="mb-8 bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Nuevo Cliente</h2>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Datos básicos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="nombre" className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    id="nombre"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: Juan"
                  />
                </div>
                
                <div>
                  <label htmlFor="apellidos" className="block text-sm font-medium text-slate-700 mb-1">
                    Apellidos *
                  </label>
                  <input
                    type="text"
                    id="apellidos"
                    name="apellidos"
                    value={formData.apellidos}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: Pérez García"
                  />
                </div>
                
                <div>
                  <label htmlFor="telefono" className="block text-sm font-medium text-slate-700 mb-1">
                    Teléfono *
                  </label>
                  <input
                    type="tel"
                    id="telefono"
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: 666 123 456"
                  />
                </div>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: juan@email.com"
                  />
                </div>
                
                <div>
                  <label htmlFor="comoLlego" className="block text-sm font-medium text-slate-700 mb-1">
                    Cómo llegó
                  </label>
                  <select
                    id="comoLlego"
                    name="comoLlego"
                    value={formData.comoLlego}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  >
                    <option value="No especificado">No especificado</option>
                    <option value="Google">Google</option>
                    <option value="Recomendado">Recomendado</option>
                    <option value="Visita directa">Visita directa</option>
                    <option value="Redes sociales">Redes sociales</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                
                
                <div>
                  <label htmlFor="estado" className="block text-sm font-medium text-slate-700 mb-1">
                    Estado
                  </label>
                  <select
                    id="estado"
                    name="estado"
                    value={formData.estado}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  >
                    <option value="nuevo">Nuevo</option>
                    <option value="en_seguimiento">En Seguimiento</option>
                    <option value="cita_agendada">Cita Agendada</option>
                    <option value="cerrado">Cerrado</option>
                    <option value="descartado">Descartado</option>
                  </select>
                </div>
                
                <div>
                  <label htmlFor="prioridad" className="block text-sm font-medium text-slate-700 mb-1">
                    Prioridad
                  </label>
                  <select
                    id="prioridad"
                    name="prioridad"
                    value={formData.prioridad}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
              </div>
              
              {/* Intereses básicos */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Intereses del Cliente</h3>
                
                {/* Vehículos de interés */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Vehículos de interés
                  </label>
                  <div className="space-y-2">
                    {formData.intereses.vehiculosInteres.map((vehiculo, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={vehiculo}
                          onChange={(e) => updateVehiculoInteres(index, e.target.value)}
                          onKeyPress={(e) => handleVehiculoKeyPress(e, index)}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                          placeholder="Ej: Renault Clio, BMW Serie 3, etc."
                        />
                        <button
                          type="button"
                          onClick={() => removeVehiculoInteres(index)}
                          className="px-3 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addVehiculoInteres}
                      className="flex items-center space-x-2 px-3 py-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-md transition-colors border border-green-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Agregar vehículo</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="intereses.precioMaximo" className="block text-sm font-medium text-slate-700 mb-1">
                      Precio máximo (€)
                    </label>
                    <input
                      type="number"
                      id="intereses.precioMaximo"
                      name="intereses.precioMaximo"
                      value={formData.intereses.precioMaximo}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                      placeholder="Ej: 15000"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="intereses.kilometrajeMaximo" className="block text-sm font-medium text-slate-700 mb-1">
                      Kilometraje máximo
                    </label>
                    <input
                      type="number"
                      id="intereses.kilometrajeMaximo"
                      name="intereses.kilometrajeMaximo"
                      value={formData.intereses.kilometrajeMaximo}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                      placeholder="Ej: 50000"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="intereses.añoMinimo" className="block text-sm font-medium text-slate-700 mb-1">
                      Año mínimo
                    </label>
                    <input
                      type="number"
                      id="intereses.añoMinimo"
                      name="intereses.añoMinimo"
                      value={formData.intereses.añoMinimo}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                      placeholder="Ej: 2020"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="intereses.combustiblePreferido" className="block text-sm font-medium text-slate-700 mb-1">
                      Combustible preferido
                    </label>
                    <select
                      id="intereses.combustiblePreferido"
                      name="intereses.combustiblePreferido"
                      value={formData.intereses.combustiblePreferido}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    >
                      <option value="cualquiera">Cualquiera</option>
                      <option value="diesel">Diésel</option>
                      <option value="gasolina">Gasolina</option>
                      <option value="hibrido">Híbrido</option>
                      <option value="electrico">Eléctrico</option>
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="intereses.cambioPreferido" className="block text-sm font-medium text-slate-700 mb-1">
                      Cambio preferido
                    </label>
                    <select
                      id="intereses.cambioPreferido"
                      name="intereses.cambioPreferido"
                      value={formData.intereses.cambioPreferido}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    >
                      <option value="cualquiera">Cualquiera</option>
                      <option value="manual">Manual</option>
                      <option value="automatico">Automático</option>
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="intereses.formaPagoPreferida" className="block text-sm font-medium text-slate-700 mb-1">
                      Forma de pago preferida
                    </label>
                    <select
                      id="intereses.formaPagoPreferida"
                      name="intereses.formaPagoPreferida"
                      value={formData.intereses.formaPagoPreferida}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    >
                      <option value="cualquiera">Cualquiera</option>
                      <option value="financiacion">Financiación</option>
                      <option value="contado">Contado</option>
                      <option value="entrega_usado">Entrega de usado</option>
                    </select>
                  </div>
                </div>
                
                {/* Notas adicionales */}
                <div className="mt-6">
                  <label htmlFor="intereses.notasAdicionales" className="block text-sm font-medium text-slate-700 mb-1">
                    Notas adicionales
                  </label>
                  <textarea
                    id="intereses.notasAdicionales"
                    name="intereses.notasAdicionales"
                    value={formData.intereses.notasAdicionales}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: Busca familiar 7 plazas, necesita maletero grande, etc."
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Crear Cliente
                </button>
              </div>
            </form>
          </div>
        )}

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
                  className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => handleView(cliente.id)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{cliente.nombre} {cliente.apellidos}</h3>
                      <p className="text-sm text-gray-600">{cliente.telefono}</p>
                      {cliente.email && (
                        <p className="text-sm text-gray-500">{cliente.email}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleView(cliente.id)
                        }}
                        className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors"
                      >
                        Ver
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteClick(cliente)
                        }}
                        className="px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center justify-between">
                      <span>Estado:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(cliente.estado)}`}>
                        {cliente.estado.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Prioridad:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(cliente.prioridad)}`}>
                        {cliente.prioridad}
                      </span>
                    </div>
                    <p>Interés: <span className="font-medium">{cliente.intereses.vehiculoPrincipal || 'No especificado'}</span></p>
                    <p>Presupuesto: <span className="font-medium">€{cliente.intereses.precioMaximo.toLocaleString()}</span></p>
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
                      <tr key={cliente.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{cliente.nombre} {cliente.apellidos}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">{cliente.telefono}</div>
                          {cliente.email && (
                            <div className="text-sm text-gray-500">{cliente.email}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(cliente.estado)}`}>
                            {cliente.estado.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(cliente.prioridad)}`}>
                            {cliente.prioridad}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">{cliente.intereses.vehiculoPrincipal || 'No especificado'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">€{cliente.intereses.precioMaximo.toLocaleString()}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-3">
                            <button
                              onClick={() => handleView(cliente.id)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Ver
                            </button>
                            <button
                              onClick={() => handleDeleteClick(cliente)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Eliminar
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
      </main>

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

    </div>
  )
}
