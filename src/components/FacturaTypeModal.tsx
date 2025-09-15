'use client'

import { useState } from 'react'

interface FacturaTypeModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (tipo: 'IVA' | 'REBU', numeroFactura?: string) => void
}

export default function FacturaTypeModal({ isOpen, onClose, onConfirm }: FacturaTypeModalProps) {
  const [selectedType, setSelectedType] = useState<'IVA' | 'REBU'>('IVA')
  const [numeroFactura, setNumeroFactura] = useState('')

  if (!isOpen) return null

  const handleConfirm = () => {
    onConfirm(selectedType, numeroFactura)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
        <h2 className="text-xl font-bold mb-4">Seleccionar Tipo de Factura</h2>
        
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <input
              type="radio"
              id="iva"
              name="facturaType"
              value="IVA"
              checked={selectedType === 'IVA'}
              onChange={(e) => setSelectedType(e.target.value as 'IVA')}
              className="w-4 h-4 text-blue-600"
            />
            <label htmlFor="iva" className="text-lg">
              <span className="font-semibold">Factura con IVA</span>
              <p className="text-sm text-gray-600">Precio con IVA discriminado (21%)</p>
            </label>
          </div>
          
          <div className="flex items-center space-x-3">
            <input
              type="radio"
              id="rebu"
              name="facturaType"
              value="REBU"
              checked={selectedType === 'REBU'}
              onChange={(e) => setSelectedType(e.target.value as 'REBU')}
              className="w-4 h-4 text-blue-600"
            />
            <label htmlFor="rebu" className="text-lg">
              <span className="font-semibold">Factura REBU</span>
              <p className="text-sm text-gray-600">Precio sin IVA (Régimen Especial Básico)</p>
            </label>
          </div>
        </div>
        
        {/* Campo de número de factura personalizado */}
        <div className="mt-6">
          <label htmlFor="numeroFactura" className="block text-sm font-medium text-gray-700 mb-2">
            Número de Factura (opcional)
          </label>
          <input
            type="text"
            id="numeroFactura"
            value={numeroFactura}
            onChange={(e) => setNumeroFactura(e.target.value)}
            placeholder="Dejar vacío para auto-generar"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            Si no especificas un número, se generará automáticamente
          </p>
        </div>
        
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Generar Factura
          </button>
        </div>
      </div>
    </div>
  )
}
