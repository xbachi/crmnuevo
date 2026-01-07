'use client'

import { useEffect, useMemo, useState } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { formatCurrency } from '@/lib/utils'
import type { ExpenseCategory } from '@/lib/invoices/domain'

type PendingItem = {
  id: number
  originalFilename: string
  status: string
  reason: string | null
  graphWebUrl: string | null
  createdAt: string
  invoice: null | {
    id: number
    matricula: string | null
    category: ExpenseCategory | null
    total: any | null
    base: any | null
    iva: any | null
    invoiceNumber: string | null
    vendor: null | { id: number; name: string; nif: string | null }
    vehiculo: null | { id: number; matricula: string; referencia: string }
  }
}

async function fetchPending(): Promise<PendingItem[]> {
  const res = await fetch('/api/invoices/pending', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Error cargando pendientes (${res.status})`)
  const data = await res.json()
  return data.items as PendingItem[]
}

async function searchVehiculoIdByMatricula(
  matricula: string
): Promise<number | null> {
  const q = encodeURIComponent(matricula)
  const res = await fetch(`/api/vehiculos?search=${q}&limit=5&page=1`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  const data = await res.json()
  const vehiculos = data.vehiculos as Array<{ id: number; matricula: string }>
  const exact = vehiculos.find(
    (v) => v.matricula?.toUpperCase() === matricula.toUpperCase()
  )
  return (exact || vehiculos[0])?.id ?? null
}

export default function PendingInvoicesPage() {
  const [items, setItems] = useState<PendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [matriculaByDocId, setMatriculaByDocId] = useState<
    Record<number, string>
  >({})
  const [categoryByDocId, setCategoryByDocId] = useState<
    Record<number, ExpenseCategory>
  >({})
  const [busyDocId, setBusyDocId] = useState<number | null>(null)

  const categories: ExpenseCategory[] = useMemo(
    () => ['limpieza', 'pintura', 'taller', 'transporte', 'gestoria', 'otro'],
    []
  )

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const pending = await fetchPending()
        setItems(pending)
      } catch (e: any) {
        setError(e?.message || 'Error')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleResolve = async (doc: PendingItem) => {
    try {
      setBusyDocId(doc.id)
      const matricula = (
        matriculaByDocId[doc.id] ||
        doc.invoice?.matricula ||
        ''
      ).trim()
      const category =
        categoryByDocId[doc.id] ||
        doc.invoice?.category ||
        ('otro' as ExpenseCategory)

      if (!matricula) {
        alert('Ingresa una matrícula')
        return
      }

      const vehiculoId = await searchVehiculoIdByMatricula(matricula)
      if (!vehiculoId) {
        alert('No se encontró el vehículo por matrícula')
        return
      }

      const res = await fetch('/api/invoices/resolve-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, vehiculoId, category }),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`Error resolviendo (${res.status}): ${txt}`)
      }

      // Optimistic UI: remove from list (job runs async)
      setItems((prev) => prev.filter((x) => x.id !== doc.id))
    } catch (e: any) {
      alert(e?.message || 'Error resolviendo')
    } finally {
      setBusyDocId(null)
    }
  }

  return (
    <ProtectedRoute>
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-semibold">
            Facturas Pendientes
          </h1>
          <button
            className="px-3 py-2 text-sm rounded bg-gray-900 text-white"
            onClick={async () => {
              setLoading(true)
              try {
                setItems(await fetchPending())
              } finally {
                setLoading(false)
              }
            }}
          >
            Recargar
          </button>
        </div>

        {loading && <div className="text-sm text-gray-600">Cargando...</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        {!loading && !error && items.length === 0 && (
          <div className="text-sm text-gray-600">
            No hay facturas pendientes.
          </div>
        )}

        <div className="space-y-3">
          {items.map((doc) => {
            const inv = doc.invoice
            const suggestedMat = inv?.matricula || ''
            const suggestedCat = inv?.category || 'otro'

            return (
              <div
                key={doc.id}
                className="border rounded-lg p-3 sm:p-4 bg-white space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {doc.originalFilename}
                    </div>
                    <div className="text-xs text-gray-600">
                      Estado: {doc.status}{' '}
                      {doc.reason ? `• Motivo: ${doc.reason}` : ''}
                    </div>
                    <div className="text-xs text-gray-600">
                      Proveedor: {inv?.vendor?.name || '—'}{' '}
                      {inv?.vendor?.nif ? `(${inv.vendor.nif})` : ''}
                      {inv?.invoiceNumber ? ` • Nº ${inv.invoiceNumber}` : ''}
                    </div>
                    <div className="text-xs text-gray-600">
                      Totales:{' '}
                      {inv?.total != null
                        ? formatCurrency(Number(inv.total))
                        : '—'}{' '}
                      {inv?.base != null
                        ? `• Base ${formatCurrency(Number(inv.base))}`
                        : ''}{' '}
                      {inv?.iva != null
                        ? `• IVA ${formatCurrency(Number(inv.iva))}`
                        : ''}
                    </div>
                  </div>

                  {doc.graphWebUrl ? (
                    <a
                      href={doc.graphWebUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-blue-600 whitespace-nowrap"
                    >
                      Ver PDF
                    </a>
                  ) : (
                    <span className="text-sm text-gray-400 whitespace-nowrap">
                      Sin link
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="block text-xs text-gray-700">
                      Matrícula
                    </label>
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      placeholder="1234ABC"
                      defaultValue={suggestedMat}
                      onChange={(e) =>
                        setMatriculaByDocId((prev) => ({
                          ...prev,
                          [doc.id]: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-700">
                      Categoría
                    </label>
                    <select
                      className="w-full border rounded px-2 py-1 text-sm"
                      defaultValue={suggestedCat}
                      onChange={(e) =>
                        setCategoryByDocId((prev) => ({
                          ...prev,
                          [doc.id]: e.target.value as ExpenseCategory,
                        }))
                      }
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    className="px-3 py-2 text-sm rounded bg-green-600 text-white disabled:opacity-50"
                    disabled={busyDocId === doc.id}
                    onClick={() => handleResolve(doc)}
                  >
                    Confirmar y procesar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </ProtectedRoute>
  )
}
