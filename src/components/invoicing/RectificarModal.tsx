'use client'

import { useState } from 'react'

interface Props {
  isOpen: boolean
  invoiceNumber: string
  totalAmount: string
  onClose: () => void
  /** Debe lanzar Error con el mensaje del backend si falla. */
  onConfirm: (motivo: string) => Promise<void>
}

function formatEUR(amount: string | number) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

/**
 * Rectificar / anular una factura emitida. Pide motivo obligatorio y explica
 * exactamente qué va a pasar: se emite una FR por el importe en negativo y la
 * original queda anulada PERO conserva su número (no se borra: los huecos de
 * numeración son un problema fiscal).
 */
export default function RectificarModal({
  isOpen,
  invoiceNumber,
  totalAmount,
  onClose,
  onConfirm,
}: Props) {
  const [motivo, setMotivo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const negativo = -Math.abs(parseFloat(totalAmount) || 0)
  const motivoValido = motivo.trim().length >= 3

  const handleConfirm = async () => {
    if (!motivoValido || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      await onConfirm(motivo.trim())
      setMotivo('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al rectificar la factura.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">
            Rectificar / anular {invoiceNumber}
          </h3>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
            <p className="font-medium mb-1">Qué va a pasar:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                Se emite una <strong>factura rectificativa</strong> de la serie{' '}
                <strong>FR</strong> por <strong>{formatEUR(negativo)}</strong>{' '}
                (importe en negativo), que referencia a {invoiceNumber}.
              </li>
              <li>
                La factura original <strong>queda anulada pero conserva su
                número</strong>: no se borra. Las dos aparecen en el libro de la
                gestoría y netean a cero.
              </li>
              <li>
                Deja de contar como venta en comisiones y en el chequeo de
                expedientes. La venta puede volver a facturarse correctamente.
              </li>
            </ul>
          </div>

          <div>
            <label
              htmlFor="motivo-rectificacion"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Motivo de la rectificación <span className="text-red-600">*</span>
            </label>
            <textarea
              id="motivo-rectificacion"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: factura duplicada — el mismo coche se facturó también en R-2026-024"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Queda registrado en la rectificativa y en el historial de
              auditoría. Mínimo 3 caracteres.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end space-x-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!motivoValido || isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Emitiendo…' : 'Emitir rectificativa y anular'}
          </button>
        </div>
      </div>
    </div>
  )
}
