'use client'

import { useState } from 'react'

interface Props {
  isOpen: boolean
  invoiceNumber: string
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

export default function RegeneratePdfModal({
  isOpen,
  invoiceNumber,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleConfirm = async () => {
    if (reason.trim().length < 3) {
      setError('Indicá un motivo (mínimo 3 caracteres).')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm(reason.trim())
      setReason('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al regenerar PDF.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Regenerar PDF
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Vas a regenerar el PDF de la factura{' '}
          <strong className="text-gray-900">{invoiceNumber}</strong>. Esta acción{' '}
          <strong>no cambia el número de factura</strong> ni los importes — solo
          vuelve a renderizar el PDF con los datos guardados.
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Motivo de la regeneración <span className="text-red-600">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Ej: PDF no se pudo descargar / cliente solicita reimpresión / cambio de plantilla..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          disabled={submitting}
        />
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          El motivo queda registrado en el historial de auditoría de esta
          factura.
        </p>

        <div className="flex justify-end space-x-2 mt-4">
          <button
            onClick={() => {
              setReason('')
              setError(null)
              onClose()
            }}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting ? 'Regenerando…' : 'Regenerar PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
