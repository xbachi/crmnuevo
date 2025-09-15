'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSimpleToast } from '@/hooks/useSimpleToast'

interface ManualReminder {
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
  clienteNombre: string
}

export default function ManualReminders() {
  const router = useRouter()
  const { showToast, ToastContainer } = useSimpleToast()
  const [reminders, setReminders] = useState<ManualReminder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())

  const fetchReminders = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/recordatorios')
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
  }, [])

  const toggleExpanded = (id: number) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedItems(newExpanded)
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

  const isToday = (fechaRecordatorio: string) => {
    const today = new Date()
    const reminderDate = new Date(fechaRecordatorio)
    return today.toDateString() === reminderDate.toDateString()
  }

  const isTomorrow = (fechaRecordatorio: string) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const reminderDate = new Date(fechaRecordatorio)
    return tomorrow.toDateString() === reminderDate.toDateString()
  }

  const getTimeLabel = (fechaRecordatorio: string) => {
    if (isOverdue(fechaRecordatorio)) return 'Vencido'
    if (isToday(fechaRecordatorio)) return 'Hoy'
    if (isTomorrow(fechaRecordatorio)) return 'Mañana'
    return 'Próximo'
  }

  const getTimeColor = (fechaRecordatorio: string) => {
    if (isOverdue(fechaRecordatorio)) return 'bg-red-100 text-red-800'
    if (isToday(fechaRecordatorio)) return 'bg-orange-100 text-orange-800'
    if (isTomorrow(fechaRecordatorio)) return 'bg-yellow-100 text-yellow-800'
    return 'bg-blue-100 text-blue-800'
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Recordatorios Manuales</h3>
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-gray-200 rounded"></div>
          <div className="h-3 bg-gray-200 rounded w-3/4"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  if (reminders.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Recordatorios Manuales</h3>
        <p className="text-gray-500 text-center py-2 text-sm">No hay recordatorios pendientes</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-900">Recordatorios Manuales</h3>
        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
          {reminders.length} pendientes
        </span>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {reminders.map((reminder) => (
          <div
            key={reminder.id}
            className={`rounded-lg border-l-4 cursor-pointer transition-all duration-200 ${
              isOverdue(reminder.fechaRecordatorio)
                ? 'bg-red-50 border-red-400 hover:bg-red-100'
                : isToday(reminder.fechaRecordatorio)
                  ? 'bg-orange-50 border-orange-400 hover:bg-orange-100'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
            }`}
          >
            {/* Header compacto - siempre visible */}
            <div
              className="p-3 flex items-center justify-between"
              onClick={() => router.push(`/clientes/${reminder.clienteId}`)}
            >
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                {/* Indicador de origen */}
                <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded-full font-medium whitespace-nowrap">
                  Cliente
                </span>
                
                {/* Tipo y prioridad */}
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getTipoColor(reminder.tipo)}`}>
                  {reminder.tipo}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(reminder.prioridad)}`}>
                  {reminder.prioridad}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTimeColor(reminder.fechaRecordatorio)}`}>
                  {getTimeLabel(reminder.fechaRecordatorio)}
                </span>
              </div>
              
              <div className="flex items-center space-x-2 ml-2">
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {formatDate(reminder.fechaRecordatorio)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpanded(reminder.id)
                  }}
                  className={`p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-transform ${
                    expandedItems.has(reminder.id) ? 'rotate-180' : ''
                  }`}
                  title={expandedItems.has(reminder.id) ? 'Ocultar detalles' : 'Ver detalles'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Contenido expandible */}
            {expandedItems.has(reminder.id) && (
              <div className="px-3 pb-3 border-t border-gray-200 pt-2">
                <div className="space-y-2">
                  <div>
                    <h4 className="font-medium text-gray-900 text-sm">
                      {reminder.titulo}
                    </h4>
                  </div>
                  
                  <div>
                    <p className="text-xs text-gray-600">
                      <span className="font-medium">Cliente:</span> {reminder.clienteNombre}
                    </p>
                  </div>
                  
                  {reminder.descripcion && (
                    <div>
                      <p className="text-xs text-gray-600">
                        <span className="font-medium">Descripción:</span> {reminder.descripcion}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Título compacto - solo visible cuando está colapsado */}
            {!expandedItems.has(reminder.id) && (
              <div className="px-3 pb-2">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {reminder.titulo}
                </p>
                <p className="text-xs text-gray-600 truncate">
                  {reminder.clienteNombre}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200">
        <button
          onClick={() => router.push('/clientes')}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          Ver todos los clientes →
        </button>
      </div>

      <ToastContainer />
    </div>
  )
}