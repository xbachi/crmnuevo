'use client'

import { useState, useEffect } from 'react'
import { useSimpleToast } from '@/hooks/useSimpleToast'

export interface ClientReminder {
  id: number
  clienteId: number
  titulo: string
  descripcion: string
  tipo: 'llamada' | 'visita' | 'email' | 'seguimiento' | 'otro'
  prioridad: 'alta' | 'media' | 'baja'
  fechaRecordatorio: string
  completado: boolean
  createdAt: string
  updatedAt: string
}

interface ClientRemindersProps {
  clienteId: number
  clienteNombre: string
}

export default function ClientReminders({ clienteId, clienteNombre }: ClientRemindersProps) {
  const { showToast, ToastContainer } = useSimpleToast()
  const [reminders, setReminders] = useState<ClientReminder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<number | null>(null)

  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    tipo: 'llamada' as const,
    prioridad: 'media' as const,
    fechaRecordatorio: ''
  })

  const fetchReminders = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/clientes/${clienteId}/recordatorios`)
      if (response.ok) {
        const data = await response.json()
        setReminders(data)
      }
    } catch (error) {
      console.error('Error fetching reminders:', error)
      showToast('Error al cargar recordatorios', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchReminders()
  }, [clienteId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setIsSaving(true)
      const response = await fetch(`/api/clientes/${clienteId}/recordatorios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        await fetchReminders()
        setFormData({
          titulo: '',
          descripcion: '',
          tipo: 'llamada',
          prioridad: 'media',
          fechaRecordatorio: ''
        })
        setShowForm(false)
        showToast('Recordatorio creado correctamente', 'success')
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al crear recordatorio', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al crear recordatorio', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      setIsDeleting(id)
      const response = await fetch(`/api/clientes/${clienteId}/recordatorios/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchReminders()
        showToast('Recordatorio eliminado correctamente', 'success')
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al eliminar recordatorio', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al eliminar recordatorio', 'error')
    } finally {
      setIsDeleting(null)
    }
  }

  const handleToggleComplete = async (id: number, completado: boolean) => {
    try {
      const response = await fetch(`/api/clientes/${clienteId}/recordatorios/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completado: !completado })
      })

      if (response.ok) {
        await fetchReminders()
        showToast(completado ? 'Recordatorio marcado como pendiente' : 'Recordatorio completado', 'success')
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al actualizar recordatorio', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al actualizar recordatorio', 'error')
    }
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'llamada': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'visita': return 'bg-green-100 text-green-800 border-green-200'
      case 'email': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'seguimiento': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'otro': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getPrioridadColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta': return 'bg-red-100 text-red-800'
      case 'media': return 'bg-yellow-100 text-yellow-800'
      case 'baja': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const isOverdue = (fechaRecordatorio: string) => {
    return new Date(fechaRecordatorio) < new Date()
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recordatorios</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recordatorios</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors"
        >
          {showForm ? 'Cancelar' : 'Agregar recordatorio'}
        </button>
      </div>

      {/* Formulario de nuevo recordatorio */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
              <input
                type="text"
                value={formData.titulo}
                onChange={(e) => setFormData(prev => ({ ...prev, titulo: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: Llamar para seguimiento"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea
                value={formData.descripcion}
                onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Detalles del recordatorio..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={formData.tipo}
                  onChange={(e) => setFormData(prev => ({ ...prev, tipo: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="llamada">Llamada</option>
                  <option value="visita">Visita</option>
                  <option value="email">Email</option>
                  <option value="seguimiento">Seguimiento</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
                <select
                  value={formData.prioridad}
                  onChange={(e) => setFormData(prev => ({ ...prev, prioridad: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y hora</label>
              <input
                type="datetime-local"
                value={formData.fechaRecordatorio}
                onChange={(e) => setFormData(prev => ({ ...prev, fechaRecordatorio: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Creando...' : 'Crear Recordatorio'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Lista de recordatorios */}
      <div className="space-y-3">
        {reminders.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No hay recordatorios</p>
        ) : (
          reminders.map((reminder) => (
            <div
              key={reminder.id}
              className={`p-3 rounded-lg border-l-4 ${
                reminder.completado 
                  ? 'bg-gray-50 border-gray-300 opacity-60' 
                  : isOverdue(reminder.fechaRecordatorio)
                    ? 'bg-red-50 border-red-400'
                    : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getTipoColor(reminder.tipo)}`}>
                      {reminder.tipo}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(reminder.prioridad)}`}>
                      {reminder.prioridad}
                    </span>
                    {isOverdue(reminder.fechaRecordatorio) && !reminder.completado && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Vencido
                      </span>
                    )}
                  </div>
                  
                  <h4 className={`font-medium ${reminder.completado ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                    {reminder.titulo}
                  </h4>
                  
                  {reminder.descripcion && (
                    <p className={`text-sm mt-1 ${reminder.completado ? 'text-gray-400' : 'text-gray-600'}`}>
                      {reminder.descripcion}
                    </p>
                  )}
                  
                  <p className="text-xs text-gray-500 mt-2">
                    {formatDate(reminder.fechaRecordatorio)}
                  </p>
                </div>
                
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => handleToggleComplete(reminder.id, reminder.completado)}
                    className={`p-1 rounded ${
                      reminder.completado 
                        ? 'text-green-600 hover:bg-green-100' 
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={reminder.completado ? 'Marcar como pendiente' : 'Marcar como completado'}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  <button
                    onClick={() => handleDelete(reminder.id)}
                    disabled={isDeleting === reminder.id}
                    className="p-1 text-red-400 hover:bg-red-100 rounded disabled:opacity-50"
                    title="Eliminar recordatorio"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <ToastContainer />
    </div>
  )
}
