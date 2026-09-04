'use client'

/**
 * Modal de condiciones de pago obligatorias antes de generar el contrato de
 * venta. Ningún contrato de venta se genera sin capturar: forma de pago,
 * datos de la financiación (si aplica) y garantía premium (elección
 * explícita, sin default). La validación dura vive en
 * src/lib/ventaCondicionesPago.ts y el server la repite.
 */

import { useState } from 'react'
import {
  BANCOS_SUGERIDOS,
  validarCondicionesPago,
  type CondicionesPago,
} from '@/lib/ventaCondicionesPago'
import type { FormaPago } from '@/lib/comisiones'

interface Props {
  precioVenta: number
  isSubmitting: boolean
  onConfirm: (condiciones: CondicionesPago) => void
  onClose: () => void
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export default function CondicionesPagoModal({
  precioVenta,
  isSubmitting,
  onConfirm,
  onClose,
}: Props) {
  const [formaPago, setFormaPago] = useState<FormaPago | ''>('')
  const [banco, setBanco] = useState('')
  const [interes, setInteres] = useState('')
  const [cuotas, setCuotas] = useState('')
  const [montoFinanciado, setMontoFinanciado] = useState('')
  const [montoContado, setMontoContado] = useState('')
  const [garantiaPremium, setGarantiaPremium] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const esFinanciacion = formaPago === 'financiado' || formaPago === 'mixto'

  const handleFormaPago = (value: FormaPago | '') => {
    setFormaPago(value)
    setError(null)
    if (
      (value === 'financiado' || value === 'mixto') &&
      !montoFinanciado &&
      precioVenta > 0
    ) {
      // Prefill editable con el precio de venta.
      setMontoFinanciado(String(precioVenta))
    }
  }

  const sumaMixto =
    (parseFloat(montoContado) || 0) + (parseFloat(montoFinanciado) || 0)
  const diffMixto = sumaMixto - precioVenta

  const handleSubmit = () => {
    if (!formaPago) {
      setError('Elige la forma de pago')
      return
    }
    if (garantiaPremium === null) {
      setError('Indica si lleva garantía premium (sí o no)')
      return
    }
    const val = validarCondicionesPago(
      {
        formaPago,
        banco,
        interes,
        cuotas,
        montoFinanciado,
        montoContado,
        garantiaPremium,
      },
      precioVenta
    )
    if (!val.ok) {
      setError(val.error)
      return
    }
    setError(null)
    onConfirm(val.data)
  }

  return (
    <div
      data-testid="condiciones-pago-modal"
      className="fixed inset-0 bg-gray-900 bg-opacity-40 flex items-center justify-center z-50 p-4"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Condiciones de pago
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Obligatorias para generar el contrato de venta. Precio de venta:{' '}
            <span className="font-medium text-gray-800">
              {precioVenta.toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
              })}
            </span>
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Forma de pago *
            </label>
            <select
              data-testid="forma-pago"
              value={formaPago}
              onChange={(e) => handleFormaPago(e.target.value as FormaPago | '')}
              className={inputClass}
            >
              <option value="">Seleccionar…</option>
              <option value="contado">Contado</option>
              <option value="financiado">Financiado</option>
              <option value="mixto">Mixto (contado + financiado)</option>
            </select>
          </div>

          {esFinanciacion && (
            <div className="space-y-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Banco / financiera *
                </label>
                <input
                  data-testid="banco"
                  type="text"
                  list="bancos-sugeridos"
                  value={banco}
                  onChange={(e) => {
                    setBanco(e.target.value)
                    setError(null)
                  }}
                  className={inputClass}
                  placeholder="Ej: Santander Consumer"
                />
                <datalist id="bancos-sugeridos">
                  {BANCOS_SUGERIDOS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Interés (% TIN) *
                  </label>
                  <input
                    data-testid="interes"
                    type="number"
                    min="0"
                    step="0.01"
                    value={interes}
                    onChange={(e) => {
                      setInteres(e.target.value)
                      setError(null)
                    }}
                    className={inputClass}
                    placeholder="Ej: 7.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cuotas *
                  </label>
                  <input
                    data-testid="cuotas"
                    type="number"
                    min="1"
                    step="1"
                    value={cuotas}
                    onChange={(e) => {
                      setCuotas(e.target.value)
                      setError(null)
                    }}
                    className={inputClass}
                    placeholder="Ej: 60"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Monto financiado (€) *
                  </label>
                  <input
                    data-testid="monto-financiado"
                    type="number"
                    min="0"
                    step="0.01"
                    value={montoFinanciado}
                    onChange={(e) => {
                      setMontoFinanciado(e.target.value)
                      setError(null)
                    }}
                    className={inputClass}
                  />
                </div>
                {formaPago === 'mixto' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Monto al contado (€) *
                    </label>
                    <input
                      data-testid="monto-contado"
                      type="number"
                      min="0"
                      step="0.01"
                      value={montoContado}
                      onChange={(e) => {
                        setMontoContado(e.target.value)
                        setError(null)
                      }}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
              {formaPago === 'mixto' && (montoContado || montoFinanciado) && (
                <p
                  className={`text-xs font-medium ${
                    Math.abs(diffMixto) <= 1 ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  Contado + financiado = {sumaMixto.toFixed(2)} €{' '}
                  {Math.abs(diffMixto) <= 1
                    ? '✓ coincide con el precio de venta'
                    : `(${diffMixto > 0 ? 'sobran' : 'faltan'} ${Math.abs(
                        diffMixto
                      ).toFixed(2)} € respecto al precio de venta)`}
                </p>
              )}
            </div>
          )}

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">
              Garantía premium *
            </span>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  data-testid="garantia-si"
                  type="radio"
                  name="garantiaPremium"
                  checked={garantiaPremium === true}
                  onChange={() => {
                    setGarantiaPremium(true)
                    setError(null)
                  }}
                />
                Sí
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  data-testid="garantia-no"
                  type="radio"
                  name="garantiaPremium"
                  checked={garantiaPremium === false}
                  onChange={() => {
                    setGarantiaPremium(false)
                    setError(null)
                  }}
                />
                No
              </label>
            </div>
          </div>

          {error && (
            <div
              data-testid="condiciones-error"
              className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            data-testid="condiciones-submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              isSubmitting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isSubmitting ? 'Generando…' : 'Guardar y generar contrato'}
          </button>
        </div>
      </div>
    </div>
  )
}
