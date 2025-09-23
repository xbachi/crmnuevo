'use client'

import { useState } from 'react'
import { Inversor } from '@/lib/database'

interface InvestorFormProps {
  inversor?: Inversor
  onSave: (data: Omit<Inversor, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
  isLoading?: boolean
}

export function InvestorForm({
  inversor,
  onSave,
  onCancel,
  isLoading = false,
}: InvestorFormProps) {
  const [formData, setFormData] = useState({
    nombre: inversor?.nombre || '',
    documento: inversor?.documento || '',
    email: inversor?.email || '',
    telefono: inversor?.telefono || '',
    fechaAlta: inversor?.fechaAlta || new Date().toISOString().split('T')[0],
    capitalComprometido: inversor?.capitalComprometido?.toString() || '',
    capitalAportadoHistorico:
      inversor?.capitalAportadoHistorico?.toString() || '0',
    capitalDisponible: inversor?.capitalDisponible?.toString() || '',
    notasInternas: inversor?.notasInternas || '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const data = {
      nombre: formData.nombre.trim(),
      documento: formData.documento.trim() || undefined,
      email: formData.email.trim() || undefined,
      telefono: formData.telefono.trim() || undefined,
      fechaAlta: formData.fechaAlta,
      capitalAportado: inversor?.capitalAportado || 0,
      fechaAporte:
        inversor?.fechaAporte || new Date().toISOString().split('T')[0],
      capitalComprometido: formData.capitalComprometido
        ? Number(formData.capitalComprometido)
        : undefined,
      capitalAportadoHistorico: Number(formData.capitalAportadoHistorico) || 0,
      capitalDisponible: formData.capitalDisponible
        ? Number(formData.capitalDisponible)
        : undefined,
      notasInternas: formData.notasInternas.trim() || undefined,
    }

    onSave(data)
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label
            htmlFor="nombre"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Nombre completo *
          </label>
          <input
            type="text"
            id="nombre"
            name="nombre"
            value={formData.nombre}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Nombre completo del inversor"
          />
        </div>

        <div>
          <label
            htmlFor="documento"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Documento/ID
          </label>
          <input
            type="text"
            id="documento"
            name="documento"
            value={formData.documento}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="DNI, NIE, etc."
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="email@ejemplo.com"
          />
        </div>

        <div>
          <label
            htmlFor="telefono"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Teléfono
          </label>
          <input
            type="tel"
            id="telefono"
            name="telefono"
            value={formData.telefono}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="+34 600 000 000"
          />
        </div>

        <div>
          <label
            htmlFor="fechaAlta"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Fecha de alta
          </label>
          <input
            type="date"
            id="fechaAlta"
            name="fechaAlta"
            value={formData.fechaAlta}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="capitalAportadoHistorico"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Capital aportado histórico (€)
          </label>
          <input
            type="number"
            id="capitalAportadoHistorico"
            name="capitalAportadoHistorico"
            value={formData.capitalAportadoHistorico}
            onChange={handleChange}
            min="0"
            step="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="0"
          />
        </div>

        <div>
          <label
            htmlFor="capitalComprometido"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Capital comprometido (€)
          </label>
          <input
            type="number"
            id="capitalComprometido"
            name="capitalComprometido"
            value={formData.capitalComprometido}
            onChange={handleChange}
            min="0"
            step="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Opcional"
          />
        </div>

        <div>
          <label
            htmlFor="capitalDisponible"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Capital disponible (€)
          </label>
          <input
            type="number"
            id="capitalDisponible"
            name="capitalDisponible"
            value={formData.capitalDisponible}
            onChange={handleChange}
            min="0"
            step="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Opcional"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="notasInternas"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Notas internas
        </label>
        <textarea
          id="notasInternas"
          name="notasInternas"
          value={formData.notasInternas}
          onChange={handleChange}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="Notas internas sobre el inversor..."
        />
      </div>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Guardando...' : inversor ? 'Actualizar' : 'Crear'}
        </button>
      </div>
    </form>
  )
}
