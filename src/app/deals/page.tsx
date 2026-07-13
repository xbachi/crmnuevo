'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { formatCurrency, capitalizeText } from '@/lib/utils'
import ProtectedRoute from '@/components/ProtectedRoute'
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal'
import type {
  EstadoFiltro,
  TipoFiltro,
  VentaUnificada,
} from '@/lib/ventasUnificadas'

interface Contadores {
  todas?: number
  retail?: number
  b2b?: number
  nuevo?: number
  reservado?: number
  vendido?: number
  facturado?: number
  anulado?: number
}

interface Totales {
  mesVentas: number
  mesImporte: number
  mesB2B: number
  trimestreVentas: number
  trimestreImporte: number
  trimestreB2B: number
  sinFacturar: number
}

interface VentasResponse {
  ventas: VentaUnificada[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  contadores: Contadores
  totales: Totales
}

const PAGE_SIZE = 25

const TIPOS: { key: TipoFiltro; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'retail', label: 'Retail' },
  { key: 'b2b', label: 'B2B' },
]

const ESTADOS: { key: EstadoFiltro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'nuevo', label: 'Nuevo' },
  { key: 'reservado', label: 'Reservado' },
  { key: 'vendido', label: 'Vendido' },
  { key: 'facturado', label: 'Facturado' },
  { key: 'anulado', label: 'Anulado' },
]

const ESTADO_CLASS: Record<string, string> = {
  nuevo: 'bg-blue-100 text-blue-700',
  reservado: 'bg-yellow-100 text-yellow-700',
  vendido: 'bg-green-100 text-green-700',
  facturado: 'bg-purple-100 text-purple-700',
  anulado: 'bg-red-100 text-red-700',
}

const formatDate = (date: string | null) => {
  if (!date) return '-'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function VentasPage() {
  const [data, setData] = useState<VentasResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tipo, setTipo] = useState<TipoFiltro>('todas')
  const [estado, setEstado] = useState<EstadoFiltro>('todos')
  const [page, setPage] = useState(1)

  const router = useRouter()
  const { showToast } = useToast()

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  const fetchVentas = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        tipo,
        estado,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      if (debouncedSearch) params.set('q', debouncedSearch)

      const response = await fetch(`/api/ventas/unificadas?${params}`)
      if (!response.ok) throw new Error('Error al cargar las ventas')

      setData(await response.json())
      setError(null)
    } catch (err) {
      console.error('Error fetching ventas:', err)
      setError('Error al cargar las ventas')
      showToast('Error al cargar las ventas', 'error')
    } finally {
      setIsLoading(false)
    }
    // showToast es estable en el provider; no se incluye para no re-disparar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, estado, page, debouncedSearch])

  useEffect(() => {
    fetchVentas()
  }, [fetchVentas])

  // Refresh al volver a la pestaña (ej: navegando de vuelta desde una ficha)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchVentas()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchVentas])

  const [ventaToDelete, setVentaToDelete] = useState<VentaUnificada | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDeleteConfirm = async () => {
    if (!ventaToDelete) return
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/deals/${ventaToDelete.id}`, {
        method: 'DELETE',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        showToast(body?.error || 'Error al eliminar el deal', 'error')
        return
      }
      showToast('Deal eliminado correctamente', 'success')
      setVentaToDelete(null)
      fetchVentas()
    } catch (err) {
      console.error('Error eliminando deal:', err)
      showToast('Error al eliminar el deal', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const ventas = data?.ventas ?? []
  const contadores = data?.contadores ?? {}
  const totales = data?.totales
  const totalPages = data?.totalPages ?? 1

  const setTipoFiltro = (t: TipoFiltro) => {
    setTipo(t)
    setPage(1)
  }
  const setEstadoFiltro = (e: EstadoFiltro) => {
    setEstado(e)
    setPage(1)
  }

  return (
    <ProtectedRoute>
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <main className="w-[90%] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          {/* Header */}
          <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 mb-4">
            <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white">
                  Ventas
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm">
                  Retail y B2B en una sola lista • {contadores.todas ?? 0}{' '}
                  registradas ({contadores.retail ?? 0} retail /{' '}
                  {contadores.b2b ?? 0} B2B)
                </p>
              </div>
              <button
                onClick={() => router.push('/deals/nuevo')}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg self-start"
              >
                + Nueva venta retail
              </button>
            </div>
          </div>

          {/* KPIs — incluyen retail + B2B */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="text-xs font-medium text-blue-600">
                Ventas del mes
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {totales?.mesVentas ?? 0}
              </div>
              <div className="text-xs text-slate-500">
                incluye {totales?.mesB2B ?? 0} B2B
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="text-xs font-medium text-green-600">
                Importe del mes
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(totales?.mesImporte ?? 0)}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="text-xs font-medium text-indigo-600">
                Ventas del trimestre
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {totales?.trimestreVentas ?? 0}
              </div>
              <div className="text-xs text-slate-500">
                incluye {totales?.trimestreB2B ?? 0} B2B •{' '}
                {formatCurrency(totales?.trimestreImporte ?? 0)}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="text-xs font-medium text-amber-600">
                Sin facturar
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {totales?.sinFacturar ?? 0}
              </div>
              <div className="text-xs text-slate-500">ventas sin factura</div>
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Buscar por cliente, vehículo, matrícula, nº de venta o factura..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">Tipo:</span>
                <div className="flex bg-gray-100 rounded-lg p-1">
                  {TIPOS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTipoFiltro(t.key)}
                      className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1 ${
                        tipo === t.key
                          ? 'bg-white text-gray-800 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      <span>{t.label}</span>
                      {t.key !== 'todas' && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">
                          {t.key === 'retail'
                            ? (contadores.retail ?? 0)
                            : (contadores.b2b ?? 0)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">
                  Estado:
                </span>
                <div className="flex flex-wrap bg-gray-100 rounded-lg p-1">
                  {ESTADOS.map((e) => (
                    <button
                      key={e.key}
                      onClick={() => setEstadoFiltro(e.key)}
                      className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1 ${
                        estado === e.key
                          ? 'bg-white text-gray-800 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      <span>{e.label}</span>
                      {e.key !== 'todos' && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">
                          {contadores[e.key as keyof Contadores] ?? 0}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tabla */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Cargando ventas...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow-md border border-red-200 p-8 text-center text-red-600">
              {error}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Venta
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Cliente
                      </th>
                      <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vehículo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Importe
                      </th>
                      <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Factura
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ventas.map((venta) => (
                      <tr
                        key={venta.key}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(venta.href)}
                      >
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                                venta.tipo === 'b2b'
                                  ? 'bg-orange-100 text-orange-700 border border-orange-300'
                                  : 'bg-sky-100 text-sky-700 border border-sky-300'
                              }`}
                            >
                              {venta.tipo === 'b2b' ? 'B2B' : 'Retail'}
                            </span>
                            <span className="text-sm font-medium text-gray-900">
                              {venta.numero ?? `#${venta.id}`}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDate(venta.fecha)}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {venta.cliente
                              ? capitalizeText(venta.cliente)
                              : 'Sin cliente'}
                          </div>
                          <div className="md:hidden text-xs text-gray-500">
                            {venta.vehiculo ?? '-'}
                          </div>
                        </td>
                        <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {venta.vehiculo
                              ? capitalizeText(venta.vehiculo)
                              : 'Sin vehículo'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {venta.matricula || '-'}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                          {venta.importe != null
                            ? formatCurrency(venta.importe)
                            : '-'}
                        </td>
                        <td className="hidden sm:table-cell px-4 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              ESTADO_CLASS[
                                venta.anulada ? 'anulado' : venta.estado
                              ] ?? 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {venta.anulada ? 'anulado' : venta.estado}
                          </span>
                        </td>
                        <td className="hidden lg:table-cell px-4 py-4 whitespace-nowrap">
                          {venta.facturada ? (
                            <span className="text-sm text-gray-900">
                              {venta.facturaNumero}
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              Sin facturar
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(venta.href)
                              }}
                              className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                              title={
                                venta.tipo === 'b2b'
                                  ? 'Ver cliente B2B'
                                  : 'Ver deal'
                              }
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
                            {venta.tipo === 'retail' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setVentaToDelete(venta)
                                }}
                                className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                title="Eliminar"
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
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {ventas.length === 0 && (
                <div className="text-center py-12">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No hay ventas
                  </h3>
                  <p className="text-gray-500">
                    No se encontraron ventas con los filtros actuales
                  </p>
                </div>
              )}

              {/* Paginación */}
              {ventas.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <span className="text-sm text-gray-600">
                    {data?.total ?? 0} ventas • página {data?.page ?? 1} de{' '}
                    {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={(data?.page ?? 1) <= 1}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={(data?.page ?? 1) >= totalPages}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        <ConfirmDeleteModal
          isOpen={ventaToDelete !== null}
          onClose={() => {
            if (!isDeleting) setVentaToDelete(null)
          }}
          onConfirm={handleDeleteConfirm}
          title="Eliminar deal"
          message="¿Estás seguro de eliminar este deal? Esta acción borra el deal y libera el vehículo asociado."
          fileName={
            ventaToDelete
              ? `Deal ${ventaToDelete.numero ?? ventaToDelete.id} — ${capitalizeText(ventaToDelete.vehiculo ?? '')}`.trim()
              : undefined
          }
          isLoading={isDeleting}
        />
      </div>
    </ProtectedRoute>
  )
}
