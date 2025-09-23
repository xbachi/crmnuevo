'use client'

import { useState, useEffect } from 'react'
import { useSimpleToast } from '@/hooks/useSimpleToast'
import { formatCurrency } from '@/lib/utils'
import CurrencyInput from './CurrencyInput'

interface DealVentaInfoProps {
  dealId: number
  initialData?: {
    montoVenta?: number
    formaPago?: 'contado' | 'financiado' | 'mixto'
    montoContado?: number
    montoFinanciado?: number
    garantia?: 'premium' | 'standard'
    entidadFinanciera?: string
  }
  onUpdate?: (data: any) => void
}

export default function DealVentaInfo({
  dealId,
  initialData,
  onUpdate,
}: DealVentaInfoProps) {
  const { showToast, ToastContainer } = useSimpleToast()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    montoVenta: initialData?.montoVenta || 0,
    formaPago:
      initialData?.formaPago || ('' as 'contado' | 'financiado' | 'mixto' | ''),
    montoContado: initialData?.montoContado || 0,
    montoFinanciado: initialData?.montoFinanciado || 0,
    garantia: initialData?.garantia || ('standard' as 'premium' | 'standard'),
    entidadFinanciera: initialData?.entidadFinanciera || '',
  })

  // Cargar datos desde la API al montar el componente
  useEffect(() => {
    const loadVentaInfo = async () => {
      try {
        const response = await fetch(`/api/deals/${dealId}/venta-info`)
        if (response.ok) {
          const data = await response.json()
          setFormData({
            montoVenta: data.montoVenta || 0,
            formaPago: data.formaPago || '',
            montoContado: data.montoContado || 0,
            montoFinanciado: data.montoFinanciado || 0,
            garantia: data.garantia || 'standard',
            entidadFinanciera: data.entidadFinanciera || '',
          })
        }
      } catch (error) {
        console.error('Error loading venta info:', error)
      }
    }

    loadVentaInfo()
  }, [dealId])

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    const newValue = type === 'number' ? parseFloat(value) || 0 : value

    setFormData((prev) => ({
      ...prev,
      [name]: newValue,
    }))
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)

      // Validaciones
      if (formData.montoVenta <= 0) {
        showToast('El monto de venta debe ser mayor a 0', 'error')
        return
      }

      if (formData.formaPago === 'mixto') {
        if (formData.montoContado <= 0 || formData.montoFinanciado <= 0) {
          showToast(
            'Para pago mixto, ambos montos deben ser mayores a 0',
            'error'
          )
          return
        }
        if (
          Math.abs(
            formData.montoContado +
              formData.montoFinanciado -
              formData.montoVenta
          ) > 0.01
        ) {
          showToast(
            'La suma de contado + financiado debe igualar el monto total',
            'error'
          )
          return
        }
      }

      if (
        formData.formaPago === 'financiado' &&
        !formData.entidadFinanciera.trim()
      ) {
        showToast('Debe especificar la entidad financiera', 'error')
        return
      }

      // Llamada a la API para guardar
      const response = await fetch(`/api/deals/${dealId}/venta-info`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        showToast('Información de venta guardada correctamente', 'success')
        setIsEditing(false)
        onUpdate?.(formData)
      } else {
        const errorData = await response.json()
        showToast(`Error al guardar: ${errorData.error}`, 'error')
      }
    } catch (error) {
      console.error('Error saving venta info:', error)
      showToast('Error al guardar la información de venta', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      montoVenta: initialData?.montoVenta || 0,
      formaPago: initialData?.formaPago || '',
      montoContado: initialData?.montoContado || 0,
      montoFinanciado: initialData?.montoFinanciado || 0,
      garantia: initialData?.garantia || 'standard',
      entidadFinanciera: initialData?.entidadFinanciera || '',
    })
    setIsEditing(false)
  }

  const getFormaPagoLabel = (forma: string) => {
    switch (forma) {
      case 'contado':
        return 'Contado'
      case 'financiado':
        return 'Financiado'
      case 'mixto':
        return 'Mixto'
      case '':
        return 'Seleccionar'
      default:
        return forma || 'Seleccionar'
    }
  }

  const getGarantiaLabel = (garantia: string) => {
    switch (garantia) {
      case 'premium':
        return 'Premium'
      case 'standard':
        return 'Standard'
      default:
        return garantia
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Información de Venta
        </h2>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors"
          >
            Editar
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          {/* Layout de 2 columnas: Izquierda (Monto + Garantía) y Derecha (Forma de Pago + Entidad + Montos) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Columna Izquierda */}
            <div className="space-y-4">
              {/* Monto de Venta */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto de Venta
                </label>
                <CurrencyInput
                  value={formData.montoVenta}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, montoVenta: value }))
                  }
                  placeholder="0"
                />
              </div>

              {/* Tipo de Garantía */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Garantía
                </label>
                <select
                  name="garantia"
                  value={formData.garantia}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
            </div>

            {/* Columna Derecha */}
            <div className="space-y-4">
              {/* Forma de Pago */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Forma de Pago
                </label>
                <select
                  name="formaPago"
                  value={formData.formaPago}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Seleccionar</option>
                  <option value="contado">Contado</option>
                  <option value="financiado">Financiado</option>
                  <option value="mixto">Mixto (Contado + Financiado)</option>
                </select>
              </div>

              {/* Entidad Financiera */}
              {(formData.formaPago === 'financiado' ||
                formData.formaPago === 'mixto') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entidad Financiera
                  </label>
                  <input
                    type="text"
                    name="entidadFinanciera"
                    value={formData.entidadFinanciera}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Nombre de la entidad financiera"
                  />
                </div>
              )}

              {/* Montos específicos para pago mixto */}
              {formData.formaPago === 'mixto' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Monto Contado
                    </label>
                    <CurrencyInput
                      value={formData.montoContado}
                      onChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          montoContado: value,
                        }))
                      }
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Monto Financiado
                    </label>
                    <CurrencyInput
                      value={formData.montoFinanciado}
                      onChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          montoFinanciado: value,
                        }))
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Layout de 2 columnas para vista de solo lectura */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Columna Izquierda */}
            <div className="space-y-4">
              {/* Monto de Venta */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Monto de Venta
                </label>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(formData.montoVenta)}
                </p>
              </div>

              {/* Tipo de Garantía */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Tipo de Garantía
                </label>
                <p className="text-lg font-semibold text-gray-900">
                  {getGarantiaLabel(formData.garantia)}
                </p>
              </div>
            </div>

            {/* Columna Derecha */}
            <div className="space-y-4">
              {/* Forma de Pago */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Forma de Pago
                </label>
                <p className="text-lg font-semibold text-gray-900">
                  {getFormaPagoLabel(formData.formaPago)}
                </p>
              </div>

              {/* Entidad Financiera */}
              {(formData.formaPago === 'financiado' ||
                formData.formaPago === 'mixto') &&
                formData.entidadFinanciera && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Entidad Financiera
                    </label>
                    <p className="text-lg font-semibold text-gray-900">
                      {formData.entidadFinanciera}
                    </p>
                  </div>
                )}

              {/* Desglose de pago mixto */}
              {formData.formaPago === 'mixto' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                    <div className="flex items-center space-x-1 mb-1">
                      <div className="w-4 h-4 bg-green-500 rounded flex items-center justify-center">
                        <svg
                          className="w-2 h-2 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <span className="font-medium text-green-700">
                        Contado
                      </span>
                    </div>
                    <p className="text-green-900 font-semibold">
                      {formatCurrency(formData.montoContado)}
                    </p>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                    <div className="flex items-center space-x-1 mb-1">
                      <div className="w-4 h-4 bg-blue-500 rounded flex items-center justify-center">
                        <svg
                          className="w-2 h-2 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 6a2 2 0 114 0 2 2 0 01-4 0zm8 0a2 2 0 114 0 2 2 0 01-4 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <span className="font-medium text-blue-700">
                        Financiado
                      </span>
                    </div>
                    <p className="text-blue-900 font-semibold">
                      {formatCurrency(formData.montoFinanciado)}
                    </p>
                    <p className="text-blue-600 text-xs">
                      {formData.montoVenta > 0
                        ? Math.round(
                            (formData.montoFinanciado / formData.montoVenta) *
                              100
                          )
                        : 0}
                      % financiado
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  )
}
