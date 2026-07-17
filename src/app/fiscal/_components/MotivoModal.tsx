'use client'

/**
 * Pide el motivo de una acción que la API sólo acepta justificada (force en un
 * registro inmutable / con NIF inválido, anulación).
 *
 * No se usa `ConfirmModal` porque ese confirma un sí/no y acá el texto ES el
 * dato: la API rechaza el motivo vacío y ese motivo es lo único que explica,
 * meses después, por qué alguien pisó una factura ya declarada.
 */

import { useEffect, useState } from 'react'

export interface MotivoPeticion {
  titulo: string
  mensaje: string
  onConfirm: (motivo: string) => void | Promise<void>
}

export default function MotivoModal({
  peticion,
  onClose,
  isLoading = false,
}: {
  peticion: MotivoPeticion
  onClose: () => void
  isLoading?: boolean
}) {
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [])

  async function confirmar() {
    if (!motivo.trim()) return
    await peticion.onConfirm(motivo.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-4 space-y-3"
        role="dialog"
        aria-modal="true"
        aria-labelledby="motivo-titulo"
      >
        <h3 id="motivo-titulo" className="text-base font-semibold text-gray-900">
          {peticion.titulo}
        </h3>
        {peticion.mensaje && <p className="text-sm text-gray-600">{peticion.mensaje}</p>}

        <div>
          <label
            htmlFor="motivo-input"
            className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1"
          >
            Motivo (obligatorio)
          </label>
          <textarea
            id="motivo-input"
            rows={3}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué se hace este cambio"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={isLoading || !motivo.trim()}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Procesando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
