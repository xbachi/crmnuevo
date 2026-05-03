'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface Props {
  isOpen: boolean
  invoiceId: number
  currentSeries: string
  currentNumber: number
  currentFull: string
  onClose: () => void
  onSaved: (advisory: string | null) => void
}

export default function CorrectNumberModal({
  isOpen,
  invoiceId,
  currentSeries,
  currentNumber,
  currentFull,
  onClose,
  onSaved,
}: Props) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [newSeries, setNewSeries] = useState(currentSeries)
  const [newNumber, setNewNumber] = useState<number>(currentNumber)
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setNewSeries(currentSeries)
      setNewNumber(currentNumber)
      setReason('')
      setAcknowledged(false)
      setError(null)
    }
  }, [isOpen, currentSeries, currentNumber])

  if (!isOpen) return null

  const previewNew = `${newSeries}-${String(newNumber).padStart(currentFull.length - currentSeries.length - 1, '0')}`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) {
      setError('Solo admin puede corregir números.')
      return
    }
    if (!newSeries.trim()) {
      setError('La nueva serie no puede estar vacía.')
      return
    }
    if (!Number.isInteger(newNumber) || newNumber < 1) {
      setError('El nuevo número debe ser un entero >= 1.')
      return
    }
    if (reason.trim().length < 3) {
      setError('Indicá un motivo (mínimo 3 caracteres).')
      return
    }
    if (!acknowledged) {
      setError('Tenés que confirmar que entendés las implicancias contables.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/correct-number`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_series: newSeries.trim(),
          new_number: newNumber,
          reason: reason.trim(),
          userId: user?.username ?? null,
          userRole: user?.role ?? null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Error al corregir número.')
        return
      }
      onSaved(data?.advisory ?? null)
      onClose()
    } catch {
      setError('Error de red al corregir número.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg p-6 max-w-lg w-full mx-4"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          Corregir número de factura
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Esta acción modifica una factura ya emitida. Solo se debe usar para
          corregir errores reales y bajo justificación contable.
        </p>

        {!isAdmin && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded p-3">
            Solo usuarios con rol <code>admin</code> pueden corregir números de
            factura.
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-700 mb-4">
          <div>
            <strong>Número actual:</strong> {currentFull}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Serie <code>{currentSeries}</code> · Número{' '}
            <code>{currentNumber}</code>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Nueva serie <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={newSeries}
                onChange={(e) => setNewSeries(e.target.value)}
                disabled={!isAdmin || submitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Nuevo número <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={newNumber}
                onChange={(e) => setNewNumber(parseInt(e.target.value, 10) || 0)}
                disabled={!isAdmin || submitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono disabled:bg-gray-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Vista previa nuevo número
            </label>
            <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded text-sm font-mono">
              {previewNew}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Motivo de la corrección <span className="text-red-600">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ej: Salto de numeración por anulación previa / error en serie..."
              disabled={!isAdmin || submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
            />
          </div>

          <label className="flex items-start text-sm text-gray-700">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={!isAdmin || submitting}
              className="mt-1 mr-2"
            />
            <span>
              Entiendo que modificar una factura emitida puede afectar la
              correlatividad y debe estar justificado contablemente.
            </span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!isAdmin || submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:bg-gray-400"
          >
            {submitting ? 'Aplicando…' : 'Corregir número'}
          </button>
        </div>
      </form>
    </div>
  )
}
