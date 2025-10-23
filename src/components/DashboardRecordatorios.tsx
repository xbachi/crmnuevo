'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/components/Toast'

interface Recordatorio {
  id: number
  titulo: string
  descripcion: string
  tipo: string
  prioridad: string
  fecha_recordatorio: string
  completado: boolean
  tipo_entidad: 'deal' | 'vehiculo' | 'cliente' | 'deposito' | 'inversor'
  entidad_numero?: string
  cliente_nombre?: string
  cliente_apellidos?: string
  vehiculo_marca?: string
  vehiculo_modelo?: string
  created_at: string
}

export default function DashboardRecordatorios() {
  const { showToast } = useToast()
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchRecordatorios = async () => {
    try {
      console.log('📅 [DASHBOARD] Obteniendo recordatorios...')
      const response = await fetch('/api/dashboard/recordatorios')
      if (response.ok) {
        const data = await response.json()
        setRecordatorios(data)
        console.log(`✅ [DASHBOARD] Recordatorios cargados:`, data.length)
      } else {
        console.error('Error al obtener recordatorios:', response.statusText)
        setRecordatorios([])
      }
    } catch (error) {
      console.error('Error al obtener recordatorios:', error)
      setRecordatorios([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchRecordatorios()
  }, [])

  const handleCompletarRecordatorio = async (recordatorio: Recordatorio) => {
    try {
      console.log(
        `✅ [DASHBOARD] Completando recordatorio ${recordatorio.id} de ${recordatorio.tipo_entidad}`
      )

      // Construir URL correcta según el tipo de entidad
      let url = ''
      if (recordatorio.tipo_entidad === 'cliente') {
        // Para clientes necesitamos el ID del cliente, no el nombre
        url = `/api/clientes/${recordatorio.id}/recordatorios`
      } else if (recordatorio.tipo_entidad === 'deposito') {
        // Para depósitos usar el ID del depósito
        url = `/api/depositos/${recordatorio.id}/recordatorios`
      } else {
        // Para deals, vehículos e inversores
        url = `/api/${recordatorio.tipo_entidad}s/${recordatorio.id}/recordatorios`
      }

      console.log(`📊 [DASHBOARD] URL: ${url}`)

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: recordatorio.id,
          completado: true,
        }),
      })

      console.log(`📊 [DASHBOARD] Response status: ${response.status}`)

      if (response.ok) {
        console.log(`✅ [DASHBOARD] Recordatorio completado`)
        await fetchRecordatorios()
        showToast('Recordatorio completado', 'success')
      } else {
        const errorData = await response.json()
        console.error(
          '❌ [DASHBOARD] Error completando recordatorio:',
          errorData
        )
        showToast(
          `Error al completar recordatorio: ${errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error('❌ [DASHBOARD] Error completando recordatorio:', error)
      showToast('Error al completar recordatorio', 'error')
    }
  }

  const handleEliminarRecordatorio = async (recordatorio: Recordatorio) => {
    try {
      console.log(
        `🗑️ [DASHBOARD] Eliminando recordatorio ${recordatorio.id} de ${recordatorio.tipo_entidad}`
      )

      // Confirmar eliminación
      if (
        !confirm('¿Estás seguro de que quieres eliminar este recordatorio?')
      ) {
        return
      }

      // Construir URL correcta según el tipo de entidad
      let url = ''
      if (recordatorio.tipo_entidad === 'cliente') {
        url = `/api/clientes/${recordatorio.id}/recordatorios`
      } else if (recordatorio.tipo_entidad === 'deposito') {
        url = `/api/depositos/${recordatorio.id}/recordatorios`
      } else {
        url = `/api/${recordatorio.tipo_entidad}s/${recordatorio.id}/recordatorios`
      }

      console.log(`📊 [DASHBOARD] URL: ${url}`)

      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: recordatorio.id,
        }),
      })

      console.log(`📊 [DASHBOARD] Response status: ${response.status}`)

      if (response.ok) {
        console.log(`✅ [DASHBOARD] Recordatorio eliminado`)
        await fetchRecordatorios()
        showToast('Recordatorio eliminado exitosamente', 'success')
      } else {
        const errorData = await response.json()
        console.error(
          '❌ [DASHBOARD] Error eliminando recordatorio:',
          errorData
        )
        showToast(`Error al eliminar recordatorio: ${errorData.error}`, 'error')
      }
    } catch (error) {
      console.error('❌ [DASHBOARD] Error eliminando recordatorio:', error)
      showToast('Error al eliminar recordatorio', 'error')
    }
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'deal':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'vehiculo':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'cliente':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'deposito':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'inversor':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getPrioridadColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta':
        return 'text-red-600 bg-red-100'
      case 'media':
        return 'text-yellow-600 bg-yellow-100'
      case 'baja':
        return 'text-green-600 bg-green-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'deal':
        return '🤝'
      case 'vehiculo':
        return '🚗'
      case 'cliente':
        return '👤'
      case 'deposito':
        return '🏪'
      case 'inversor':
        return '💰'
      default:
        return '📝'
    }
  }

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getDescripcionEntidad = (recordatorio: Recordatorio) => {
    switch (recordatorio.tipo_entidad) {
      case 'deal':
        return `Deal ${recordatorio.entidad_numero} - ${recordatorio.cliente_nombre} ${recordatorio.cliente_apellidos}`
      case 'vehiculo':
        return `Vehículo ${recordatorio.vehiculo_marca} ${recordatorio.vehiculo_modelo}`
      case 'cliente':
        return `Cliente ${recordatorio.cliente_nombre} ${recordatorio.cliente_apellidos}`
      case 'deposito':
        return `Depósito ${recordatorio.entidad_numero}`
      case 'inversor':
        return `Inversor ${recordatorio.cliente_nombre}`
      default:
        return 'Sin información'
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recordatorios Manuales
        </h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Recordatorios Manuales ({recordatorios.length})
      </h2>

      {recordatorios.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-gray-400 text-6xl mb-4">📅</div>
          <p className="text-gray-500">No hay recordatorios pendientes</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {recordatorios.map((recordatorio) => (
            <div
              key={`${recordatorio.tipo_entidad}-${recordatorio.id}`}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-lg">
                      {getTipoIcon(recordatorio.tipo_entidad)}
                    </span>
                    <h3 className="font-medium text-gray-900">
                      {recordatorio.titulo}
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getTipoColor(recordatorio.tipo_entidad)}`}
                    >
                      {recordatorio.tipo_entidad.toUpperCase()}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(recordatorio.prioridad)}`}
                    >
                      {recordatorio.prioridad}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mb-2">
                    {recordatorio.descripcion}
                  </p>

                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span>
                      📅 {formatFecha(recordatorio.fecha_recordatorio)}
                    </span>
                    <span>📍 {getDescripcionEntidad(recordatorio)}</span>
                  </div>
                </div>

                <div className="ml-4 flex space-x-2">
                  <button
                    onClick={() => handleCompletarRecordatorio(recordatorio)}
                    className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                    title="Marcar como completado"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleEliminarRecordatorio(recordatorio)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    title="Eliminar recordatorio"
                  >
                    <svg
                      className="w-5 h-5"
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
      )}
    </div>
  )
}
