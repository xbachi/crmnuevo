'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { ExpenseCategory } from '@/lib/invoices/domain'

type ExpenseItem = {
  id: number
  category: ExpenseCategory
  description: string | null
  base: any | null
  iva: any | null
  total: any | null
  currency: string | null
  documentUrl: string | null
  createdAt: string
}

export function VehicleExpensesSection({ vehiculoId }: { vehiculoId: number }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ExpenseItem[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})

  const categories: ExpenseCategory[] = useMemo(
    () => ['limpieza', 'pintura', 'taller', 'transporte', 'gestoria', 'otro'],
    []
  )

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/vehiculos/${vehiculoId}/gastos`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json()
        setItems(data.items || [])
        setTotals(data.totals || {})
      } finally {
        setLoading(false)
      }
    })()
  }, [vehiculoId])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          Gastos (Facturas)
        </h3>
        <button
          className="text-sm px-3 py-1.5 rounded bg-gray-900 text-white"
          onClick={async () => {
            const res = await fetch(`/api/vehiculos/${vehiculoId}/gastos`, {
              cache: 'no-store',
            })
            if (!res.ok) return
            const data = await res.json()
            setItems(data.items || [])
            setTotals(data.totals || {})
          }}
        >
          Recargar
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-600">Cargando gastos...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {categories.map((c) => (
              <div key={c} className="rounded border p-2">
                <div className="text-xs text-gray-600">{c}</div>
                <div className="text-sm font-semibold">
                  {formatCurrency(totals[c] || 0)}
                </div>
              </div>
            ))}
          </div>

          <div className="border rounded">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-700 bg-gray-50 p-2">
              <div className="col-span-2">Categoría</div>
              <div className="col-span-4">Descripción</div>
              <div className="col-span-2">Total</div>
              <div className="col-span-2">Fecha</div>
              <div className="col-span-2">Documento</div>
            </div>
            {items.length === 0 ? (
              <div className="p-2 text-sm text-gray-600">Sin gastos.</div>
            ) : (
              items.slice(0, 50).map((it) => (
                <div
                  key={it.id}
                  className="grid grid-cols-12 gap-2 text-sm p-2 border-t"
                >
                  <div className="col-span-2">{it.category}</div>
                  <div className="col-span-4 truncate">
                    {it.description || '—'}
                  </div>
                  <div className="col-span-2">
                    {it.total != null ? formatCurrency(Number(it.total)) : '—'}
                  </div>
                  <div className="col-span-2 text-xs text-gray-600">
                    {new Date(it.createdAt).toLocaleDateString('es-ES')}
                  </div>
                  <div className="col-span-2">
                    {it.documentUrl ? (
                      <a
                        href={it.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 text-sm"
                      >
                        Ver PDF
                      </a>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="text-xs text-gray-500">
            Mostrando últimos {Math.min(items.length, 50)} gastos.
          </div>
        </>
      )}
    </div>
  )
}
