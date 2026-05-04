'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import { InvoiceStatusBadge } from '@/components/invoicing/InvoiceStatusBadge'

interface Invoice {
  id: number
  full_invoice_number: string
  invoice_type: string
  invoice_date: string
  buyer_name: string
  total_amount: string
  status: string
  pdf_url: string | null
}

export default function ErroresPage() {
  const { showToast } = useToast()
  const [pendingRows, setPendingRows] = useState<Invoice[]>([])
  const [errorRows, setErrorRows] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [a, b] = await Promise.all([
          fetch('/api/invoices?status=PDF_PENDING&pageSize=100').then((r) =>
            r.ok ? r.json() : { rows: [] }
          ),
          fetch('/api/invoices?status=ERROR&pageSize=100').then((r) =>
            r.ok ? r.json() : { rows: [] }
          ),
        ])
        setPendingRows(a.rows ?? [])
        setErrorRows(b.rows ?? [])
      } catch {
        showToast('Error al cargar facturas con problemas', 'error')
      } finally {
        setIsLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const renderTable = (rows: Invoice[], title: string, hint: string) => (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500 mt-1">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500 text-center">
          No hay facturas en este estado.
        </div>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Número
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Comprador
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                Total
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Estado
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-sm font-medium text-primary-700">
                  <Link href={`/facturacion/${inv.id}`} className="hover:underline">
                    {inv.full_invoice_number}
                  </Link>
                </td>
                <td className="px-3 py-2 text-sm text-gray-700">{inv.buyer_name}</td>
                <td className="px-3 py-2 text-sm text-gray-900 text-right">
                  {Number(inv.total_amount).toLocaleString('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </td>
                <td className="px-3 py-2">
                  <InvoiceStatusBadge status={inv.status} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/facturacion/${inv.id}`}
                    className="text-xs text-primary-700 hover:underline"
                  >
                    Resolver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
        Cargando…
      </div>
    )
  }

  return (
    <div>
      {renderTable(
        pendingRows,
        `PDF pendiente (${pendingRows.length})`,
        'Estas facturas tienen el número fiscal reservado pero el PDF no se generó. Entrá al detalle y regenerá el PDF.'
      )}
      {renderTable(
        errorRows,
        `Errores (${errorRows.length})`,
        'Facturas que fallaron en el flujo y necesitan intervención manual.'
      )}
    </div>
  )
}
