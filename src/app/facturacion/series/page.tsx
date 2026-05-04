'use client'

import { useEffect, useState, useCallback } from 'react'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import EditSequenceModal from '@/components/invoicing/EditSequenceModal'

interface Sequence {
  id: number
  invoice_type: string
  series: string
  year: number
  next_number: number
  number_format: string
  is_active: boolean
  created_at: string
  updated_at: string
}

const TYPE_LABEL: Record<string, string> = {
  VAT: 'IVA',
  REBU: 'REBU',
  RECTIFYING: 'Rectificativa',
}

function previewNext(seq: Sequence): string {
  const fmt = seq.number_format.match(/^%0?(\d+)d$/)
  if (!fmt) return `${seq.series}-${seq.next_number}`
  const w = parseInt(fmt[1], 10)
  const padded = String(seq.next_number).padStart(w, '0')
  return `${seq.series}-${padded}`
}

export default function SeriesPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const isAdmin = user?.role === 'admin'

  const [rows, setRows] = useState<Sequence[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editing, setEditing] = useState<Sequence | null>(null)

  // showToast is intentionally NOT in the deps: useToast returns a new
  // function on every render, which would cause this useEffect to re-run
  // forever. The closure here just calls showToast's stable setter, so a
  // captured "stale" reference is fine.
  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/invoice-sequences')
      if (!res.ok) throw new Error('Error al cargar series')
      const data = await res.json()
      setRows(data.rows ?? [])
    } catch {
      showToast('Error al cargar las series', 'error')
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-base font-semibold text-gray-900">
          Series y numeración
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Una serie por cada combinación de tipo de factura. La emisión consume{' '}
          <code>next_number</code> y lo incrementa atómicamente. Solo los usuarios
          admin pueden modificar estos valores.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Tipo
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Serie
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                next_number
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Próxima
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Formato
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                Activa
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">
                  No hay series configuradas. Hay que correr la migración.
                </td>
              </tr>
            ) : (
              rows.map((seq) => (
                <tr key={seq.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm font-medium text-gray-900">
                    {TYPE_LABEL[seq.invoice_type] ?? seq.invoice_type}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-700">
                    <code>{seq.series}</code>
                  </td>
                  <td className="px-3 py-2 text-sm font-mono text-gray-900 text-right">
                    {seq.next_number}
                  </td>
                  <td className="px-3 py-2 text-sm font-mono text-primary-700">
                    {previewNext(seq)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-700">
                    <code>{seq.number_format}</code>
                  </td>
                  <td className="px-3 py-2 text-sm text-center">
                    {seq.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Activa
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        Inactiva
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setEditing(seq)}
                      disabled={!isAdmin}
                      className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        isAdmin
                          ? 'Editar serie'
                          : 'Solo admin puede editar'
                      }
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Cualquier cambio de <code>next_number</code> debajo del número más alto
        ya emitido es rechazado por el backend para evitar duplicados. Cualquier
        cambio queda registrado en el historial de auditoría de la última
        factura de la serie.
      </p>

      <EditSequenceModal
        isOpen={editing !== null}
        sequence={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          showToast('Serie actualizada', 'success')
          load()
        }}
      />
    </div>
  )
}
