'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'

interface Recordatorio {
  id: string
  titulo: string
  descripcion: string
  prioridad: 'alta' | 'media' | 'baja'
  fecha_vencimiento: string
  pagina_origen: string
  tipo: string
  created_at: string
  updated_at: string
  es_importante?: boolean
  cliente_nombre?: string
  categoria?: string
  vehiculo_id?: number
  vehiculo_referencia?: string
  vehiculo_marca?: string
  vehiculo_modelo?: string
  vehiculo_matricula?: string
  vehiculo_slug?: string
  cliente_id?: number
  cliente_slug?: string
  deposito_id?: number
  deposito_slug?: string
  inversor_id?: number
  inversor_slug?: string
  deal_id?: number
  deal_slug?: string
}

const PRIORIDAD_COLORS = {
  alta: 'bg-red-100 text-red-800 border-red-200',
  media: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  baja: 'bg-green-100 text-green-800 border-green-200',
}

const PRIORIDAD_LABELS = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

const PAGINA_LABELS = {
  vehiculos: 'Vehículos',
  clientes: 'Clientes',
  deals: 'Deals',
  depositos: 'Depósitos',
  inversores: 'Inversores',
  dashboard: 'Dashboard',
}

const getCategoriaInfo = (categoria: string) => {
  switch (categoria) {
    case 'itv':
      return { titulo: 'ITV Vencida', icono: '🚗', color: 'red' }
    case 'documentacion':
      return { titulo: 'Documentación Pendiente', icono: '📄', color: 'yellow' }
    case 'cambio_nombre':
      return {
        titulo: 'Cambio de Nombre Pendiente',
        icono: '📝',
        color: 'orange',
      }
    case 'otros_importantes':
      return {
        titulo: 'Otros Recordatorios Importantes',
        icono: '⚠️',
        color: 'red',
      }
    case 'manuales_vehiculos':
      return {
        titulo: 'Recordatorios de Vehículos',
        icono: '🚗',
        color: 'blue',
      }
    case 'manuales_clientes':
      return { titulo: 'Recordatorios de Clientes', icono: '👥', color: 'blue' }
    case 'manuales_deals':
      return { titulo: 'Recordatorios de Deals', icono: '📋', color: 'blue' }
    case 'manuales_depositos':
      return {
        titulo: 'Recordatorios de Depósitos',
        icono: '📦',
        color: 'blue',
      }
    case 'manuales_inversores':
      return {
        titulo: 'Recordatorios de Inversores',
        icono: '💰',
        color: 'blue',
      }
    case 'manuales_dashboard':
      return {
        titulo: 'Recordatorios del Dashboard',
        icono: '📊',
        color: 'blue',
      }
    default:
      if (categoria.startsWith('manuales_')) {
        const pagina = categoria.replace('manuales_', '')
        return {
          titulo: `Recordatorios de ${PAGINA_LABELS[pagina as keyof typeof PAGINA_LABELS] || pagina}`,
          icono: '📝',
          color: 'blue',
        }
      }
      return { titulo: categoria, icono: '📋', color: 'gray' }
  }
}

interface RecordatorioStats {
  itvs_pendientes: number
  documentacion_pendiente: number
  cambio_nombre_pendiente: number
  facturar_pendiente: number
}

export default function RecordatoriosPage() {
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [stats, setStats] = useState<RecordatorioStats>({
    itvs_pendientes: 0,
    documentacion_pendiente: 0,
    cambio_nombre_pendiente: 0,
    facturar_pendiente: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRecordatorios()
    fetchStats()
  }, [])

  const fetchRecordatorios = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/recordatorios')
      if (response.ok) {
        const data = await response.json()
        setRecordatorios(data)
      } else {
        setError('Error al cargar recordatorios')
      }
    } catch (error) {
      console.error('Error fetching recordatorios:', error)
      setError('Error al cargar recordatorios')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/recordatorios/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Fecha inválida'

    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()

    return `${day}/${month}/${year}`
  }

  const handleCerrarRecordatorio = (recordatorioId: string) => {
    // Simplemente ocultar el recordatorio del estado local
    console.log(`❌ [RECORDATORIOS] Cerrando recordatorio: ${recordatorioId}`)
    setRecordatorios((prev) => prev.filter((r) => r.id !== recordatorioId))
  }

  const getRecordatoriosByCategoria = () => {
    const grouped: { [key: string]: Recordatorio[] } = {}

    recordatorios.forEach((recordatorio) => {
      let categoria = ''

      if (recordatorio.es_importante) {
        // Para recordatorios importantes, agrupar por categoría específica
        if (recordatorio.categoria === 'itv') {
          categoria = 'itv'
        } else if (recordatorio.categoria === 'documentacion') {
          categoria = 'documentacion'
        } else if (recordatorio.categoria === 'cambio_nombre') {
          categoria = 'cambio_nombre'
        } else {
          categoria = 'otros_importantes'
        }
      } else {
        // Para recordatorios manuales, agrupar por página de origen
        categoria = `manuales_${recordatorio.pagina_origen}`
      }

      if (!grouped[categoria]) {
        grouped[categoria] = []
      }
      grouped[categoria].push(recordatorio)
    })

    // Ordenar por prioridad dentro de cada categoría
    Object.keys(grouped).forEach((categoria) => {
      const prioridadOrder = { alta: 3, media: 2, baja: 1 }
      grouped[categoria].sort(
        (a, b) => prioridadOrder[b.prioridad] - prioridadOrder[a.prioridad]
      )
    })

    return grouped
  }

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
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
          <div className="max-w-7xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  const recordatoriosByCategoria = getRecordatoriosByCategoria()

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                  Recordatorios
                </h1>
                <p className="text-sm sm:text-base text-gray-600">
                  Todos los recordatorios organizados por página y prioridad
                </p>
              </div>
              <Link
                href="/dashboard"
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm sm:text-base"
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
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                <span>Volver al Dashboard</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            {/* Recordatorios por categoría */}
            {Object.keys(recordatoriosByCategoria).length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
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
                      d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No hay recordatorios
                </h3>
                <p className="text-gray-500">
                  No se encontraron recordatorios para mostrar.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(recordatoriosByCategoria).map(
                  ([categoria, recordatoriosCategoria]) => {
                    const categoriaInfo = getCategoriaInfo(categoria)
                    const isImportante = !categoria.startsWith('manuales_')

                    return (
                      <div
                        key={categoria}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
                      >
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <span className="text-lg">{categoriaInfo.icono}</span>
                          {categoriaInfo.titulo}
                          <span className="text-sm font-normal text-gray-500">
                            ({recordatoriosCategoria.length} recordatorio
                            {recordatoriosCategoria.length !== 1 ? 's' : ''})
                          </span>
                        </h2>

                        <div className="grid gap-1">
                          {recordatoriosCategoria.map((recordatorio) => (
                            <div
                              key={recordatorio.id}
                              className={`border rounded p-2 hover:shadow-sm transition-shadow relative ${
                                isImportante
                                  ? `border-l-2 border-${categoriaInfo.color}-400 bg-${categoriaInfo.color}-50 border-${categoriaInfo.color}-200`
                                  : 'border-gray-200'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="text-xs font-medium text-gray-900 truncate flex-1 mr-2">
                                  {recordatorio.titulo}
                                </h4>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORIDAD_COLORS[recordatorio.prioridad]}`}
                                  >
                                    {PRIORIDAD_LABELS[recordatorio.prioridad]}
                                  </span>
                                  <button
                                    onClick={() =>
                                      handleCerrarRecordatorio(recordatorio.id)
                                    }
                                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                    title="Cerrar notificación"
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
                                        d="M6 18L18 6M6 6l12 12"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  {recordatorio.descripcion && (
                                    <p className="text-xs text-gray-600 mb-1 line-clamp-1">
                                      {recordatorio.descripcion}
                                    </p>
                                  )}

                                  {recordatorio.cliente_nombre && (
                                    <p className="text-xs text-blue-600 mb-1 font-medium">
                                      👤 {recordatorio.cliente_nombre}
                                    </p>
                                  )}

                                  {/* Enlaces según el tipo de recordatorio */}
                                  {recordatorio.vehiculo_slug && (
                                    <Link
                                      href={`/vehiculos/${recordatorio.vehiculo_slug}`}
                                      className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      🚗 {recordatorio.vehiculo_referencia}
                                      <svg
                                        className="w-2.5 h-2.5 ml-1"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                        />
                                      </svg>
                                    </Link>
                                  )}

                                  {recordatorio.cliente_slug && (
                                    <Link
                                      href={`/clientes/${recordatorio.cliente_slug}`}
                                      className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      👤 {recordatorio.cliente_nombre}
                                      <svg
                                        className="w-2.5 h-2.5 ml-1"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                        />
                                      </svg>
                                    </Link>
                                  )}

                                  {recordatorio.deposito_slug && (
                                    <Link
                                      href={`/depositos/${recordatorio.deposito_slug}`}
                                      className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      📦 Depósito #{recordatorio.deposito_id}
                                      <svg
                                        className="w-2.5 h-2.5 ml-1"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                        />
                                      </svg>
                                    </Link>
                                  )}

                                  {recordatorio.inversor_slug && (
                                    <Link
                                      href={`/inversores/${recordatorio.inversor_slug}`}
                                      className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      💰{' '}
                                      {recordatorio.cliente_nombre ||
                                        `Inversor #${recordatorio.inversor_id}`}
                                      <svg
                                        className="w-2.5 h-2.5 ml-1"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                        />
                                      </svg>
                                    </Link>
                                  )}

                                  {recordatorio.deal_slug && (
                                    <Link
                                      href={`/deals/${recordatorio.deal_slug}`}
                                      className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      📋 Deal #{recordatorio.deal_id}
                                      <svg
                                        className="w-2.5 h-2.5 ml-1"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                        />
                                      </svg>
                                    </Link>
                                  )}
                                </div>

                                <div className="text-xs text-gray-500 flex-shrink-0 text-right">
                                  <div>
                                    Vence:{' '}
                                    {formatDate(recordatorio.fecha_vencimiento)}
                                  </div>
                                  <div className="text-xs">
                                    {recordatorio.tipo}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }
                )}
              </div>
            )}

            {/* Columna de estadísticas */}
            <div className="lg:order-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="text-blue-500">📊</span>
                  Recuento de Pendientes
                </h2>

                <div className="space-y-4">
                  {/* ITVs Pendientes */}
                  <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-red-500 text-lg">🚗</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          ITVs Pendientes
                        </p>
                        <p className="text-xs text-gray-500">
                          Vencidas o próximas a vencer
                        </p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-red-600">
                      {stats.itvs_pendientes}
                    </span>
                  </div>

                  {/* Documentación Pendiente */}
                  <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-yellow-500 text-lg">📄</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Documentación Pendiente
                        </p>
                        <p className="text-xs text-gray-500">
                          Vehículos sin documentación
                        </p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-yellow-600">
                      {stats.documentacion_pendiente}
                    </span>
                  </div>

                  {/* Cambio de Nombre Pendiente */}
                  <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-orange-500 text-lg">📝</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Cambio de Nombre
                        </p>
                        <p className="text-xs text-gray-500">
                          Deals facturados sin cambio
                        </p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-orange-600">
                      {stats.cambio_nombre_pendiente}
                    </span>
                  </div>

                  {/* Facturar Pendiente */}
                  <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-blue-500 text-lg">💰</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Facturar Pendiente
                        </p>
                        <p className="text-xs text-gray-500">
                          Deals vendidos sin facturar
                        </p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-blue-600">
                      {stats.facturar_pendiente}
                    </span>
                  </div>
                </div>

                {/* Total */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      Total Pendientes
                    </span>
                    <span className="text-xl font-bold text-gray-900">
                      {stats.itvs_pendientes +
                        stats.documentacion_pendiente +
                        stats.cambio_nombre_pendiente +
                        stats.facturar_pendiente}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
