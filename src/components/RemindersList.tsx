'use client'

import { useState, useEffect } from 'react'
import { Reminder, getPendingReminders, completeReminder, deleteReminder, getRemindersByPriority } from '@/lib/reminders'

interface RemindersListProps {
  maxItems?: number
  showCompleted?: boolean
  className?: string
}

export default function RemindersList({ maxItems = 5, showCompleted = false, className = '' }: RemindersListProps) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadReminders()
  }, [])

  const loadReminders = () => {
    const pendingReminders = getPendingReminders()
    const sortedReminders = pendingReminders.sort((a, b) => {
      // Ordenar por prioridad (high, medium, low) y luego por fecha de creación
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
      if (priorityDiff !== 0) return priorityDiff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    
    setReminders(sortedReminders.slice(0, maxItems))
    setIsLoading(false)
  }

  const handleComplete = (reminderId: string) => {
    completeReminder(reminderId)
    loadReminders()
  }

  const handleDelete = (reminderId: string) => {
    deleteReminder(reminderId)
    loadReminders()
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low': return 'bg-green-100 text-green-800 border-green-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return '🔴'
      case 'medium': return '🟡'
      case 'low': return '🟢'
      default: return '⚪'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'documentacion_cambio_nombre': return '📄'
      case 'itv_vencida': return '🚗'
      case 'seguro_vencido': return '🛡️'
      case 'revision_programada': return '🔧'
      default: return '📋'
    }
  }

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-200 rounded-lg h-16"></div>
          ))}
        </div>
      </div>
    )
  }

  if (reminders.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-gray-400 text-4xl mb-2">✅</div>
        <p className="text-gray-500 text-sm">No hay recordatorios pendientes</p>
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {reminders.map((reminder) => (
        <div
          key={reminder.id}
          className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{getTypeIcon(reminder.type)}</span>
                <h4 className="font-semibold text-gray-900 text-sm">{reminder.title}</h4>
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(reminder.priority)}`}>
                  {getPriorityIcon(reminder.priority)} {reminder.priority}
                </span>
              </div>
              <p className="text-gray-600 text-sm mb-2">{reminder.description}</p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>📅 {new Date(reminder.createdAt).toLocaleDateString('es-ES')}</span>
                {reminder.dueDate && (
                  <span className={new Date(reminder.dueDate) < new Date() ? 'text-red-500 font-medium' : ''}>
                    ⏰ Vence: {new Date(reminder.dueDate).toLocaleDateString('es-ES')}
                  </span>
                )}
                {reminder.dealId && (
                  <span>Deal: #{reminder.dealId}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => handleComplete(reminder.id)}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Marcar como completado"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={() => handleDelete(reminder.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Eliminar recordatorio"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
