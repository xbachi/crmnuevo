'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import {
  InvoiceStatusBadge,
  InvoiceTypeBadge,
} from '@/components/invoicing/InvoiceStatusBadge'
import { downloadPdf } from '@/lib/pdf/download'

interface Invoice {
  id: number
  invoice_type: string
  series: string
  number: number
  full_invoice_number: string
  invoice_date: string
  total_amount: string
  status: string
  pdf_url: string | null
}

interface PreviewData {
  invoiceType: string
  series: string
  nextNumber: number
  fullInvoiceNumber: string
  invoiceDate: string
  amounts: {
    total_amount: number
    vat_rate: number | null
    vat_amount: number | null
    taxable_base: number | null
  }
}

interface Props {
  saleId: number
  /** When the legacy Deal.factura field is populated but we have no row in
   *  the new invoices table, we still surface the legacy reference. */
  legacyFacturaName?: string | null
  legacyFacturaDate?: string | null
  /** Invoked after a successful issue/preview refresh so the parent page
   *  (e.g. the Documentación panel reading `deal.factura`) can re-fetch. */
  onInvoiceIssued?: () => void | Promise<void>
}

function formatEUR(n: number | string | null | undefined) {
  if (n == null) return '—'
  const v = typeof n === 'string' ? parseFloat(n) : n
  if (Number.isNaN(v)) return '—'
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

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

/**
 * UUID v4 generator without a dependency. Used for the `Idempotency-Key`
 * header so retries of the same click don't produce duplicate invoices.
 */
function uuidv4() {
  // crypto.randomUUID() exists in modern browsers + Node 19+
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as { randomUUID: () => string }).randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export default function DealInvoiceSection({
  saleId,
  legacyFacturaName,
  legacyFacturaDate,
  onInvoiceIssued,
}: Props) {
  const { showToast, ToastContainer } = useToast()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewType, setPreviewType] = useState<'VAT' | 'REBU' | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [justIssued, setJustIssued] = useState<string | null>(null)

  const handleDownload = useCallback(
    async (inv: Invoice) => {
      await downloadPdf({
        url: `/api/invoices/${inv.id}/download`,
        filename: `factura-${inv.full_invoice_number}`,
        onStart: () => setDownloadingId(inv.id),
        onFinish: () => setDownloadingId(null),
        onError: (msg) => showToast(msg, 'error'),
      })
    },
    [showToast]
  )

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/invoices?dealId=${saleId}&pageSize=10`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.rows ?? [])
      }
    } catch (e) {
      console.error('[DealInvoiceSection] load', e)
    } finally {
      setIsLoading(false)
    }
  }, [saleId])

  useEffect(() => {
    load()
  }, [load])

  const handlePreview = async (type: 'VAT' | 'REBU') => {
    try {
      const res = await fetch(`/api/sales/${saleId}/invoice/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceType: type }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data?.error ?? 'Error al generar vista previa.', 'error')
        return
      }
      setPreview(data)
      setPreviewType(type)
    } catch (e) {
      console.error(e)
      showToast('Error al generar vista previa.', 'error')
    }
  }

  const handleIssue = async (type: 'VAT' | 'REBU') => {
    if (issuing) return
    const confirmation = window.confirm(
      `¿Emitir factura ${type === 'VAT' ? 'con IVA' : 'REBU'}?\n\n` +
        'Esta acción consume el siguiente número fiscal del CRM y crea una factura ' +
        'definitiva. Solo se puede revertir desde el módulo de facturación.\n\n' +
        '¿Confirmás?'
    )
    if (!confirmation) return

    setIssuing(true)
    const idempotencyKey = uuidv4()
    try {
      const res = await fetch(`/api/sales/${saleId}/invoice/issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ invoiceType: type }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data?.error ?? 'Error al emitir factura.', 'error')
        return
      }
      if (data.alreadyExisted) {
        showToast(
          `Esta venta ya tenía la factura ${data.invoice.full_invoice_number}.`,
          'info'
        )
      } else {
        showToast(
          `Factura ${data.invoice.full_invoice_number} emitida correctamente.`,
          'success'
        )
      }
      // Feedback inmediato: mostrar la factura al instante (sin esperar el
      // refetch ni el archivado en OneDrive) para que no quede la duda de si se
      // creó. El load() posterior reconcilia con el estado real del servidor.
      if (data.invoice) {
        setInvoices((prev) => [
          data.invoice,
          ...prev.filter((i) => i.id !== data.invoice.id),
        ])
        setJustIssued(data.invoice.full_invoice_number)
      }
      setPreview(null)
      setPreviewType(null)
      await load()
      if (onInvoiceIssued) {
        await onInvoiceIssued()
      }
    } catch (e) {
      console.error(e)
      showToast('Error al emitir factura.', 'error')
    } finally {
      setIssuing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
        Cargando facturación…
      </div>
    )
  }

  // Active invoice = anything that's not VOIDED. IMPORTED counts (it's the
  // legacy invoice already emitted externally — don't issue another one).
  const activeInvoices = invoices.filter((i) => i.status !== 'VOIDED')

  if (activeInvoices.length > 0) {
    // Show the existing invoice(s) summary; suppress the "issue" buttons.
    return (
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <ToastContainer />
        {justIssued && (
          <div className="px-4 py-3 bg-green-50 border-b border-green-200 flex items-start justify-between">
            <div className="flex items-center space-x-2 text-green-800">
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-medium">
                ✓ Factura {justIssued} generada correctamente.
              </span>
            </div>
            <button
              onClick={() => setJustIssued(null)}
              className="text-green-600 hover:text-green-800 text-xs font-medium"
            >
              Cerrar
            </button>
          </div>
        )}
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Facturación</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {activeInvoices.map((inv) => (
            <div
              key={inv.id}
              className="px-4 py-3 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <Link
                    href={`/facturacion/${inv.id}`}
                    className="text-sm font-semibold text-primary-700 hover:underline"
                  >
                    {inv.full_invoice_number}
                  </Link>
                  <InvoiceTypeBadge type={inv.invoice_type} />
                  <InvoiceStatusBadge status={inv.status} />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Emitida el {formatDate(inv.invoice_date)} · Total{' '}
                  {formatEUR(inv.total_amount)}
                </div>
              </div>
              <div className="flex space-x-2 ml-4">
                {inv.pdf_url ? (
                  <button
                    onClick={() => handleDownload(inv)}
                    disabled={downloadingId === inv.id}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {downloadingId === inv.id ? 'Descargando…' : 'Descargar PDF'}
                  </button>
                ) : null}
                <Link
                  href={`/facturacion/${inv.id}`}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200"
                >
                  Ver detalle
                </Link>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          Para emitir una factura rectificativa o anular, abrí el detalle.
        </div>
      </div>
    )
  }

  // No invoice in the new system. If a legacy Deal.factura value exists, surface
  // it as a soft warning.
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <ToastContainer />
      {issuing && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 flex items-center space-x-2 text-blue-800">
          <svg
            className="w-5 h-5 animate-spin flex-shrink-0"
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
          <span className="text-sm font-medium">
            Generando la factura y el PDF… puede tardar unos segundos, no cierres
            la página.
          </span>
        </div>
      )}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Facturación</h3>
        <Link
          href="/facturacion/historial"
          className="text-xs text-primary-700 hover:underline"
        >
          Abrir Facturación →
        </Link>
      </div>
      <div className="p-4 space-y-4">
        {legacyFacturaName && (
          <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs rounded p-3">
            <strong>Factura legacy detectada:</strong> {legacyFacturaName}{' '}
            {legacyFacturaDate && `(${formatDate(legacyFacturaDate)})`}.
            <br />
            Esta venta ya tiene un número de factura asignado fuera del módulo
            actual. Si volvés a emitir desde acá, vas a consumir un nuevo número
            fiscal. Si la legacy ya está cerrada con el gestor, no la vuelvas a
            emitir.
          </div>
        )}

        {preview && previewType ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-yellow-800 font-medium">
                  Vista previa — {previewType === 'VAT' ? 'IVA' : 'REBU'}
                </span>
                <h4 className="text-base font-semibold text-yellow-900">
                  Próxima factura: {preview.fullInvoiceNumber}
                </h4>
                <p className="text-xs text-yellow-800 mt-1">
                  Este número aún <strong>no fue consumido</strong>. Otra
                  emisión simultánea podría usarlo antes que vos.
                </p>
              </div>
            </div>
            <div className="text-sm text-yellow-900">
              <div>Total: {formatEUR(preview.amounts.total_amount)}</div>
              {previewType === 'VAT' && (
                <>
                  <div>
                    Base imponible: {formatEUR(preview.amounts.taxable_base)}
                  </div>
                  <div>
                    IVA ({preview.amounts.vat_rate}%):{' '}
                    {formatEUR(preview.amounts.vat_amount)}
                  </div>
                </>
              )}
            </div>
            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => handleIssue(previewType)}
                disabled={issuing}
                className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:opacity-50"
              >
                {issuing
                  ? 'Emitiendo…'
                  : `Emitir factura ${previewType === 'VAT' ? 'IVA' : 'REBU'} (consume número)`}
              </button>
              <button
                onClick={() => {
                  setPreview(null)
                  setPreviewType(null)
                }}
                disabled={issuing}
                className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-300 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-gray-200 rounded p-3">
              <h4 className="text-sm font-semibold text-gray-900">
                Factura con IVA
              </h4>
              <p className="text-xs text-gray-600 mt-1 mb-3">
                Para ventas estándar con desglose de IVA.
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={() => handlePreview('VAT')}
                  disabled={issuing}
                  className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-800 text-xs font-medium rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  Vista previa
                </button>
                <button
                  onClick={() => handleIssue('VAT')}
                  disabled={issuing}
                  className="flex-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {issuing ? 'Emitiendo…' : 'Emitir IVA'}
                </button>
              </div>
            </div>
            <div className="border border-gray-200 rounded p-3">
              <h4 className="text-sm font-semibold text-gray-900">
                Factura REBU
              </h4>
              <p className="text-xs text-gray-600 mt-1 mb-3">
                Régimen Especial de Bienes Usados — sin desglose de IVA.
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={() => handlePreview('REBU')}
                  disabled={issuing}
                  className="flex-1 px-3 py-1.5 bg-gray-100 text-gray-800 text-xs font-medium rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  Vista previa
                </button>
                <button
                  onClick={() => handleIssue('REBU')}
                  disabled={issuing}
                  className="flex-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {issuing ? 'Emitiendo…' : 'Emitir REBU'}
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500">
          <strong>Vista previa</strong> no consume número fiscal. <strong>Emitir</strong>{' '}
          consume el siguiente número de la serie correspondiente
          (R-2026-XXX para REBU, F-2026-XXXX para IVA) y crea una factura definitiva.
        </p>
      </div>
    </div>
  )
}
