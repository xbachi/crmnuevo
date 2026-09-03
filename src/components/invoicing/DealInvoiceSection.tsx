'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import {
  InvoiceStatusBadge,
  InvoiceTypeBadge,
} from '@/components/invoicing/InvoiceStatusBadge'
import DealRectificarButton from '@/components/invoicing/DealRectificarButton'
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

/** Coherencia entre el régimen elegido y cómo se compró el coche (origenCompra). */
interface AvisoRegimen {
  code: 'REGIMEN_INCOHERENTE' | 'ORIGEN_NO_VERIFICADO'
  severidad: 'bloqueante' | 'aviso'
  message: string
  ivaGeneral: number
  ivaRebu: number | null
  diferencia: number | null
  precioCompra: number | null
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
  avisoRegimen: AvisoRegimen | null
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
  /** Factura recién emitida en esta sesión. Se conserva aparte de `invoices`
   *  para que el refetch NO la pise si el listado del servidor todavía no la
   *  devuelve (réplica/caché): el usuario tiene que verla al instante. */
  const [justIssued, setJustIssued] = useState<Invoice | null>(null)
  const [bannerClosed, setBannerClosed] = useState(false)
  /** Coche ya facturado en otra venta: mensaje del servidor + tipo pendiente,
   *  para poder forzar la emisión con allowDuplicate tras confirmación. */
  const [dupConflict, setDupConflict] = useState<{
    message: string
    type: 'VAT' | 'REBU'
  } | null>(null)
  /** Coche comprado a un particular al que se le quiere emitir IVA: mensaje del
   *  servidor con el coste real del error + tipo pendiente, para poder forzar
   *  con allowRegimen tras confirmación explícita. */
  const [regimenConflict, setRegimenConflict] = useState<{
    message: string
    type: 'VAT' | 'REBU'
    diferencia: number | null
  } | null>(null)

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

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true)
      try {
        const res = await fetch(`/api/invoices?dealId=${saleId}&pageSize=10`, {
          cache: 'no-store',
        })
        if (res.ok) {
          const data = await res.json()
          setInvoices(data.rows ?? [])
        }
      } catch (e) {
        console.error('[DealInvoiceSection] load', e)
      } finally {
        if (!silent) setIsLoading(false)
      }
    },
    [saleId]
  )

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

  // Facturas que se listan (todo lo que no está anulado). Una RECTIFIED sigue
  // en el histórico, pero NO bloquea: su abono (FR) la dejó sin efecto y la
  // venta se puede volver a facturar. Un abono (invoice_type RECTIFYING)
  // tampoco bloquea — no es una factura de venta.
  const knownInvoices =
    justIssued && !invoices.some((i) => i.id === justIssued.id)
      ? [justIssued, ...invoices]
      : invoices
  const listedInvoices = knownInvoices.filter((i) => i.status !== 'VOIDED')
  const hasActiveInvoice = listedInvoices.some(
    (i) => i.status !== 'RECTIFIED' && i.invoice_type !== 'RECTIFYING'
  )
  const activeInvoice = listedInvoices.find(
    (i) => i.status !== 'RECTIFIED' && i.invoice_type !== 'RECTIFYING'
  )

  const handleIssue = async (
    type: 'VAT' | 'REBU',
    opts: { allowDuplicate?: boolean; allowRegimen?: boolean } = {}
  ) => {
    if (issuing) return
    if (hasActiveInvoice) return // ya facturado: no se re-emite, se rectifica

    if (!opts.allowDuplicate && !opts.allowRegimen) {
      const confirmation = window.confirm(
        `¿Emitir factura ${type === 'VAT' ? 'con IVA' : 'REBU'}?\n\n` +
          'Esta acción consume el siguiente número fiscal del CRM y crea una factura ' +
          'definitiva. Solo se puede revertir desde el módulo de facturación.\n\n' +
          '¿Confirmás?'
      )
      if (!confirmation) return
    }

    setIssuing(true)
    setDupConflict(null)
    setRegimenConflict(null)
    const idempotencyKey = uuidv4()
    try {
      const res = await fetch(`/api/sales/${saleId}/invoice/issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          invoiceType: type,
          ...(opts.allowDuplicate ? { allowDuplicate: true } : {}),
          ...(opts.allowRegimen ? { allowRegimen: true } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // El coche ya está facturado en OTRA venta: mostramos el mensaje del
        // servidor tal cual y ofrecemos forzar (duplicación fiscal consciente).
        if (data?.code === 'VEHICLE_ALREADY_INVOICED') {
          setDupConflict({
            message:
              data.error ?? 'Este coche ya está facturado en otra venta.',
            type,
          })
          return
        }
        // Comprado a un particular (contrato, sin factura) y se pidió IVA: el
        // servidor bloqueó y nos dice cuánto IVA de más costaría.
        if (data?.code === 'REGIMEN_INCOHERENTE') {
          setRegimenConflict({
            message:
              data.error ??
              'El régimen no coincide con el origen de la compra.',
            type,
            diferencia: data?.regimen?.diferencia ?? null,
          })
          return
        }
        showToast(data?.error ?? 'Error al emitir factura.', 'error')
        return
      }
      if (data.avisoRegimen) {
        showToast(data.avisoRegimen.message, 'info')
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
        setJustIssued(data.invoice)
        setBannerClosed(false)
      }
      setPreview(null)
      setPreviewType(null)
      setDupConflict(null)
      setRegimenConflict(null)
      if (onInvoiceIssued) {
        await onInvoiceIssued()
      }
    } catch (e) {
      console.error(e)
      showToast(
        'Error de red al emitir la factura. Puede que se haya emitido igual: ' +
          'revisá abajo antes de reintentar.',
        'error'
      )
    } finally {
      // Reconciliamos SIEMPRE con el servidor (también tras un error o un
      // timeout): si la factura se creó, los botones quedan bloqueados y no se
      // puede emitir una segunda por reintento manual.
      await load(true)
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

  if (hasActiveInvoice) {
    // Ya facturado: los botones de emisión quedan deshabilitados de forma
    // PERMANENTE (no solo durante el request). Para cambiar la factura hay que
    // rectificar desde el detalle.
    return (
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <ToastContainer />
        {justIssued && !bannerClosed && (
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
                ✓ Factura {justIssued.full_invoice_number} generada
                correctamente.
              </span>
            </div>
            <button
              onClick={() => setBannerClosed(true)}
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
          {listedInvoices.map((inv) => (
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
                    {downloadingId === inv.id
                      ? 'Descargando…'
                      : 'Descargar PDF'}
                  </button>
                ) : null}
                <DealRectificarButton
                  invoiceId={inv.id}
                  invoiceNumber={inv.full_invoice_number}
                  invoiceType={inv.invoice_type}
                  status={inv.status}
                  totalAmount={inv.total_amount}
                  onRectificada={load}
                />
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
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 space-y-2">
          <div className="flex space-x-2">
            <button
              type="button"
              disabled
              title="Esta venta ya está facturada"
              className="px-3 py-1.5 bg-gray-200 text-gray-500 text-xs font-medium rounded cursor-not-allowed"
            >
              Emitir IVA
            </button>
            <button
              type="button"
              disabled
              title="Esta venta ya está facturada"
              className="px-3 py-1.5 bg-gray-200 text-gray-500 text-xs font-medium rounded cursor-not-allowed"
            >
              Emitir REBU
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Esta venta <strong>ya está facturada</strong>
            {activeInvoice ? ` (${activeInvoice.full_invoice_number})` : ''}. No
            se puede volver a emitir: para cambiarla hay que rectificarla con el
            botón de arriba, que emite una factura rectificativa (serie FR) y
            deja la original anulada conservando su número.
          </p>
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
            Emitiendo… (puede tardar unos segundos). Se está generando la
            factura y el PDF, no cierres la página.
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

        {listedInvoices.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded p-3">
            Esta venta tuvo factura (
            {listedInvoices.map((i) => i.full_invoice_number).join(', ')}
            ), rectificada o anulada. Podés emitir una nueva: consumirá un
            número fiscal nuevo.
          </div>
        )}

        {dupConflict && (
          <div className="bg-red-50 border-2 border-red-400 rounded p-3 space-y-2">
            <p className="text-sm font-semibold text-red-900">
              Coche ya facturado — riesgo de duplicación fiscal
            </p>
            <p className="text-xs text-red-800">{dupConflict.message}</p>
            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => {
                  const ok = window.confirm(
                    `${dupConflict.message}\n\n` +
                      'Si emitís igual, el mismo coche va a quedar con DOS facturas de ' +
                      'venta activas (duplicación fiscal). Solo seguí si es una reventa ' +
                      'real del mismo vehículo.\n\n¿Emitir igualmente?'
                  )
                  if (ok)
                    handleIssue(dupConflict.type, { allowDuplicate: true })
                }}
                disabled={issuing}
                className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:opacity-50"
              >
                {issuing
                  ? 'Emitiendo…'
                  : 'Emitir igualmente (duplicación fiscal)'}
              </button>
              <button
                onClick={() => setDupConflict(null)}
                disabled={issuing}
                className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-300 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {regimenConflict && (
          <div className="bg-red-50 border-2 border-red-400 rounded p-3 space-y-2">
            <p className="text-sm font-semibold text-red-900">
              Régimen incorrecto — este coche se compró a un particular
              {regimenConflict.diferencia != null
                ? ` (${formatEUR(regimenConflict.diferencia)} de IVA de más)`
                : ''}
            </p>
            <p className="text-xs text-red-800">{regimenConflict.message}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => handleIssue('REBU')}
                disabled={issuing}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-50"
              >
                {issuing ? 'Emitiendo…' : 'Emitir REBU (lo correcto)'}
              </button>
              <button
                onClick={() => {
                  const ok = window.confirm(
                    `${regimenConflict.message}\n\n` +
                      'Si emitís con IVA igual, vas a ingresar IVA sobre el precio TOTAL ' +
                      'del coche' +
                      (regimenConflict.diferencia != null
                        ? ` (${formatEUR(regimenConflict.diferencia)} de más)`
                        : '') +
                      '. Solo seguí si la operación va en régimen general a conciencia.' +
                      '\n\n¿Emitir con IVA igualmente?'
                  )
                  if (ok)
                    handleIssue(regimenConflict.type, { allowRegimen: true })
                }}
                disabled={issuing}
                className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:opacity-50"
              >
                Emitir con IVA igualmente (pagás IVA de más)
              </button>
              <button
                onClick={() => setRegimenConflict(null)}
                disabled={issuing}
                className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-300 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
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
            {preview.avisoRegimen && (
              <div
                className={`rounded p-2 text-xs ${
                  preview.avisoRegimen.severidad === 'bloqueante'
                    ? 'bg-red-50 border-2 border-red-400 text-red-900'
                    : 'bg-orange-50 border border-orange-300 text-orange-900'
                }`}
              >
                <strong>
                  {preview.avisoRegimen.severidad === 'bloqueante'
                    ? 'Régimen incorrecto: '
                    : 'Origen de la compra sin verificar: '}
                </strong>
                {preview.avisoRegimen.message}
              </div>
            )}
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
          <strong>Vista previa</strong> no consume número fiscal.{' '}
          <strong>Emitir</strong> consume el siguiente número de la serie
          correspondiente (R-2026-XXX para REBU, F-2026-XXXX para IVA) y crea
          una factura definitiva.
        </p>
      </div>
    </div>
  )
}
