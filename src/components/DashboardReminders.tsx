'use client'

import { useState, useEffect } from 'react'

interface DashboardReminder {
  id: string
  type: 'itv_vencida' | 'documentacion_pendiente' | 'cambio_nombre_pendiente'
  title: string
  description: string
  count: number
  priority: 'high' | 'medium' | 'low'
  items: Array<{
    id: number
    referencia: string
    marca: string
    modelo: string
    matricula?: string
    [key: string]: any
  }>
}

export default function DashboardReminders() {
  const [reminders, setReminders] = useState<DashboardReminder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedReminders, setExpandedReminders] = useState<Set<string>>(
    new Set()
  )

  useEffect(() => {
    loadReminders()
  }, [])

  const loadReminders = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/dashboard-reminders')
      if (response.ok) {
        const dashboardReminders = await response.json()
        setReminders(dashboardReminders)
      } else {
        throw new Error('Error al obtener recordatorios')
      }
    } catch (err) {
      console.error('Error loading dashboard reminders:', err)
      setError('Error al cargar recordatorios')
    } finally {
      setIsLoading(false)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500 text-white border-red-500'
      case 'medium':
        return 'bg-yellow-500 text-white border-yellow-500'
      case 'low':
        return 'bg-green-500 text-white border-green-500'
      default:
        return 'bg-gray-500 text-white border-gray-500'
    }
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return '🔴'
      case 'medium':
        return '🟡'
      case 'low':
        return '🟢'
      default:
        return '⚪'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'itv_vencida':
        return '🚗'
      case 'documentacion_pendiente':
        return '📄'
      case 'cambio_nombre_pendiente':
        return '📝'
      default:
        return '📋'
    }
  }

  const toggleExpanded = (reminderId: string) => {
    const newExpanded = new Set(expandedReminders)
    if (newExpanded.has(reminderId)) {
      newExpanded.delete(reminderId)
    } else {
      newExpanded.add(reminderId)
    }
    setExpandedReminders(newExpanded)
  }

  const handleEliminarReminder = async (reminderId: string) => {
    try {
      console.log(`🗑️ [DASHBOARD REMINDERS] Eliminando reminder: ${reminderId}`)

      // Confirmar eliminación
      if (
        !confirm('¿Estás seguro de que quieres eliminar este recordatorio?')
      ) {
        return
      }

      // Actualizar estado local inmediatamente
      setReminders((prev) => prev.filter((r) => r.id !== reminderId))

      // Llamar a la API para eliminar (si existe endpoint)
      const response = await fetch(`/api/dashboard-reminders/${reminderId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        console.log(`✅ [DASHBOARD REMINDERS] Reminder eliminado`)
      } else {
        console.error(
          '❌ [DASHBOARD REMINDERS] Error eliminando reminder:',
          response.statusText
        )
        // Revertir cambio local si falla la API
        loadReminders()
      }
    } catch (error) {
      console.error(
        '❌ [DASHBOARD REMINDERS] Error eliminando reminder:',
        error
      )
      // Revertir cambio local si falla la API
      loadReminders()
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse bg-gray-200 rounded-lg h-12"
          ></div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 text-4xl mb-2">⚠️</div>
        <p className="text-red-600 text-sm">{error}</p>
        <button
          onClick={loadReminders}
          className="mt-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (reminders.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-green-500 text-4xl mb-2">✅</div>
        <p className="text-gray-500 text-sm">No hay recordatorios pendientes</p>
        <p className="text-gray-400 text-xs mt-1">Todo está al día</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {reminders.map((reminder) => (
        <div
          key={reminder.id}
          data-reminder-type={reminder.type}
          data-count={reminder.count}
          className={`p-3 rounded-lg border-l-4 ${
            reminder.priority === 'high'
              ? 'bg-red-50 border-red-500'
              : reminder.priority === 'medium'
                ? 'bg-yellow-50 border-yellow-500'
                : 'bg-green-50 border-green-500'
          } hover:shadow-md transition-shadow`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{getTypeIcon(reminder.type)}</span>
                <h4 className="font-semibold text-gray-900 text-sm">
                  {reminder.title}
                </h4>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(reminder.priority)}`}
                >
                  {getPriorityIcon(reminder.priority)}{' '}
                  {reminder.priority === 'high'
                    ? 'Alta'
                    : reminder.priority === 'medium'
                      ? 'Media'
                      : 'Baja'}
                </span>
              </div>
              <p className="text-gray-600 text-xs mb-2">
                {reminder.description}
              </p>

              {/* Mostrar algunos elementos específicos */}
              {reminder.items.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => toggleExpanded(reminder.id)}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      expandedReminders.has(reminder.id)
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <svg
                      className={`w-3 h-3 transition-transform ${expandedReminders.has(reminder.id) ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                    {expandedReminders.has(reminder.id) ? 'Ocultar' : 'Ver'}{' '}
                    detalles ({reminder.items.length})
                  </button>

                  {expandedReminders.has(reminder.id) && (
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {reminder.items.map((item, index) => (
                        <div
                          key={index}
                          data-deal-id={item.dealId}
                          className={`px-2 py-1 rounded-lg border text-xs ${
                            reminder.priority === 'high'
                              ? 'bg-red-100 border-red-200'
                              : reminder.priority === 'medium'
                                ? 'bg-yellow-100 border-yellow-200'
                                : 'bg-green-100 border-green-200'
                          } ${
                            reminder.type === 'cambio_nombre_pendiente'
                              ? 'cursor-pointer hover:opacity-80 transition-opacity'
                              : ''
                          }`}
                          onClick={() => {
                            if (
                              reminder.type === 'cambio_nombre_pendiente' &&
                              item.dealId
                            ) {
                              window.location.href = `/deals/${item.dealId}`
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="font-semibold text-gray-800 truncate">
                                {item.referencia} - {item.marca} {item.modelo}
                              </span>
                              {item.matricula && (
                                <span className="text-gray-600 whitespace-nowrap">
                                  📍 {item.matricula}
                                </span>
                              )}
                              {reminder.type === 'cambio_nombre_pendiente' &&
                                item.cliente && (
                                  <span className="text-gray-600 whitespace-nowrap">
                                    👤 {item.cliente.nombre}{' '}
                                    {item.cliente.apellidos}
                                  </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                              {reminder.type === 'cambio_nombre_pendiente' &&
                                item.dealId && (
                                  <span className="text-blue-600 text-xs">
                                    Deal #{item.dealId}
                                  </span>
                                )}
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                                  reminder.priority === 'high'
                                    ? 'bg-red-200 text-red-800'
                                    : reminder.priority === 'medium'
                                      ? 'bg-yellow-200 text-yellow-800'
                                      : 'bg-green-200 text-green-800'
                                }`}
                              >
                                {reminder.priority === 'high'
                                  ? 'Alta'
                                  : reminder.priority === 'medium'
                                    ? 'Media'
                                    : 'Baja'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {reminder.items.length > 5 &&
                        !expandedReminders.has(reminder.id) && (
                          <div className="text-center py-2">
                            <button
                              onClick={() => toggleExpanded(reminder.id)}
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium hover:opacity-80 transition-opacity cursor-pointer ${
                                reminder.priority === 'high'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : reminder.priority === 'medium'
                                    ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              +{reminder.items.length - 5} elementos más
                            </button>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="ml-4 flex items-center gap-2">
              {/* Botón de navegación */}
              <button
                onClick={() => {
                  if (
                    reminder.type === 'itv_vencida' ||
                    reminder.type === 'documentacion_pendiente'
                  ) {
                    window.location.href = '/vehiculos'
                  } else if (reminder.type === 'cambio_nombre_pendiente') {
                    window.location.href = '/deals'
                  }
                }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  reminder.priority === 'high'
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : reminder.priority === 'medium'
                      ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
                title="Ir a la sección"
              >
                Ir →
              </button>

              {/* Botón de actualizar */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  loadReminders()
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Actualizar"
              >
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>

              {/* Botón de eliminar */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleEliminarReminder(reminder.id)
                }}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                title="Eliminar recordatorio"
              >
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
