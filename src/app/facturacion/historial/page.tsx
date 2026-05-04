'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import Pagination from '@/components/Pagination'
import {
  InvoiceStatusBadge,
  InvoiceTypeBadge,
} from '@/components/invoicing/InvoiceStatusBadge'

type InvoiceType = 'VAT' | 'REBU' | 'RECTIFYING'
type InvoiceStatus =
  | 'ISSUED'
  | 'PDF_PENDING'
  | 'ERROR'
  | 'VOIDED'
  | 'RECTIFIED'
  | 'IMPORTED'

interface Invoice {
  id: number
  full_invoice_number: string
  invoice_type: InvoiceType
  series: string
  number: number
  invoice_date: string
  buyer_name: string
  buyer_nif_cif: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_plate: string | null
  total_amount: string
  status: InvoiceStatus
  pdf_url: string | null
}

const PAGE_SIZE = 25

const TYPE_OPTIONS: { value: '' | InvoiceType; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'VAT', label: 'IVA' },
  { value: 'REBU', label: 'REBU' },
  { value: 'RECTIFYING', label: 'Rectificativa' },
]

const STATUS_OPTIONS: { value: '' | InvoiceStatus; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'ISSUED', label: 'Emitida' },
  { value: 'PDF_PENDING', label: 'PDF pendiente' },
  { value: 'ERROR', label: 'Error' },
  { value: 'IMPORTED', label: 'Importada' },
  { value: 'VOIDED', label: 'Anulada' },
  { value: 'RECTIFIED', label: 'Rectificada' },
]

function formatDate(d?: string | null) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return d
  }
}

function formatEUR(amount: string | number | null) {
  if (amount == null) return '—'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  })
}

export default function HistorialFacturacionPage() {
  const { showToast } = useToast()

  const [rows, setRows] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [invoiceType, setInvoiceType] = useState<'' | InvoiceType>('')
  const [year, setYear] = useState<number | ''>('')
  const [status, setStatus] = useState<'' | InvoiceStatus>('')

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const yearOptions = (() => {
    const current = new Date().getFullYear()
    const years: number[] = []
    for (let y = current; y >= current - 6; y--) years.push(y)
    return years
  })()

  // showToast intentionally omitted from deps: useToast returns a fresh
  // function each render, so including it here would loop the effect
  // forever. See `series/page.tsx` for the same pattern.
  const fetchInvoices = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))
      params.set('sortBy', 'number')
      params.set('sortDir', 'desc')
      if (search.trim()) params.set('search', search.trim())
      if (invoiceType) params.set('invoiceType', invoiceType)
      if (year) params.set('year', String(year))
      if (status) params.set('status', status)

      const res = await fetch(`/api/invoices?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar facturas')
      const data = await res.json()
      setRows(data.rows ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      console.error(err)
      showToast('Error al cargar el historial de facturas', 'error')
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, invoiceType, year, status])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  const clearFilters = () => {
    setSearchInput('')
    setSearch('')
    setInvoiceType('')
    setYear('')
    setStatus('')
    setPage(1)
  }

  const handleDownload = (invoice: Invoice) => {
    if (!invoice.pdf_url) {
      showToast(
        'Esta factura no tiene PDF disponible. Probá regenerarla desde el detalle.',
        'info'
      )
      return
    }
    window.open(`/api/invoices/${invoice.id}/download`, '_blank')
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <form
          onSubmit={handleSearchSubmit}
          className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Buscar (número, comprador, matrícula, NIF)
            </label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="F-2026-023, ABC-123, 12345678X..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tipo
            </label>
            <select
              value={invoiceType}
              onChange={(e) => {
                setPage(1)
                setInvoiceType(e.target.value as '' | InvoiceType)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Año
            </label>
            <select
              value={year}
              onChange={(e) => {
                setPage(1)
                setYear(e.target.value ? parseInt(e.target.value, 10) : '')
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todos</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Estado
            </label>
            <select
              value={status}
              onChange={(e) => {
                setPage(1)
                setStatus(e.target.value as '' | InvoiceStatus)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 flex space-x-2">
            <button
              type="submit"
              className="flex-1 px-3 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
            >
              Limpiar
            </button>
          </div>
        </form>
      </div>

      {/* Counter */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          {isLoading ? 'Cargando…' : `${total} factura${total === 1 ? '' : 's'}`}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Número
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Comprador
                </th>
                <th className="hidden md:table-cell px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  NIF
                </th>
                <th className="hidden lg:table-cell px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vehículo
                </th>
                <th className="hidden md:table-cell px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Matrícula
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading && rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-8 text-center text-sm text-gray-500"
                  >
                    Cargando facturas…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-8 text-center text-sm text-gray-500"
                  >
                    No se encontraron facturas con los filtros actuales.
                  </td>
                </tr>
              ) : (
                rows.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link
                        href={`/facturacion/${inv.id}`}
                        className="text-sm font-medium text-primary-700 hover:underline"
                      >
                        {inv.full_invoice_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <InvoiceTypeBadge type={inv.invoice_type} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                      {formatDate(inv.invoice_date)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-900 max-w-[200px] truncate">
                      {inv.buyer_name}
                    </td>
                    <td className="hidden md:table-cell px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                      {inv.buyer_nif_cif ?? '—'}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2 text-sm text-gray-700 max-w-[200px] truncate">
                      {[inv.vehicle_make, inv.vehicle_model]
                        .filter(Boolean)
                        .join(' ') || '—'}
                    </td>
                    <td className="hidden md:table-cell px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                      {inv.vehicle_plate ?? '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                      {formatEUR(inv.total_amount)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <div className="flex justify-end space-x-1">
                        <Link
                          href={`/facturacion/${inv.id}`}
                          title="Ver detalle"
                          className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
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
                        </Link>
                        <button
                          onClick={() => handleDownload(inv)}
                          disabled={!inv.pdf_url}
                          title={
                            inv.pdf_url
                              ? 'Descargar PDF'
                              : 'PDF no disponible (regenerar desde detalle)'
                          }
                          className={`p-1.5 rounded ${
                            inv.pdf_url
                              ? 'bg-green-50 text-green-700 hover:bg-green-100'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
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
                              d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-3 py-3 border-t border-gray-200">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="text-xs text-gray-500 mt-4">
        Las facturas con estado{' '}
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
          Importada
        </span>{' '}
        son facturas legacy migradas desde el campo <code>Deal.factura</code> y no
        tienen PDF descargable. Las facturas con estado{' '}
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
          PDF pendiente
        </span>{' '}
        tienen el número fiscal reservado pero el PDF falló: regenerá desde el
        detalle.
      </p>
    </div>
  )
}
