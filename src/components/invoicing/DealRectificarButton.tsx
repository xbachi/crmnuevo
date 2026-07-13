'use client'

import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import RectificarModal from '@/components/invoicing/RectificarModal'

interface Props {
  invoiceId: number
  invoiceNumber: string
  invoiceType: string
  status: string
  totalAmount: string
  /** Refrescar la lista de facturas del deal después de rectificar. */
  onRectificada: () => void | Promise<void>
}

/**
 * Botón "Rectificar / anular" junto a cada factura activa del deal. Antes esto
 * sólo existía en /facturacion/[id] y nadie lo encontraba. Mismo modal y mismo
 * endpoint (POST /api/invoices/{id}/rectificar, admin) que el detalle: acá sólo
 * se acerca el acceso al sitio donde el usuario está mirando la factura.
 */
export default function DealRectificarButton({
  invoiceId,
  invoiceNumber,
  invoiceType,
  status,
  totalAmount,
  onRectificada,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const { showToast, ToastContainer } = useToast()
  const { isAdmin } = useAuth()

  // Mismas condiciones que /facturacion/[id]: una rectificativa no se rectifica,
  // una ya rectificada tampoco (el endpoint devolvería 409).
  const puedeRectificar =
    isAdmin &&
    invoiceType !== 'RECTIFYING' &&
    status !== 'RECTIFIED' &&
    ['ISSUED', 'PDF_PENDING', 'IMPORTED'].includes(status)

  if (!puedeRectificar) return null

  const handleConfirm = async (motivo: string) => {
    const res = await fetch(`/api/invoices/${invoiceId}/rectificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error ?? 'Error al rectificar la factura.')
    showToast(
      `Rectificativa ${data?.rectificativa?.full_invoice_number ?? ''} emitida. ${invoiceNumber} queda anulada.`,
      'success'
    )
    await onRectificada()
  }

  return (
    <>
      <ToastContainer />
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 bg-white text-red-700 text-xs font-medium rounded border border-red-300 hover:bg-red-50"
      >
        Rectificar / anular
      </button>
      <RectificarModal
        isOpen={isOpen}
        invoiceNumber={invoiceNumber}
        totalAmount={totalAmount}
        onClose={() => setIsOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  )
}
