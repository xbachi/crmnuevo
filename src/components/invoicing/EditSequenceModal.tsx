'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface Sequence {
  id: number
  invoice_type: string
  series: string
  next_number: number
  number_format: string
  is_active: boolean
}

interface Props {
  isOpen: boolean
  sequence: Sequence | null
  onClose: () => void
  onSaved: () => void
}

export default function EditSequenceModal({
  isOpen,
  sequence,
  onClose,
  onSaved,
}: Props) {
  const { user } = useAuth()
  const [nextNumber, setNextNumber] = useState<number>(0)
  const [numberFormat, setNumberFormat] = useState('%03d')
  const [isActive, setIsActive] = useState(true)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (sequence) {
      setNextNumber(sequence.next_number)
      setNumberFormat(sequence.number_format)
      setIsActive(sequence.is_active)
      setReason('')
      setError(null)
    }
  }, [sequence])

  if (!isOpen || !sequence) return null

  const isAdmin = user?.role === 'admin'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) {
      setError('Solo los usuarios admin pueden editar series.')
      return
    }
    if (reason.trim().length < 3) {
      setError('Indica un motivo (mínimo 3 caracteres).')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/invoice-sequences/${sequence.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          next_number: nextNumber,
          number_format: numberFormat,
          is_active: isActive,
          reason: reason.trim(),
          userId: user?.username ?? null,
          userRole: user?.role ?? null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Error al actualizar la serie.')
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Error de red al actualizar la serie.')
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
          Editar serie {sequence.invoice_type} / {sequence.series}
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Cambiar la numeración o el formato de una serie afecta directamente a la
          emisión fiscal. Cualquier cambio queda auditado.
        </p>

        {!isAdmin && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded p-3">
            Solo usuarios con rol <code>admin</code> pueden editar series.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              next_number — el próximo número a emitir
            </label>
            <input
              type="number"
              min={1}
              value={nextNumber}
              onChange={(e) => setNextNumber(parseInt(e.target.value, 10) || 0)}
              disabled={!isAdmin || submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
            />
            <p className="text-xs text-gray-500 mt-1">
              No se puede poner por debajo del número más alto ya emitido en
              esta serie.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              number_format
            </label>
            <input
              type="text"
              value={numberFormat}
              onChange={(e) => setNumberFormat(e.target.value)}
              placeholder="%03d, %04d..."
              disabled={!isAdmin || submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
            />
            <p className="text-xs text-gray-500 mt-1">
              <code>%03d</code> = 3 dígitos con ceros (023). <code>%04d</code> = 4
              dígitos (0023). Si el número supera el padding, se imprime sin
              truncar.
            </p>
          </div>
          <div>
            <label className="flex items-center text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={!isAdmin || submitting}
                className="mr-2"
              />
              Serie activa (disponible para emitir nuevas facturas)
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Motivo del cambio <span className="text-red-600">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Ej: Saltar al 24 porque hubo una emisión externa..."
              disabled={!isAdmin || submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
            />
          </div>
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
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:bg-gray-400"
          >
            {submitting ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}
