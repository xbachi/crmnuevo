'use client'

import { Inversor } from '@/lib/database'
import { formatDate } from '@/lib/utils'

interface InvestorCardProps {
  inversor: Inversor
  onEdit: (inversor: Inversor) => void
  onDelete: (id: number) => void
  onView: (id: number) => void
}

export function InvestorCard({ inversor, onEdit, onDelete, onView }: InvestorCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{inversor.nombre}</h3>
          {inversor.documento && (
            <p className="text-sm text-gray-500">ID: {inversor.documento}</p>
          )}
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => onView(inversor.id)}
            className="px-3 py-1 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
          >
            Ver
          </button>
          <button
            onClick={() => onEdit(inversor)}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Editar
          </button>
          <button
            onClick={() => onDelete(inversor.id)}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>
      
      <div className="space-y-2 text-sm text-gray-600">
        {inversor.email && (
          <p><span className="font-medium">Email:</span> {inversor.email}</p>
        )}
        {inversor.telefono && (
          <p><span className="font-medium">Teléfono:</span> {inversor.telefono}</p>
        )}
        <p><span className="font-medium">Fecha de alta:</span> {formatDate(inversor.fechaAlta)}</p>
        {inversor.capitalAportadoHistorico > 0 && (
          <p><span className="font-medium">Capital aportado:</span> €{inversor.capitalAportadoHistorico.toLocaleString()}</p>
        )}
        {inversor.capitalComprometido && (
          <p><span className="font-medium">Capital comprometido:</span> €{inversor.capitalComprometido.toLocaleString()}</p>
        )}
      </div>
      
      {inversor.notasInternas && (
        <div className="mt-4 p-3 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-700">
            <span className="font-medium">Notas:</span> {inversor.notasInternas}
          </p>
        </div>
      )}
    </div>
  )
}
