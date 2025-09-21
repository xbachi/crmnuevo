'use client'

import { useState, useEffect } from 'react'
import { useSimpleToast } from '@/hooks/useSimpleToast'

export interface DepositoReminder {
  id: number
  depositoId: number
  titulo: string
  descripcion: string
  tipo: 'llamada' | 'visita' | 'email' | 'seguimiento' | 'otro'
  prioridad: 'alta' | 'media' | 'baja'
  fechaRecordatorio: string
  completado: boolean
  createdAt: string
  updatedAt: string
}

interface DepositoRemindersProps {
  depositoId: number
  depositoInfo: string
}

export default function DepositoReminders({ depositoId, depositoInfo }: DepositoRemindersProps) {
  const { showToast, ToastContainer } = useSimpleToast()
  const [reminders, setReminders] = useState<DepositoReminder[]>([])
  const [isLoading, setIsLoading] = useState(true)
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
      console.log(`📅 [DEPOSITO REMINDERS] Cargando recordatorios para depósito ${depositoId}`)
      const response = await fetch(`/api/depositos/${depositoId}/recordatorios`)
      console.log(`📊 [DEPOSITO REMINDERS] Response status:`, response.status)
      
      if (response.ok) {
        const data = await response.json()
        console.log(`✅ [DEPOSITO REMINDERS] Recordatorios cargados:`, data)
        setReminders(data)
      } else {
        const error = await response.json()
        console.error(`❌ [DEPOSITO REMINDERS] Error response:`, error)
        showToast('Error al cargar recordatorios', 'error')
      }
    } catch (error) {
      console.error('❌ [DEPOSITO REMINDERS] Error fetching reminders:', error)
      showToast('Error al cargar recordatorios', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchReminders()
  }, [depositoId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setIsSaving(true)
      console.log(`📅 [DEPOSITO REMINDERS] Creando recordatorio para depósito ${depositoId}:`, formData)
      
      const response = await fetch(`/api/depositos/${depositoId}/recordatorios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })

      console.log(`📊 [DEPOSITO REMINDERS] Response status:`, response.status)

      if (response.ok) {
        const newReminder = await response.json()
        console.log(`✅ [DEPOSITO REMINDERS] Recordatorio creado:`, newReminder)
        await fetchReminders()
        setFormData({
          titulo: '',
          descripcion: '',
          tipo: 'llamada',
          prioridad: 'media',
          fechaRecordatorio: ''
        })
        showToast('Recordatorio creado correctamente', 'success')
      } else {
        const error = await response.json()
        console.error(`❌ [DEPOSITO REMINDERS] Error response:`, error)
        showToast(error.error || 'Error al crear recordatorio', 'error')
      }
    } catch (error) {
      console.error('❌ [DEPOSITO REMINDERS] Error:', error)
      showToast('Error al crear recordatorio', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      setIsDeleting(id)
      console.log(`🗑️ [DEPOSITO REMINDERS] Eliminando recordatorio ${id} del depósito ${depositoId}`)
      
      const response = await fetch(`/api/depositos/${depositoId}/recordatorios?recordatorioId=${id}`, {
        method: 'DELETE'
      })

      console.log(`📊 [DEPOSITO REMINDERS] Delete response status:`, response.status)

      if (response.ok) {
        console.log(`✅ [DEPOSITO REMINDERS] Recordatorio eliminado`)
        showToast('Recordatorio eliminado correctamente', 'success')
        fetchReminders()
      } else {
        const error = await response.json()
        console.error(`❌ [DEPOSITO REMINDERS] Error response:`, error)
        showToast(error.error || 'Error al eliminar recordatorio', 'error')
      }
    } catch (error) {
      console.error('❌ [DEPOSITO REMINDERS] Error deleting reminder:', error)
      showToast('Error al eliminar recordatorio', 'error')
    } finally {
      setIsDeleting(null)
    }
  }

  const handleToggleComplete = async (id: number, completado: boolean) => {
    try {
      console.log(`✅ [DEPOSITO REMINDERS] Toggle completado ${id}: ${!completado}`)
      
      const response = await fetch(`/api/depositos/${depositoId}/recordatorios`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id,
          completado: !completado
        })
      })

      console.log(`📊 [DEPOSITO REMINDERS] Toggle response status:`, response.status)

      if (response.ok) {
        console.log(`✅ [DEPOSITO REMINDERS] Recordatorio actualizado`)
        showToast(`Recordatorio ${!completado ? 'completado' : 'pendiente'}`, 'success')
        fetchReminders()
      } else {
        const error = await response.json()
        console.error(`❌ [DEPOSITO REMINDERS] Error response:`, error)
        showToast(error.error || 'Error al actualizar recordatorio', 'error')
      }
    } catch (error) {
      console.error('❌ [DEPOSITO REMINDERS] Error toggling reminder:', error)
      showToast('Error al actualizar recordatorio', 'error')
    }
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'llamada': return 'bg-blue-100 text-blue-800'
      case 'visita': return 'bg-green-100 text-green-800'
      case 'email': return 'bg-purple-100 text-purple-800'
      case 'seguimiento': return 'bg-orange-100 text-orange-800'
      case 'otro': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
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

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recordatorios</h3>
      </div>

      <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3">
          <div>
            <input
              type="text"
              value={formData.titulo}
              onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              placeholder="Título del recordatorio"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <input
              type="datetime-local"
              value={formData.fechaRecordatorio}
              onChange={(e) => setFormData({ ...formData, fechaRecordatorio: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value as any })}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="llamada">Llamada</option>
              <option value="visita">Visita</option>
              <option value="email">Email</option>
              <option value="seguimiento">Seguimiento</option>
              <option value="otro">Otro</option>
            </select>
            
            <select
              value={formData.prioridad}
              onChange={(e) => setFormData({ ...formData, prioridad: e.target.value as any })}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </div>

          <div>
            <textarea
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              placeholder="Descripción (opcional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
            />
          </div>

          <div className="flex space-x-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : 'Crear'}
            </button>
          </div>
        </form>

      <div className="space-y-3">
        {reminders.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No hay recordatorios</p>
        ) : (
          reminders.map((reminder) => (
            <div
              key={reminder.id}
              className={`p-3 rounded-lg border ${
                reminder.completado 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-yellow-50 border-yellow-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h4 className="font-medium text-gray-900">{reminder.titulo}</h4>
                    <span className={`px-2 py-1 text-xs rounded-full ${getTipoColor(reminder.tipo)}`}>
                      {reminder.tipo}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full ${getPrioridadColor(reminder.prioridad)}`}>
                      {reminder.prioridad}
                    </span>
                  </div>
                  
                  {reminder.descripcion && (
                    <p className="text-sm text-gray-600 mb-2">{reminder.descripcion}</p>
                  )}
                  
                  <p className="text-xs text-gray-500">
                    {new Date(reminder.fechaRecordatorio).toLocaleString('es-ES')}
                  </p>
                </div>
                
                <div className="flex space-x-1 ml-2">
                  <button
                    onClick={() => handleToggleComplete(reminder.id, reminder.completado)}
                    className={`p-1 rounded ${
                      reminder.completado 
                        ? 'text-green-600 hover:text-green-800 hover:bg-green-100' 
                        : 'text-gray-400 hover:text-green-600 hover:bg-green-100'
                    }`}
                    title={reminder.completado ? 'Marcar como pendiente' : 'Marcar como completado'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  
                  <button
                    onClick={() => handleDelete(reminder.id)}
                    disabled={isDeleting === reminder.id}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded"
                    title="Eliminar recordatorio"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
