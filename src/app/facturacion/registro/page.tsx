'use client'

import { useEffect, useState, useCallback } from 'react'
import { useToast } from '@/components/Toast'
import { InvoiceTypeBadge } from '@/components/invoicing/InvoiceStatusBadge'

interface AutomationLog {
  id: number
  numero_factura: string | null
  coche: string | null
  matricula: string | null
  invoice_type: string | null
  venta_guardada: boolean | null
  compra_adjunta: boolean | null
  email_gestora: boolean | null
  contrato_enviado: boolean | null
  ok: boolean | null
  notas: string | null
  created_at: string
}

function formatDateTime(d?: string | null) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return d
  }
}

function BoolCell({ value }: { value: boolean | null }) {
  if (value === null) {
    return <span className="text-gray-400">—</span>
  }
  return value ? (
    <span className="text-green-600 font-semibold" aria-label="Sí">
      ✓
    </span>
  ) : (
    <span className="text-red-600 font-semibold" aria-label="No">
      ✗
    </span>
  )
}

export default function RegistroAutomatizacionesPage() {
  const { showToast } = useToast()

  const [rows, setRows] = useState<AutomationLog[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // showToast intentionally omitted from deps: useToast returns a fresh
  // function each render, so including it would loop the effect forever.
  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/automation-log')
      if (!res.ok) throw new Error('Error al cargar el registro')
      const data = await res.json()
      setRows((data.logs ?? []) as AutomationLog[])
    } catch (err) {
      console.error(err)
      showToast('Error al cargar el registro de automatizaciones', 'error')
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Registro de automatizaciones
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Estado de cada venta automatizada: archivado de la factura, búsqueda de
          la factura de compra y mail a la gestoría con la factura y el contrato
          de venta.
        </p>
      </div>

      {/* Counter */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          {isLoading
            ? 'Cargando…'
            : `${rows.length} registro${rows.length === 1 ? '' : 's'}`}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Factura
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coche
                </th>
                <th className="hidden md:table-cell px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Matrícula
                </th>
                <th className="hidden md:table-cell px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Venta
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Compra
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mail
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contrato
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notas
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
                    Cargando registros…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-8 text-center text-sm text-gray-500"
                  >
                    Todavía no hay registros.
                  </td>
                </tr>
              ) : (
                rows.map((log) => {
                  const hasNote = !!log.notas
                  const rowClass =
                    log.ok === true
                      ? 'bg-green-50 hover:bg-green-100'
                      : log.ok === false || hasNote
                        ? 'bg-amber-50 hover:bg-amber-100'
                        : 'hover:bg-gray-50'
                  return (
                    <tr key={log.id} className={rowClass}>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                        {log.numero_factura ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700 max-w-[200px] truncate">
                        {log.coche ?? '—'}
                      </td>
                      <td className="hidden md:table-cell px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                        {log.matricula ?? '—'}
                      </td>
                      <td className="hidden md:table-cell px-3 py-2 whitespace-nowrap">
                        {log.invoice_type ? (
                          <InvoiceTypeBadge type={log.invoice_type} />
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                        <BoolCell value={log.venta_guardada} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                        <BoolCell value={log.compra_adjunta} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                        <BoolCell value={log.email_gestora} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                        <BoolCell value={log.contrato_enviado} />
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700 max-w-[280px]">
                        {hasNote ? (
                          <span className="inline-flex items-start gap-1 text-amber-800">
                            <span aria-hidden="true">⚠</span>
                            <span>{log.notas}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
