'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'

interface Deal {
  id: number
  numero: string
  clienteId: number
  vehiculoId: number
  cliente?: {
    id: number
    nombre: string
    apellidos: string
    email?: string
    telefono?: string
    dni?: string
  }
  vehiculo?: {
    id: number
    referencia: string
    marca: string
    modelo: string
    matricula: string
    bastidor: string
    kms: number
    precioPublicacion?: number
    estado: string
    fechaMatriculacion?: string
    año?: number
  }
  estado: string
  resultado?: string
  motivo?: string
  importeTotal?: number
  importeSena?: number
  formaPagoSena?: string
  restoAPagar?: number
  financiacion: boolean
  entidadFinanciera?: string
  fechaCreacion: Date
  fechaReservaDesde?: Date
  fechaReservaExpira?: Date
  fechaVentaFirmada?: Date
  fechaFacturada?: Date
  fechaEntrega?: Date
  contratoReserva?: string
  contratoVenta?: string
  factura?: string
  recibos?: string
  pagosSena?: string
  pagosResto?: string
  observaciones?: string
  responsableComercial?: string
  logHistorial?: string
  createdAt: Date
  updatedAt: Date
}

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<
    'todos' | 'nuevo' | 'reservado' | 'vendido' | 'facturado'
  >('todos')
  const [timeFilter, setTimeFilter] = useState<
    'all' | 'week' | 'month' | '3months' | '6months'
  >('all')

  const router = useRouter()
  const { showToast } = useToast()

  useEffect(() => {
    fetchDeals()
  }, [])

  // Refresh cuando la página se vuelve visible (ej: navegando de vuelta)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDeals()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const fetchDeals = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/deals')

      if (!response.ok) {
        throw new Error('Error al cargar los deals')
      }

      const data = await response.json()
      // La API devuelve directamente el array de deals
      setDeals(data)
    } catch (error) {
      console.error('Error fetching deals:', error)
      setError('Error al cargar los deals')
      showToast('Error al cargar los deals', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateDeal = () => {
    router.push('/deals/nuevo')
  }

  const handleViewDeal = (id: number) => {
    router.push(`/deals/${id}`)
  }

  const getDealsByEstado = (estado: string) => {
    if (!Array.isArray(deals)) return []
    return deals.filter((deal) => deal.estado === estado)
  }

  const getFilteredDealsByTime = (deals: Deal[]) => {
    if (!Array.isArray(deals)) return []
    const now = new Date()

    switch (timeFilter) {
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        return deals.filter((deal) => new Date(deal.createdAt) >= weekAgo)
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        return deals.filter((deal) => new Date(deal.createdAt) >= monthAgo)
      case '3months':
        const threeMonthsAgo = new Date(
          now.getTime() - 90 * 24 * 60 * 60 * 1000
        )
        return deals.filter(
          (deal) => new Date(deal.createdAt) >= threeMonthsAgo
        )
      case '6months':
        const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
        return deals.filter((deal) => new Date(deal.createdAt) >= sixMonthsAgo)
      default:
        return deals
    }
  }

  const getFilteredDeals = () => {
    let filtered = deals

    // Si hay término de búsqueda, buscar en TODOS los estados primero
    if (searchTerm) {
      filtered = filtered.filter(
        (deal) =>
          deal.cliente?.nombre
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          deal.cliente?.apellidos
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          deal.vehiculo?.marca
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          deal.vehiculo?.modelo
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          deal.vehiculo?.matricula
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          deal.numero?.toLowerCase().includes(searchTerm.toLowerCase())
      )

      // Si hay búsqueda, NO filtrar por estado - mostrar TODOS los resultados de búsqueda
      return getFilteredDealsByTime(filtered)
    }

    // Solo si NO hay búsqueda, aplicar filtro de estado
    if (activeTab !== 'todos') {
      filtered = filtered.filter((deal) => deal.estado === activeTab)
    }

    return getFilteredDealsByTime(filtered)
  }

  const calculateMetrics = () => {
    const allDeals = getFilteredDealsByTime(deals)
    const totalDeals = allDeals.length

    // Debug: Log de deals para ver qué datos tenemos
    console.log('📊 Calculando métricas para', totalDeals, 'deals')
    console.log(
      '📋 Primeros 3 deals:',
      allDeals.slice(0, 3).map((d) => ({
        id: d.id,
        numero: d.numero,
        importeTotal: d.importeTotal,
        tipo: typeof d.importeTotal,
      }))
    )

    // Calcular valor total y promedio solo de deals con importeTotal válido
    const dealsWithValue = allDeals.filter((deal) => {
      const importe = Number(deal.importeTotal)
      return !isNaN(importe) && importe > 0
    })

    console.log('💰 Deals con valor válido:', dealsWithValue.length)

    const totalValue = dealsWithValue.reduce((sum, deal) => {
      const importe = Number(deal.importeTotal) || 0
      return sum + (isNaN(importe) ? 0 : importe)
    }, 0)

    const averageValue =
      dealsWithValue.length > 0 ? totalValue / dealsWithValue.length : 0

    console.log('📈 Total Value:', totalValue, 'Average:', averageValue)

    return {
      total: totalDeals,
      totalValue: isNaN(totalValue) ? 0 : totalValue,
      averageValue: isNaN(averageValue) ? 0 : averageValue,
      nuevos: getDealsByEstado('nuevo').length,
      reservados: getDealsByEstado('reservado').length,
      vendidos: getDealsByEstado('vendido').length,
      facturados: getDealsByEstado('facturado').length,
    }
  }

  const formatCurrency = (amount: number) => {
    // Verificar si el amount es válido
    if (isNaN(amount) || amount === null || amount === undefined) {
      return '€0,00'
    }

    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  const formatDate = (date: Date | string) => {
    const dateObj = new Date(date)
    if (isNaN(dateObj.getTime())) return 'Fecha inválida'

    const day = dateObj.getDate().toString().padStart(2, '0')
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
    const year = dateObj.getFullYear()

    return `${day}/${month}/${year}`
  }

  const metrics = calculateMetrics()

  const MiniDashboard = () => (
    <div className="w-[30%] max-w-[400px]">
      <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Dashboard</h3>

        {/* Filtros de tiempo - Mejorado */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <svg
              className="w-4 h-4 text-slate-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Período de Análisis
          </h4>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'Todos', icon: '📊' },
              { key: 'week', label: '7 días', icon: '📅' },
              { key: 'month', label: '30 días', icon: '🗓️' },
              { key: '3months', label: '3 meses', icon: '📆' },
              { key: '6months', label: '6 meses', icon: '📈' },
            ].map((period) => (
              <button
                key={period.key}
                onClick={() => setTimeFilter(period.key as any)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                  timeFilter === period.key
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg transform scale-105'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <span>{period.icon}</span>
                <span>{period.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Métricas */}
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
            <div className="text-sm text-blue-600 font-medium">Total Deals</div>
            <div className="text-2xl font-bold text-blue-900">
              {metrics.total}
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-100">
            <div className="text-sm text-green-600 font-medium">
              Valor Total
            </div>
            <div className="text-xl font-bold text-green-900">
              {formatCurrency(metrics.totalValue)}
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-violet-50 p-4 rounded-lg border border-purple-100">
            <div className="text-sm text-purple-600 font-medium">
              Valor Promedio
            </div>
            <div className="text-xl font-bold text-purple-900">
              {formatCurrency(metrics.averageValue)}
            </div>
          </div>
        </div>

        {/* Estados - Mejorado */}
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <svg
              className="w-4 h-4 text-slate-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            Distribución por Estado
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl border border-blue-200">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-blue-800">
                  Nuevos
                </span>
              </div>
              <span className="text-xl font-bold text-blue-900 bg-white px-3 py-1 rounded-lg shadow-sm">
                {metrics.nuevos}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-xl border border-yellow-200">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span className="text-sm font-medium text-yellow-800">
                  Reservados
                </span>
              </div>
              <span className="text-xl font-bold text-yellow-900 bg-white px-3 py-1 rounded-lg shadow-sm">
                {metrics.reservados}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-xl border border-green-200">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-800">
                  Vendidos
                </span>
              </div>
              <span className="text-xl font-bold text-green-900 bg-white px-3 py-1 rounded-lg shadow-sm">
                {metrics.vendidos}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gradient-to-r from-purple-50 to-purple-100 rounded-xl border border-purple-200">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span className="text-sm font-medium text-purple-800">
                  Facturados
                </span>
              </div>
              <span className="text-xl font-bold text-purple-900 bg-white px-3 py-1 rounded-lg shadow-sm">
                {metrics.facturados}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <ProtectedRoute>
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
                      <svg
                        className="w-6 h-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-white">Deals</h1>
                      <p className="text-slate-300 text-sm">
                        {deals.length} registrados • {getFilteredDeals().length}{' '}
                        mostrados
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => fetchDeals()}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
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
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      <span>Actualizar</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Barra de filtros mejorada - Dos líneas */}
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/60 p-4 space-y-4">
              {/* LÍNEA 1: Búsqueda + Botón Nuevo Deal */}
              <div className="flex items-center gap-4">
                {/* Búsqueda de deals - 50% del ancho */}
                <div className="w-1/2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar en todos los deals por cliente, vehículo..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-all shadow-sm"
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

                {/* Botón Nuevo Deal al lado */}
                <button
                  onClick={handleCreateDeal}
                  className="px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg flex items-center space-x-2"
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
                  <span>Nuevo Deal</span>
                </button>
              </div>

              {/* LÍNEA 2: Filtros de estado */}
              <div className="flex items-center gap-8">
                {/* Filtro de Estado */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-700">
                    Estado:
                  </span>
                  <div className="flex bg-slate-100 rounded-xl p-1">
                    <button
                      onClick={() => setActiveTab('nuevo')}
                      className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                        activeTab === 'nuevo'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      <span className="font-medium">Nuevo</span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold ${
                          activeTab === 'nuevo'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {getDealsByEstado('nuevo').length}
                      </span>
                    </button>
                    <button
                      onClick={() => setActiveTab('reservado')}
                      className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                        activeTab === 'reservado'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      <span className="font-medium">Reservado</span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold ${
                          activeTab === 'reservado'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {getDealsByEstado('reservado').length}
                      </span>
                    </button>
                    <button
                      onClick={() => setActiveTab('vendido')}
                      className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                        activeTab === 'vendido'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      <span className="font-medium">Vendido</span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold ${
                          activeTab === 'vendido'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {getDealsByEstado('vendido').length}
                      </span>
                    </button>
                    <button
                      onClick={() => setActiveTab('facturado')}
                      className={`px-4 py-2 rounded-lg transition-all flex items-center space-x-2 ${
                        activeTab === 'facturado'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      <span className="font-medium">Facturado</span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold ${
                          activeTab === 'facturado'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {getDealsByEstado('facturado').length}
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
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold ${
                        activeTab === 'todos'
                          ? 'bg-white text-indigo-500'
                          : 'bg-indigo-200 text-indigo-800'
                      }`}
                    >
                      {deals.length}
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
              <p className="mt-4 text-gray-600">Cargando deals...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Layout principal */}
              <div className="flex gap-6">
                {/* Sección de deals */}
                <div className="w-[70%] px-4">
                  {/* Header sticky con columnas */}
                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden sticky top-20 z-20 mb-4">
                    <div className="flex items-center bg-slate-50 border-b border-slate-200">
                      <div className="w-1 h-12 bg-transparent"></div>{' '}
                      {/* Invisible bar for alignment */}
                      <div className="flex-1 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-6 flex-1">
                            <div className="min-w-[140px] max-w-[140px]">
                              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                Deal #
                              </div>
                            </div>
                            <div className="min-w-[140px] max-w-[140px]">
                              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                Cliente
                              </div>
                            </div>
                            <div className="min-w-[160px] max-w-[160px]">
                              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                Vehículo
                              </div>
                            </div>
                            <div className="min-w-[90px] max-w-[90px] text-right">
                              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                Total
                              </div>
                            </div>
                            <div className="min-w-[70px] max-w-[70px] text-right">
                              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                Seña
                              </div>
                            </div>
                            <div className="min-w-[90px] max-w-[90px] text-right">
                              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                Creado
                              </div>
                            </div>
                            <div className="min-w-[80px] max-w-[80px] text-center">
                              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                Estado
                              </div>
                            </div>
                          </div>
                          <div className="pl-4 min-w-[40px]">
                            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                              Acciones
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lista de deals */}
                  <div className="space-y-2">
                    {getFilteredDeals().map((deal) => (
                      <div
                        key={deal.id}
                        className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => handleViewDeal(deal.id)}
                      >
                        <div className="flex items-center">
                          <div
                            className={`w-1 h-16 ${
                              deal.estado === 'nuevo'
                                ? 'bg-blue-500'
                                : deal.estado === 'reservado'
                                  ? 'bg-yellow-500'
                                  : deal.estado === 'vendido'
                                    ? 'bg-green-500'
                                    : 'bg-purple-500'
                            }`}
                          ></div>
                          <div className="flex-1 p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-6 flex-1">
                                <div className="min-w-[140px] max-w-[140px]">
                                  <div
                                    className="font-semibold text-slate-900 truncate"
                                    title={deal.numero}
                                  >
                                    #{deal.numero}
                                  </div>
                                </div>
                                <div className="min-w-[140px] max-w-[140px]">
                                  <div
                                    className="font-medium text-slate-900 truncate"
                                    title={`${deal.cliente?.nombre || ''} ${deal.cliente?.apellidos || ''}`.trim()}
                                  >
                                    {deal.cliente?.nombre &&
                                    deal.cliente?.apellidos
                                      ? `${deal.cliente.nombre} ${deal.cliente.apellidos}`.trim()
                                      : 'Sin cliente'}
                                  </div>
                                  {deal.cliente?.telefono && (
                                    <div
                                      className="text-sm text-slate-500 truncate"
                                      title={deal.cliente.telefono}
                                    >
                                      {deal.cliente.telefono}
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-[160px] max-w-[160px]">
                                  <div
                                    className="font-medium text-slate-900 truncate"
                                    title={`${deal.vehiculo?.marca || ''} ${deal.vehiculo?.modelo || ''}`.trim()}
                                  >
                                    {deal.vehiculo?.marca &&
                                    deal.vehiculo?.modelo
                                      ? `${deal.vehiculo.marca} ${deal.vehiculo.modelo}`.trim()
                                      : 'Sin vehículo'}
                                  </div>
                                  <div
                                    className="text-sm text-slate-500 truncate"
                                    title={deal.vehiculo?.matricula || ''}
                                  >
                                    {deal.vehiculo?.matricula || '-'}
                                  </div>
                                </div>
                                <div className="min-w-[90px] max-w-[90px] text-right">
                                  <div className="font-semibold text-slate-900 truncate">
                                    {deal.importeTotal
                                      ? formatCurrency(deal.importeTotal)
                                      : '-'}
                                  </div>
                                </div>
                                <div className="min-w-[70px] max-w-[70px] text-right">
                                  <div className="font-medium text-slate-900 truncate">
                                    {deal.importeSena
                                      ? formatCurrency(deal.importeSena)
                                      : '-'}
                                  </div>
                                </div>
                                <div className="min-w-[90px] max-w-[90px] text-right">
                                  <div className="text-sm text-slate-500 truncate">
                                    {formatDate(deal.createdAt)}
                                  </div>
                                </div>
                                <div className="min-w-[80px] max-w-[80px] text-center">
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      deal.estado === 'nuevo'
                                        ? 'bg-blue-100 text-blue-700'
                                        : deal.estado === 'reservado'
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : deal.estado === 'vendido'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-purple-100 text-purple-700'
                                    }`}
                                  >
                                    {deal.estado}
                                  </span>
                                </div>
                              </div>
                              <div className="pl-4 min-w-[40px]">
                                <svg
                                  className="w-4 h-4 text-slate-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5l7 7-7 7"
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {getFilteredDeals().length === 0 && (
                      <div className="text-center py-12">
                        <div className="text-slate-400 mb-2">
                          <svg
                            className="w-12 h-12 mx-auto"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium text-slate-900 mb-1">
                          No hay deals
                        </h3>
                        <p className="text-slate-500">
                          No se encontraron deals en el estado "{activeTab}"
                        </p>
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
    </ProtectedRoute>
  )
}
