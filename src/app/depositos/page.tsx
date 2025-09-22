'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

interface Deposito {
  id: number
  cliente_id: number
  vehiculo_id: number
  estado: 'BORRADOR' | 'ACTIVO' | 'FINALIZADO'
  fecha_inicio: string
  fecha_fin?: string
  precio_venta?: number
  comision_porcentaje: number
  notas?: string
  monto_recibir?: number
  dias_gestion?: number
  multa_retiro_anticipado?: number
  numero_cuenta?: string
  created_at: string
  // Datos relacionados
  cliente: {
    id: number
    nombre: string
    apellidos: string
    email: string
    telefono: string
    dni?: string
  }
  vehiculo: {
    id: number
    referencia: string
    marca: string
    modelo: string
    matricula: string
    tipo: string
    bastidor?: string
    kms?: number
  }
}

export default function DepositosPage() {
  const [depositos, setDepositos] = useState<Deposito[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'todos' | 'activo' | 'finalizado'>('todos')
  const [timeFilter, setTimeFilter] = useState<'all' | 'week' | 'month' | '3months' | '6months'>('all')
  
  const router = useRouter()
  const { showToast } = useToast()

  useEffect(() => {
    fetchDepositos()
  }, [])

  // Refresh cuando la página se vuelve visible (ej: navegando de vuelta)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDepositos()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const fetchDepositos = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/depositos')
      
      if (!response.ok) {
        throw new Error('Error al cargar los depósitos')
      }
      
      const data = await response.json()
      setDepositos(data)
    } catch (error) {
      console.error('Error fetching depositos:', error)
      setError('Error al cargar los depósitos')
      showToast('Error al cargar los depósitos', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateDeposito = () => {
    router.push('/depositos/nuevo')
  }

  const handleViewDeposito = (id: number) => {
    router.push(`/depositos/${id}`)
  }

  const getDepositosByEstado = (estado: string) => {
    if (!Array.isArray(depositos)) return []
    return depositos.filter(deposito => deposito.estado === estado)
  }

  const getFilteredDepositosByTime = (depositos: Deposito[]) => {
    if (!Array.isArray(depositos)) return []
    const now = new Date()
    
    switch (timeFilter) {
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        return depositos.filter(deposito => new Date(deposito.created_at) >= weekAgo)
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        return depositos.filter(deposito => new Date(deposito.created_at) >= monthAgo)
      case '3months':
        const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        return depositos.filter(deposito => new Date(deposito.created_at) >= threeMonthsAgo)
      case '6months':
        const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
        return depositos.filter(deposito => new Date(deposito.created_at) >= sixMonthsAgo)
      default:
        return depositos
    }
  }

  const getFilteredDepositos = () => {
    let filtered = depositos
    
    // Si hay término de búsqueda, buscar en TODOS los estados primero
    if (searchTerm) {
      filtered = filtered.filter(deposito => 
        deposito.cliente?.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deposito.cliente?.apellidos?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deposito.vehiculo?.marca?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deposito.vehiculo?.modelo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deposito.vehiculo?.matricula?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deposito.vehiculo?.referencia?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      
      // Si hay búsqueda, NO filtrar por estado - mostrar TODOS los resultados de búsqueda
      return getFilteredDepositosByTime(filtered)
    }
    
    // Solo si NO hay búsqueda, aplicar filtro de estado
    if (activeTab !== 'todos') {
      const estadoMap = {
        'activo': 'ACTIVO',
        'finalizado': 'FINALIZADO'
      } as const
      filtered = filtered.filter(deposito => deposito.estado === estadoMap[activeTab])
    }
    
    return getFilteredDepositosByTime(filtered)
  }

  const calculateMetrics = () => {
    const allDepositos = getFilteredDepositosByTime(depositos)
    const totalDepositos = allDepositos.length
    
    // Calcular valor total y promedio solo de depósitos con precio_venta válido
    const depositosWithValue = allDepositos.filter(deposito => {
      const precio = Number(deposito.precio_venta)
      return !isNaN(precio) && precio > 0
    })
    
    const totalValue = depositosWithValue.reduce((sum, deposito) => {
      const precio = Number(deposito.precio_venta) || 0
      return sum + (isNaN(precio) ? 0 : precio)
    }, 0)
    
    const averageValue = depositosWithValue.length > 0 ? totalValue / depositosWithValue.length : 0
    
    return {
      total: totalDepositos,
      totalValue: isNaN(totalValue) ? 0 : totalValue,
      averageValue: isNaN(averageValue) ? 0 : averageValue,
      activos: getDepositosByEstado('ACTIVO').length,
      finalizados: getDepositosByEstado('FINALIZADO').length
    }
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('es-ES')
  }

  const calculateDaysRemaining = (createdAt: string) => {
    const createdDate = new Date(createdAt)
    const now = new Date()
    const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
    const daysRemaining = Math.max(0, 90 - daysSinceCreation)
    return daysRemaining
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'ACTIVO': return 'bg-green-100 text-green-700'
      case 'FINALIZADO': return 'bg-red-100 text-red-700'
      case 'BORRADOR': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case 'ACTIVO': return 'Activo'
      case 'FINALIZADO': return 'Finalizado'
      case 'BORRADOR': return 'Borrador'
      default: return estado
    }
  }

  const metrics = calculateMetrics()

  const MiniDashboard = () => (
    <div className="w-[30%] max-w-[400px]">
      <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Dashboard</h3>
        

        {/* Métricas */}
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
            <div className="text-sm text-blue-600 font-medium">Total Depósitos</div>
            <div className="text-2xl font-bold text-blue-900">{metrics.total}</div>
          </div>
          
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-100">
            <div className="text-sm text-green-600 font-medium">Valor Total</div>
            <div className="text-xl font-bold text-green-900">{formatCurrency(metrics.totalValue)}</div>
          </div>
          
          <div className="bg-gradient-to-r from-purple-50 to-violet-50 p-4 rounded-lg border border-purple-100">
            <div className="text-sm text-purple-600 font-medium">Valor Promedio</div>
            <div className="text-xl font-bold text-purple-900">{formatCurrency(metrics.averageValue)}</div>
          </div>
        </div>

        {/* Estados */}
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Distribución por Estado
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-xl border border-green-200">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-800">Activos</span>
              </div>
              <span className="text-xl font-bold text-green-900 bg-white px-3 py-1 rounded-lg shadow-sm">{metrics.activos}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gradient-to-r from-red-50 to-red-100 rounded-xl border border-red-200">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-sm font-medium text-red-800">Finalizados</span>
              </div>
              <span className="text-xl font-bold text-red-900 bg-white px-3 py-1 rounded-lg shadow-sm">{metrics.finalizados}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <main className="w-[90%] mx-auto px-6 py-8">
        {/* Header Moderno - Estilo Navegación */}
        <div className="mb-6">
          {/* Título y stats compactos */}
          <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 mb-4">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-white">Depósitos de Venta</h1>
                    <p className="text-slate-300 text-sm">
                      {depositos.length} registrados • {getFilteredDepositos().length} mostrados
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => fetchDepositos()}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Actualizar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Barra de filtros mejorada - Dos líneas */}
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/60 p-4 space-y-4">
            
            {/* LÍNEA 1: Búsqueda + Botón Nuevo Depósito */}
            <div className="flex items-center gap-4">
              {/* Búsqueda de depósitos - 50% del ancho */}
              <div className="w-1/2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar en todos los depósitos por cliente, vehículo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-all shadow-sm"
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
              
              {/* Botón Nuevo Depósito al lado */}
              <button
                onClick={handleCreateDeposito}
                className="px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Nuevo Depósito</span>
              </button>
            </div>

            {/* LÍNEA 2: Filtros de estado */}
            <div className="flex items-center gap-8">
              
              {/* Filtro de Estado */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">Estado:</span>
                <div className="flex bg-slate-100 rounded-xl p-1">
                  <button
                    onClick={() => setActiveTab('activo')}
                    className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                      activeTab === 'activo' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    <span className="font-medium">Activos</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      activeTab === 'activo' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {getDepositosByEstado('ACTIVO').length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('finalizado')}
                    className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                      activeTab === 'finalizado' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    <span className="font-medium">Finalizados</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      activeTab === 'finalizado' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {getDepositosByEstado('FINALIZADO').length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Botón "Todos" separado */}
              <div className="flex items-center">
                <button
                  onClick={() => setActiveTab('todos')}
                  className={`px-4 py-2 rounded-xl transition-all flex items-center space-x-2 ${
                    activeTab === 'todos' 
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg' 
                      : 'bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 hover:from-indigo-200 hover:to-purple-200'
                  }`}
                >
                  <span className="font-medium">Todos</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    activeTab === 'todos' 
                      ? 'bg-white text-indigo-500' 
                      : 'bg-indigo-200 text-indigo-800'
                  }`}>
                    {depositos.length}
                  </span>
                </button>
              </div>

            </div>
            
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando depósitos...</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Layout principal */}
            <div className="flex gap-6">
              {/* Sección de depósitos */}
              <div className="w-[70%] px-4">

                {/* Header sticky con columnas */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden sticky top-20 z-20 mb-4">
                  <div className="flex items-center bg-slate-50 border-b border-slate-200">
                    <div className="w-1 h-12 bg-transparent"></div> {/* Invisible bar for alignment */}
                    <div className="flex-1 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-6 flex-1">
                          <div className="min-w-[140px] max-w-[140px]">
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Depósito #</div>
                          </div>
                          <div className="min-w-[140px] max-w-[140px]">
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Cliente</div>
                          </div>
                          <div className="min-w-[160px] max-w-[160px]">
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Vehículo</div>
                          </div>
                          <div className="min-w-[90px] max-w-[90px] text-right">
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Precio al Cliente</div>
                          </div>
                          <div className="min-w-[70px] max-w-[70px] text-right">
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Días Restantes</div>
                          </div>
                          <div className="min-w-[90px] max-w-[90px] text-right">
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Creado</div>
                          </div>
                          <div className="min-w-[80px] max-w-[80px] text-center">
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Estado</div>
                          </div>
                        </div>
                        <div className="pl-4 min-w-[40px]">
                          <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Acciones</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lista de depósitos */}
                <div className="space-y-2">
                  {getFilteredDepositos().map((deposito) => (
                    <div 
                      key={deposito.id} 
                      className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => handleViewDeposito(deposito.id)}
                    >
                      <div className="flex items-center">
                        <div className={`w-1 h-16 ${
                          deposito.estado === 'ACTIVO' ? 'bg-green-500' :
                          deposito.estado === 'FINALIZADO' ? 'bg-red-500' :
                          'bg-gray-500'
                        }`}></div>
                        <div className="flex-1 p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-6 flex-1">
                              <div className="min-w-[140px] max-w-[140px]">
                                <div className="font-semibold text-slate-900 truncate" title={`#${deposito.id}`}>
                                  #{deposito.id}
                                </div>
                              </div>
                              <div className="min-w-[140px] max-w-[140px]">
                                <div className="font-medium text-slate-900 truncate" title={`${deposito.cliente?.nombre || ''} ${deposito.cliente?.apellidos || ''}`.trim()}>
                                  {deposito.cliente?.nombre && deposito.cliente?.apellidos 
                                    ? `${deposito.cliente.nombre} ${deposito.cliente.apellidos}`.trim()
                                    : 'Sin cliente'
                                  }
                                </div>
                                {deposito.cliente?.telefono && (
                                  <div className="text-sm text-slate-500 truncate" title={deposito.cliente.telefono}>
                                    {deposito.cliente.telefono}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-[160px] max-w-[160px]">
                                <div className="font-medium text-slate-900 truncate" title={`${deposito.vehiculo?.marca || ''} ${deposito.vehiculo?.modelo || ''}`.trim()}>
                                  {deposito.vehiculo?.marca && deposito.vehiculo?.modelo
                                    ? `${deposito.vehiculo.marca} ${deposito.vehiculo.modelo}`.trim()
                                    : 'Sin vehículo'
                                  }
                                </div>
                                <div className="text-sm text-slate-500 truncate" title={deposito.vehiculo?.matricula || ''}>
                                  {deposito.vehiculo?.matricula || '-'}
                                </div>
                              </div>
                              <div className="min-w-[90px] max-w-[90px] text-right">
                                <div className="font-semibold text-slate-900 truncate">
                                  {deposito.monto_recibir ? formatCurrency(deposito.monto_recibir) : '-'}
                                </div>
                              </div>
                              <div className="min-w-[70px] max-w-[70px] text-right">
                                <div className="font-medium text-slate-900 truncate">
                                  {calculateDaysRemaining(deposito.created_at)}
                                </div>
                              </div>
                              <div className="min-w-[90px] max-w-[90px] text-right">
                                <div className="text-sm text-slate-500 truncate">
                                  {formatDate(deposito.created_at)}
                                </div>
                              </div>
                              <div className="min-w-[80px] max-w-[80px] text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(deposito.estado)}`}>
                                  {getEstadoLabel(deposito.estado)}
                                </span>
                              </div>
                            </div>
                            <div className="pl-4 min-w-[40px]">
                              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {getFilteredDepositos().length === 0 && (
                    <div className="text-center py-12">
                      <div className="text-slate-400 mb-2">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-medium text-slate-900 mb-1">No hay depósitos</h3>
                      <p className="text-slate-500">No se encontraron depósitos en el estado "{activeTab}"</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Dashboard */}
              <MiniDashboard />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}