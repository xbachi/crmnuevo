'use client'

import { useState, useEffect } from 'react'
import { useSimpleToast } from '@/hooks/useSimpleToast'

export interface InversorReminder {
  id: number
  inversorId: number
  titulo: string
  descripcion: string
  tipo: 'llamada' | 'visita' | 'email' | 'seguimiento' | 'otro'
  prioridad: 'alta' | 'media' | 'baja'
  fechaRecordatorio: string
  completado: boolean
  createdAt: string
  updatedAt: string
}

interface InversorRemindersProps {
  inversorId: number
  inversorNombre: string
  isReadOnly?: boolean
}

export default function InversorReminders({
  inversorId,
  inversorNombre,
  isReadOnly = false,
}: InversorRemindersProps) {
  const { showToast, ToastContainer } = useSimpleToast()
  const [reminders, setReminders] = useState<InversorReminder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<number | null>(null)

  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    tipo: 'llamada' as const,
    prioridad: 'media' as const,
    fechaRecordatorio: '',
  })

  const fetchReminders = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(
        `/api/inversores/${inversorId}/recordatorios`
      )
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
  }, [inversorId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setIsSaving(true)
      const response = await fetch(
        `/api/inversores/${inversorId}/recordatorios`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            titulo: formData.titulo,
            descripcion: formData.descripcion,
            tipo: 'general',
            prioridad: 'media',
            fecha_recordatorio: formData.fechaRecordatorio,
          }),
        }
      )

      if (response.ok) {
        await fetchReminders()
        setFormData({
          titulo: '',
          descripcion: '',
          tipo: 'llamada',
          prioridad: 'media',
          fechaRecordatorio: '',
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
      const response = await fetch(
        `/api/inversores/${inversorId}/recordatorios/${id}`,
        {
          method: 'DELETE',
        }
      )

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
      const reminder = reminders.find((r) => r.id === id)
      if (!reminder) return

      const response = await fetch(
        `/api/inversores/${inversorId}/recordatorios`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: id,
            titulo: reminder.titulo,
            descripcion: reminder.descripcion,
            tipo: 'general',
            prioridad: 'media',
            fecha_recordatorio: reminder.fechaRecordatorio,
            completado: !completado,
          }),
        }
      )

      if (response.ok) {
        await fetchReminders()
        showToast('Recordatorio actualizado', 'success')
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al actualizar recordatorio', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al actualizar recordatorio', 'error')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recordatorios</h3>
        {!isReadOnly && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors"
          >
            {showForm ? 'Cancelar' : 'Agregar recordatorio'}
          </button>
        )}
      </div>

      {/* Formulario de nuevo recordatorio */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 p-4 bg-gray-50 rounded-lg"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título
              </label>
              <input
                type="text"
                value={formData.titulo}
                onChange={(e) =>
                  setFormData({ ...formData, titulo: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Título del recordatorio"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha
              </label>
              <input
                type="datetime-local"
                value={formData.fechaRecordatorio}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    fechaRecordatorio: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              value={formData.descripcion}
              onChange={(e) =>
                setFormData({ ...formData, descripcion: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="Descripción del recordatorio"
            />
          </div>
          <div className="flex justify-end space-x-2 mt-4">
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
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : 'Crear Recordatorio'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de recordatorios */}
      <div className="space-y-3">
        {reminders.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 text-4xl mb-2">📅</div>
            <p className="text-gray-500">No hay recordatorios</p>
          </div>
        ) : (
          reminders.map((reminder) => (
            <div
              key={reminder.id}
              className={`border rounded-lg p-4 ${
                reminder.completado
                  ? 'bg-green-50 border-green-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <input
                      type="checkbox"
                      checked={reminder.completado}
                      onChange={() =>
                        handleToggleComplete(reminder.id, reminder.completado)
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <h4
                      className={`font-medium ${
                        reminder.completado
                          ? 'text-green-700 line-through'
                          : 'text-gray-900'
                      }`}
                    >
                      {reminder.titulo}
                    </h4>
                  </div>
                  <p
                    className={`text-sm ${
                      reminder.completado ? 'text-green-600' : 'text-gray-600'
                    }`}
                  >
                    {reminder.descripcion}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDate(reminder.fechaRecordatorio)}
                  </p>
                </div>
                {!isReadOnly && (
                  <button
                    onClick={() => handleDelete(reminder.id)}
                    disabled={isDeleting === reminder.id}
                    className="ml-4 p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                    title="Eliminar recordatorio"
                  >
                    {isDeleting === reminder.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <ToastContainer />
    </div>
  )
}
