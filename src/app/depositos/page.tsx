'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { formatCurrency } from '@/lib/utils'
import { generarContratoCompraventa } from '@/lib/contractGenerator'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'

interface Deposito {
  id: number
  cliente_id: number
  vehiculo_id: number
  estado: 'BORRADOR' | 'ACTIVO' | 'FINALIZADO' | 'VENDIDO'
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
    direccion?: string
    ciudad?: string
    provincia?: string
    codPostal?: string
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
    fechaMatriculacion?: string
  }
}

export default function DepositosPage() {
  const [depositos, setDepositos] = useState<Deposito[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'todos' | 'activo' | 'finalizado'>(
    'activo'
  )
  const [timeFilter, setTimeFilter] = useState<
    'all' | 'week' | 'month' | '3months' | '6months'
  >('all')

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
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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

  const handleGenerarContratoCompraventa = async (deposito: Deposito) => {
    try {
      // Preparar los datos para el contrato
      const contratoData = {
        id: deposito.id,
        cliente: {
          nombre: deposito.cliente.nombre,
          apellidos: deposito.cliente.apellidos,
          dni: deposito.cliente.dni || '',
          direccion: deposito.cliente.direccion || '',
          ciudad: deposito.cliente.ciudad || '',
          provincia: deposito.cliente.provincia || '',
          codPostal: deposito.cliente.codPostal || '',
        },
        vehiculo: {
          marca: deposito.vehiculo.marca,
          modelo: deposito.vehiculo.modelo,
          bastidor: deposito.vehiculo.bastidor || '',
          matricula: deposito.vehiculo.matricula,
          fechaMatriculacion: deposito.vehiculo.fechaMatriculacion || '',
          kms: deposito.vehiculo.kms || 0,
        },
        deposito: {
          monto_recibir: deposito.monto_recibir || 0,
          dias_gestion: deposito.dias_gestion || 0,
          multa_retiro_anticipado: deposito.multa_retiro_anticipado || 0,
          numero_cuenta: deposito.numero_cuenta || '',
        },
      }

      // Generar el contrato en PDF
      await generarContratoCompraventa(contratoData)

      // Mostrar mensaje de éxito
      showToast('Contrato de compraventa generado correctamente', 'success')
    } catch (error) {
      console.error('Error generando contrato de compraventa:', error)
      showToast('Error al generar el contrato de compraventa', 'error')
    }
  }

  const getDepositosByEstado = (estado: string) => {
    if (!Array.isArray(depositos)) return []

    if (estado === 'ACTIVO') {
      // Activos: todos excepto VENDIDO
      return depositos.filter((deposito) => deposito.estado !== 'VENDIDO')
    } else if (estado === 'FINALIZADO') {
      // Finalizados: solo VENDIDO
      return depositos.filter((deposito) => deposito.estado === 'VENDIDO')
    }

    return depositos.filter((deposito) => deposito.estado === estado)
  }

  const getFilteredDepositosByTime = (depositos: Deposito[]) => {
    if (!Array.isArray(depositos)) return []
    const now = new Date()

    switch (timeFilter) {
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        return depositos.filter(
          (deposito) => new Date(deposito.created_at) >= weekAgo
        )
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        return depositos.filter(
          (deposito) => new Date(deposito.created_at) >= monthAgo
        )
      case '3months':
        const threeMonthsAgo = new Date(
          now.getTime() - 90 * 24 * 60 * 60 * 1000
        )
        return depositos.filter(
          (deposito) => new Date(deposito.created_at) >= threeMonthsAgo
        )
      case '6months':
        const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
        return depositos.filter(
          (deposito) => new Date(deposito.created_at) >= sixMonthsAgo
        )
      default:
        return depositos
    }
  }

  const getFilteredDepositos = () => {
    let filtered = depositos

    // Si hay término de búsqueda, buscar en TODOS los estados primero
    if (searchTerm) {
      filtered = filtered.filter(
        (deposito) =>
          deposito.cliente?.nombre
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          deposito.cliente?.apellidos
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          deposito.vehiculo?.marca
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          deposito.vehiculo?.modelo
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          deposito.vehiculo?.matricula
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          deposito.vehiculo?.referencia
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase())
      )

      // Si hay búsqueda, NO filtrar por estado - mostrar TODOS los resultados de búsqueda
      return getFilteredDepositosByTime(filtered)
    }

    // Solo si NO hay búsqueda, aplicar filtro de estado
    if (activeTab !== 'todos') {
      if (activeTab === 'activo') {
        // Activos: todos excepto VENDIDO
        filtered = filtered.filter((deposito) => deposito.estado !== 'VENDIDO')
      } else if (activeTab === 'finalizado') {
        // Finalizados: solo VENDIDO
        filtered = filtered.filter((deposito) => deposito.estado === 'VENDIDO')
      }
    }

    return getFilteredDepositosByTime(filtered)
  }

  const calculateMetrics = () => {
    const allDepositos = getFilteredDepositosByTime(depositos)
    const totalDepositos = allDepositos.length

    // Calcular valor total y promedio solo de depósitos con precio_venta válido
    const depositosWithValue = allDepositos.filter((deposito) => {
      const precio = Number(deposito.precio_venta)
      return !isNaN(precio) && precio > 0
    })

    const totalValue = depositosWithValue.reduce((sum, deposito) => {
      const precio = Number(deposito.precio_venta) || 0
      return sum + (isNaN(precio) ? 0 : precio)
    }, 0)

    const averageValue =
      depositosWithValue.length > 0 ? totalValue / depositosWithValue.length : 0

    return {
      total: totalDepositos,
      totalValue: isNaN(totalValue) ? 0 : totalValue,
      averageValue: isNaN(averageValue) ? 0 : averageValue,
      activos: getDepositosByEstado('ACTIVO').length,
      finalizados: getDepositosByEstado('FINALIZADO').length,
    }
  }

  const formatDate = (date: Date | string) => {
    const dateObj = new Date(date)
    if (isNaN(dateObj.getTime())) return 'Fecha inválida'

    const day = dateObj.getDate().toString().padStart(2, '0')
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
    const year = dateObj.getFullYear()

    return `${day}/${month}/${year}`
  }

  const calculateDaysRemaining = (createdAt: string, diasGestion?: number) => {
    const createdDate = new Date(createdAt)
    const now = new Date()
    const daysSinceCreation = Math.floor(
      (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    const totalDays = diasGestion || 90 // Usar días_gestion o 90 por defecto
    const daysRemaining = Math.max(0, totalDays - daysSinceCreation)
    return daysRemaining
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'ACTIVO':
        return 'bg-green-100 text-green-700'
      case 'FINALIZADO':
        return 'bg-red-100 text-red-700'
      case 'BORRADOR':
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case 'ACTIVO':
        return 'Activo'
      case 'FINALIZADO':
        return 'Finalizado'
      case 'BORRADOR':
        return 'Borrador'
      default:
        return estado
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
            <div className="text-sm text-blue-600 font-medium">
              Total Depósitos
            </div>
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

        {/* Estados */}
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
            <div className="flex justify-between items-center p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-xl border border-green-200">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-800">
                  Activos
                </span>
              </div>
              <span className="text-xl font-bold text-green-900 bg-white px-3 py-1 rounded-lg shadow-sm">
                {metrics.activos}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gradient-to-r from-red-50 to-red-100 rounded-xl border border-red-200">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-sm font-medium text-red-800">
                  Finalizados
                </span>
              </div>
              <span className="text-xl font-bold text-red-900 bg-white px-3 py-1 rounded-lg shadow-sm">
                {metrics.finalizados}
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
        <main className="w-[80%] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          {/* Header Moderno - Estilo Navegación */}
          <div className="mb-6">
            {/* Título y stats compactos */}
            <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 mb-4">
              <div className="px-4 sm:px-6 py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-5 h-5 sm:w-6 sm:h-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-lg sm:text-xl font-bold text-white">
                        Depósitos de Venta
                      </h1>
                      <p className="text-slate-300 text-xs sm:text-sm">
                        {depositos.length} registrados •{' '}
                        {getFilteredDepositos().length} mostrados
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 sm:space-x-3"></div>
                </div>
              </div>
            </div>

            {/* Barra de filtros mejorada */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Búsqueda */}
                <div className="flex-1">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar depósitos por cliente, vehículo..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <svg
                      className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
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
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        <svg
                          className="h-4 w-4"
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

                {/* Botón Nuevo Depósito */}
                <button
                  onClick={handleCreateDeposito}
                  className="px-3 sm:px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg text-xs sm:text-sm font-medium transition-all shadow-lg flex items-center space-x-2"
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
                  <span>Nuevo</span>
                </button>
              </div>

              {/* Filtros de estado */}
              <div className="flex flex-wrap items-center gap-4 mt-4">
                <span className="text-sm font-medium text-gray-600 hidden sm:inline">
                  Estado:
                </span>
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setActiveTab('activo')}
                    className={`px-3 py-1.5 rounded-md transition-all flex items-center space-x-1 ${
                      activeTab === 'activo'
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    <span className="font-medium text-xs sm:text-sm">
                      Activos
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold ${
                        activeTab === 'activo'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {getDepositosByEstado('ACTIVO').length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('finalizado')}
                    className={`px-3 py-1.5 rounded-md transition-all flex items-center space-x-1 ${
                      activeTab === 'finalizado'
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    <span className="font-medium text-xs sm:text-sm">
                      Finalizados
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold ${
                        activeTab === 'finalizado'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {getDepositosByEstado('FINALIZADO').length}
                    </span>
                  </button>
                </div>

                <button
                  onClick={() => setActiveTab('todos')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1 ${
                    activeTab === 'todos'
                      ? 'bg-blue-500 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span className="font-medium text-xs sm:text-sm">Todos</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-bold ${
                      activeTab === 'todos'
                        ? 'bg-white text-blue-500'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {depositos.length}
                  </span>
                </button>
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
              {/* Sección de depósitos */}
              <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {/* Encabezados para pantallas pequeñas (< 1024px) */}
                        <th className="lg:hidden px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/2">
                          Depósito & Cliente
                        </th>
                        <th className="lg:hidden px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/2">
                          Vehículo & Precio
                        </th>

                        {/* Encabezados para pantallas grandes (≥ 1024px) */}
                        <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">
                          Depósito #
                        </th>
                        <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">
                          Cliente
                        </th>
                        <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">
                          Vehículo
                        </th>
                        <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">
                          Precio
                        </th>
                        <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">
                          Días Restantes
                        </th>
                        <th className="hidden xl:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">
                          Estado
                        </th>
                        <th className="hidden 2xl:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/12">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {getFilteredDepositos().map((deposito) => (
                        <tr
                          key={deposito.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => handleViewDeposito(deposito.id)}
                        >
                          {/* Celdas para pantallas pequeñas (< 1024px) */}
                          <td className="lg:hidden px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              #{deposito.id} (
                              {calculateDaysRemaining(
                                deposito.created_at,
                                deposito.dias_gestion
                              )}{' '}
                              días)
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatDate(deposito.created_at)}
                            </div>
                            <div className="mt-1">
                              <div className="text-sm font-medium text-gray-700">
                                {deposito.cliente?.nombre &&
                                deposito.cliente?.apellidos
                                  ? `${deposito.cliente.nombre} ${deposito.cliente.apellidos}`.trim()
                                  : 'Sin cliente'}
                              </div>
                              {deposito.cliente?.telefono && (
                                <div className="text-xs text-gray-500">
                                  {deposito.cliente.telefono}
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="lg:hidden px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {deposito.vehiculo?.marca &&
                              deposito.vehiculo?.modelo
                                ? `${deposito.vehiculo.marca} ${deposito.vehiculo.modelo}`.trim()
                                : 'Sin vehículo'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {deposito.vehiculo?.matricula || '-'}
                            </div>
                            <div className="mt-1">
                              {deposito.monto_recibir && (
                                <div className="text-sm text-green-600 font-medium">
                                  {formatCurrency(deposito.monto_recibir)}
                                </div>
                              )}
                              <div className="mt-1 flex items-center space-x-2">
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(deposito.estado)}`}
                                >
                                  {getEstadoLabel(deposito.estado)}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleViewDeposito(deposito.id)
                                  }}
                                  className="p-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                                >
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Celdas para pantallas grandes (≥ 1024px) */}
                          <td className="hidden lg:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              #{deposito.id}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatDate(deposito.created_at)}
                            </div>
                          </td>
                          <td className="hidden lg:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {deposito.cliente?.nombre &&
                              deposito.cliente?.apellidos
                                ? `${deposito.cliente.nombre} ${deposito.cliente.apellidos}`.trim()
                                : 'Sin cliente'}
                            </div>
                            {deposito.cliente?.telefono && (
                              <div className="text-xs text-gray-500">
                                {deposito.cliente.telefono}
                              </div>
                            )}
                          </td>
                          <td className="hidden lg:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {deposito.vehiculo?.marca &&
                              deposito.vehiculo?.modelo
                                ? `${deposito.vehiculo.marca} ${deposito.vehiculo.modelo}`.trim()
                                : 'Sin vehículo'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {deposito.vehiculo?.matricula || '-'}
                            </div>
                          </td>
                          <td className="hidden lg:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-600">
                              {deposito.monto_recibir
                                ? formatCurrency(deposito.monto_recibir)
                                : '-'}
                            </div>
                          </td>
                          <td className="hidden lg:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-600">
                              {calculateDaysRemaining(
                                deposito.created_at,
                                deposito.dias_gestion
                              )}
                            </div>
                          </td>
                          <td className="hidden xl:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(deposito.estado)}`}
                            >
                              {getEstadoLabel(deposito.estado)}
                            </span>
                          </td>
                          <td className="hidden 2xl:table-cell px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleViewDeposito(deposito.id)
                                }}
                                className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
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
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {getFilteredDepositos().length === 0 && (
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
                          d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No hay depósitos
                    </h3>
                    <p className="text-gray-500">
                      No se encontraron depósitos en el estado "{activeTab}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  )
}
