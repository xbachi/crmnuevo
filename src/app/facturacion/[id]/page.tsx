'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import {
  InvoiceStatusBadge,
  InvoiceTypeBadge,
} from '@/components/invoicing/InvoiceStatusBadge'
import RegeneratePdfModal from '@/components/invoicing/RegeneratePdfModal'
import CorrectNumberModal from '@/components/invoicing/CorrectNumberModal'
import RectificarModal from '@/components/invoicing/RectificarModal'
import { useAuth } from '@/contexts/AuthContext'

interface Invoice {
  id: number
  deal_id: number | null
  vehiculo_id: number | null
  invoice_type: string
  series: string
  number: number
  full_invoice_number: string
  invoice_date: string
  operation_date: string | null
  buyer_name: string
  buyer_nif_cif: string | null
  buyer_email: string | null
  buyer_address: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_plate: string | null
  vehicle_vin: string | null
  vehicle_kms: number | null
  vehicle_year: number | null
  vehicle_sale_price: string
  taxable_base: string | null
  vat_rate: string | null
  vat_amount: string | null
  total_amount: string
  rebu_margin: string | null
  status: string
  rectifies_invoice_id?: number | null
  rectified_by_invoice_id?: number | null
  rectification_reason?: string | null
  pdf_url: string | null
  pdf_generated_at: string | null
  pdf_regenerated_at: string | null
  notes: string | null
  metadata_json: Record<string, unknown> | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

interface AuditLog {
  id: number
  action: string
  old_values_json: Record<string, unknown> | null
  new_values_json: Record<string, unknown> | null
  reason: string | null
  user_id: string | null
  user_role: string | null
  created_at: string
}

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Factura creada',
  NUMBER_CORRECTED: 'Número corregido',
  PDF_REGENERATED: 'PDF regenerado',
  STATUS_CHANGED: 'Estado cambiado',
  DOWNLOADED: 'Descargada',
  IMPORTED: 'Importada (legacy)',
  CONFIG_UPDATED: 'Configuración actualizada',
}

function formatDateTime(d?: string | null) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return d
  }
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

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { showToast } = useToast()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false)
  const [isCorrectOpen, setIsCorrectOpen] = useState(false)
  const [isRectificarOpen, setIsRectificarOpen] = useState(false)
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const load = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/invoices/${id}`)
      if (res.status === 404) {
        setError('Factura no encontrada.')
        return
      }
      if (!res.ok) throw new Error('Error al cargar la factura.')
      const data = await res.json()
      setInvoice(data.invoice)
      setAuditLogs(data.auditLogs ?? [])
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Error al cargar la factura.')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const handleRegenerate = async (reason: string) => {
    if (!invoice) return
    const res = await fetch(`/api/invoices/${invoice.id}/regenerate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error ?? 'Error al regenerar PDF.')
    }
    showToast('PDF regenerado correctamente.', 'success')
    await load()
  }

  const handleRectificar = async (motivo: string) => {
    if (!invoice) return
    const res = await fetch(`/api/invoices/${invoice.id}/rectificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error ?? 'Error al rectificar la factura.')
    }
    showToast(
      `Rectificativa ${data?.rectificativa?.full_invoice_number ?? ''} emitida. ${invoice.full_invoice_number} queda anulada.`,
      'success'
    )
    await load()
  }

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
        Cargando…
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-sm text-red-600 mb-4">
          {error ?? 'Factura no encontrada.'}
        </p>
        <Link
          href="/facturacion/historial"
          className="text-sm text-primary-700 hover:underline"
        >
          Volver al historial
        </Link>
      </div>
    )
  }

  const isImported = invoice.status === 'IMPORTED'
  const isRectificativa = invoice.invoice_type === 'RECTIFYING'
  const isRectificada = invoice.status === 'RECTIFIED'
  const canDownload = !!invoice.pdf_url
  const canRegenerate = !isImported && !isRectificativa
  // Una rectificativa no se rectifica; una ya rectificada tampoco (409 igual).
  const canRectificar =
    isAdmin &&
    !isRectificativa &&
    !isRectificada &&
    ['ISSUED', 'PDF_PENDING', 'IMPORTED'].includes(invoice.status)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/facturacion/historial"
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            ← Volver al historial
          </Link>
          <h2 className="text-2xl font-semibold text-gray-900 mt-1">
            {invoice.full_invoice_number}
          </h2>
          <div className="flex items-center space-x-2 mt-2">
            <InvoiceTypeBadge type={invoice.invoice_type} />
            <InvoiceStatusBadge status={invoice.status} />
            <span className="text-sm text-gray-500">
              Emitida el {formatDate(invoice.invoice_date)}
            </span>
          </div>
        </div>
        <div className="flex space-x-2">
          {canDownload ? (
            <a
              href={`/api/invoices/${invoice.id}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700"
            >
              Descargar PDF
            </a>
          ) : (
            <span className="px-4 py-2 bg-gray-100 text-gray-400 text-sm rounded-md cursor-not-allowed">
              PDF no disponible
            </span>
          )}
          {canRegenerate && (
            <button
              onClick={() => setIsRegenerateOpen(true)}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-md hover:bg-primary-700"
            >
              Regenerar PDF
            </button>
          )}
          {canRectificar && (
            <button
              onClick={() => setIsRectificarOpen(true)}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700"
              title="Emitir una rectificativa que anula esta factura (admin)"
            >
              Rectificar / anular factura
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setIsCorrectOpen(true)}
              className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 text-sm font-medium rounded-md hover:bg-red-100"
              title="Corregir el número de esta factura (admin)"
            >
              Corregir número
            </button>
          )}
        </div>
      </div>

      {isRectificada && (
        <div className="bg-purple-50 border border-purple-200 rounded-md p-4 text-sm text-purple-900">
          <strong>Factura rectificada (anulada).</strong> Se emitió una factura
          rectificativa que la anula por el mismo importe en negativo. Esta
          factura conserva su número — no se borra, para no dejar huecos en la
          numeración — pero ya no cuenta como venta.
          {invoice.rectified_by_invoice_id && (
            <>
              {' '}
              <Link
                href={`/facturacion/${invoice.rectified_by_invoice_id}`}
                className="underline font-medium"
              >
                Ver la rectificativa →
              </Link>
            </>
          )}
        </div>
      )}

      {isRectificativa && (
        <div className="bg-purple-50 border border-purple-200 rounded-md p-4 text-sm text-purple-900">
          <strong>Factura rectificativa.</strong> Anula por el importe en
          negativo a la factura original.
          {invoice.rectifies_invoice_id && (
            <>
              {' '}
              <Link
                href={`/facturacion/${invoice.rectifies_invoice_id}`}
                className="underline font-medium"
              >
                Ver la factura rectificada →
              </Link>
            </>
          )}
          {invoice.rectification_reason && (
            <p className="mt-1 italic">Motivo: {invoice.rectification_reason}</p>
          )}
        </div>
      )}

      {isImported && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800">
          <strong>Factura importada (legacy).</strong> Esta factura fue migrada
          desde el campo <code>Deal.factura</code> en el momento de la
          instalación del módulo. No tiene PDF descargable porque los datos
          originales no están disponibles. Si necesitás el PDF, generalo desde
          el sistema externo donde se emitió originalmente.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Comprador (snapshot)">
          <Field label="Nombre" value={invoice.buyer_name} />
          <Field label="NIF/CIF" value={invoice.buyer_nif_cif} />
          <Field label="Email" value={invoice.buyer_email} />
          <Field label="Dirección" value={invoice.buyer_address} />
        </Section>
        <Section title="Vehículo (snapshot)">
          <Field
            label="Marca / Modelo"
            value={
              [invoice.vehicle_make, invoice.vehicle_model]
                .filter(Boolean)
                .join(' ') || null
            }
          />
          <Field label="Matrícula" value={invoice.vehicle_plate} />
          <Field label="Bastidor" value={invoice.vehicle_vin} />
          <Field
            label="Kilómetros"
            value={
              invoice.vehicle_kms != null
                ? invoice.vehicle_kms.toLocaleString('es-ES') + ' km'
                : null
            }
          />
          <Field label="Año" value={invoice.vehicle_year} />
          {invoice.vehiculo_id && (
            <p className="text-xs text-gray-500 mt-2">
              <Link
                href={`/vehiculos/${invoice.vehiculo_id}`}
                className="text-primary-700 hover:underline"
              >
                Ver vehículo en CRM →
              </Link>
            </p>
          )}
        </Section>
      </div>

      <Section title="Importes">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Precio venta" value={formatEUR(invoice.vehicle_sale_price)} />
          {invoice.taxable_base != null ? (
            <>
              <Field
                label="Base imponible"
                value={formatEUR(invoice.taxable_base)}
              />
              <Field label="Tipo IVA" value={invoice.vat_rate ? `${invoice.vat_rate}%` : null} />
              <Field label="IVA" value={formatEUR(invoice.vat_amount)} />
            </>
          ) : (
            <Field
              label="Régimen"
              value="REBU — sin desglose de IVA en factura"
            />
          )}
          <div className="col-span-2 pt-3 mt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">
                Total factura
              </span>
              <span className="text-2xl font-bold text-gray-900">
                {formatEUR(invoice.total_amount)}
              </span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Trazabilidad">
        <Field label="ID en sistema" value={`#${invoice.id}`} />
        <Field label="Serie" value={invoice.series} />
        <Field label="Número" value={invoice.number} />
        <Field label="Creada" value={formatDateTime(invoice.created_at)} />
        <Field
          label="Última actualización"
          value={formatDateTime(invoice.updated_at)}
        />
        <Field
          label="PDF generado"
          value={formatDateTime(invoice.pdf_generated_at)}
        />
        <Field
          label="PDF regenerado"
          value={formatDateTime(invoice.pdf_regenerated_at)}
        />
        {invoice.deal_id && (
          <p className="text-xs text-gray-500 mt-2">
            <Link
              href={`/deals/${invoice.deal_id}`}
              className="text-primary-700 hover:underline"
            >
              Ver venta (deal) #{invoice.deal_id} →
            </Link>
          </p>
        )}
        {invoice.notes && (
          <div className="mt-3">
            <span className="block text-xs font-medium text-gray-500">
              Notas
            </span>
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {invoice.notes}
            </p>
          </div>
        )}
      </Section>

      <Section title={`Historial de auditoría (${auditLogs.length})`}>
        {auditLogs.length === 0 ? (
          <p className="text-sm text-gray-500">Sin eventos registrados.</p>
        ) : (
          <ul className="space-y-3">
            {auditLogs.map((log) => (
              <li
                key={log.id}
                className="border-l-2 border-gray-200 pl-3 py-1"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDateTime(log.created_at)}
                  </span>
                </div>
                {log.reason && (
                  <p className="text-xs text-gray-700 mt-1 italic">
                    Motivo: {log.reason}
                  </p>
                )}
                {(log.old_values_json || log.new_values_json) && (
                  <details className="mt-1">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                      Ver detalle del cambio
                    </summary>
                    <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-x-auto">
                      {JSON.stringify(
                        {
                          old: log.old_values_json,
                          new: log.new_values_json,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                )}
                {log.user_id && (
                  <p className="text-xs text-gray-400 mt-1">
                    Por: {log.user_id}
                    {log.user_role ? ` (${log.user_role})` : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <RegeneratePdfModal
        isOpen={isRegenerateOpen}
        invoiceNumber={invoice.full_invoice_number}
        onClose={() => setIsRegenerateOpen(false)}
        onConfirm={handleRegenerate}
      />

      <RectificarModal
        isOpen={isRectificarOpen}
        invoiceNumber={invoice.full_invoice_number}
        totalAmount={invoice.total_amount}
        onClose={() => setIsRectificarOpen(false)}
        onConfirm={handleRectificar}
      />

      <CorrectNumberModal
        isOpen={isCorrectOpen}
        invoiceId={invoice.id}
        currentSeries={invoice.series}
        currentNumber={invoice.number}
        currentFull={invoice.full_invoice_number}
        onClose={() => setIsCorrectOpen(false)}
        onSaved={(advisory) => {
          showToast('Número corregido correctamente.', 'success')
          if (advisory) {
            setTimeout(() => showToast(advisory, 'info'), 800)
          }
          load()
        }}
      />
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Field({
  label,
  value,
}: {
  label: string
  value: string | number | null | undefined
}) {
  return (
    <div className="mb-2">
      <span className="block text-xs font-medium text-gray-500">{label}</span>
      <span className="block text-sm text-gray-900">
        {value === null || value === undefined || value === '' ? '—' : value}
      </span>
    </div>
  )
}
