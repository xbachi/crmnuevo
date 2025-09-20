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
  created_at: string
  updated_at: string
}

interface RecordatoriosSectionProps {
  recordatorios: Recordatorio[]
  onRecordatoriosChange: (recordatorios: Recordatorio[]) => void
  entityId: number
  entityType: 'deal' | 'vehiculo' | 'cliente' | 'deposito'
}

export default function RecordatoriosSection({ 
  recordatorios, 
  onRecordatoriosChange, 
  entityId, 
  entityType 
}: RecordatoriosSectionProps) {
  const { showToast } = useToast()
  const [nuevoRecordatorio, setNuevoRecordatorio] = useState({
    titulo: '',
    descripcion: '',
    tipo: 'general',
    prioridad: 'media',
    fecha_recordatorio: ''
  })
  const [editingRecordatorioId, setEditingRecordatorioId] = useState<number | null>(null)
  const [editingRecordatorioData, setEditingRecordatorioData] = useState({
    titulo: '',
    descripcion: '',
    tipo: 'general',
    prioridad: 'media',
    fecha_recordatorio: ''
  })

  const fetchRecordatorios = async () => {
    if (!entityId) return
    try {
      console.log(`📅 [RECORDATORIOS SECTION] Obteniendo recordatorios para ${entityType} ${entityId}`)
      const response = await fetch(`/api/${entityType}s/${entityId}/recordatorios`)
      if (response.ok) {
        const data = await response.json()
        onRecordatoriosChange(data)
        console.log(`✅ [RECORDATORIOS SECTION] Recordatorios cargados:`, data.length)
      } else {
        console.error('Error al obtener recordatorios:', response.statusText)
        onRecordatoriosChange([])
      }
    } catch (error) {
      console.error('Error al obtener recordatorios:', error)
      onRecordatoriosChange([])
    }
  }

  useEffect(() => {
    fetchRecordatorios()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId])

  const handleAgregarRecordatorio = async () => {
    if (!nuevoRecordatorio.titulo.trim() || !nuevoRecordatorio.fecha_recordatorio || !entityId) return

    try {
      console.log(`📅 [RECORDATORIO] Agregando recordatorio para ${entityType} ${entityId}`)
      const response = await fetch(`/api/${entityType}s/${entityId}/recordatorios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevoRecordatorio)
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ [RECORDATORIO] Error agregando recordatorio:', errorData)
        showToast(`Error al agregar el recordatorio: ${errorData.error}`, 'error')
        return
      }

      const nuevoRecordatorioData = await response.json()
      console.log(`✅ [RECORDATORIO] Recordatorio agregado:`, nuevoRecordatorioData)

      await fetchRecordatorios()
      setNuevoRecordatorio({
        titulo: '',
        descripcion: '',
        tipo: 'general',
        prioridad: 'media',
        fecha_recordatorio: ''
      })
      showToast('Recordatorio agregado correctamente', 'success')
    } catch (error) {
      console.error('❌ [RECORDATORIO] Error agregando recordatorio:', error)
      showToast('Error al agregar el recordatorio', 'error')
    }
  }

  const handleEditarRecordatorio = (recordatorio: Recordatorio) => {
    setEditingRecordatorioId(recordatorio.id)
    setEditingRecordatorioData({
      titulo: recordatorio.titulo,
      descripcion: recordatorio.descripcion,
      tipo: recordatorio.tipo,
      prioridad: recordatorio.prioridad,
      fecha_recordatorio: recordatorio.fecha_recordatorio.split('T')[0] // Solo la fecha
    })
  }

  const handleGuardarEdicionRecordatorio = async () => {
    if (!editingRecordatorioData.titulo.trim() || !editingRecordatorioData.fecha_recordatorio || !entityId || !editingRecordatorioId) return

    try {
      console.log(`✏️ [RECORDATORIO] Actualizando recordatorio ${editingRecordatorioId} para ${entityType} ${entityId}`)
      const response = await fetch(`/api/${entityType}s/${entityId}/recordatorios`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRecordatorioId,
          ...editingRecordatorioData
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ [RECORDATORIO] Error actualizando recordatorio:', errorData)
        showToast(`Error al actualizar el recordatorio: ${errorData.error}`, 'error')
        return
      }

      console.log(`✅ [RECORDATORIO] Recordatorio actualizado`)

      await fetchRecordatorios()
      setEditingRecordatorioId(null)
      setEditingRecordatorioData({
        titulo: '',
        descripcion: '',
        tipo: 'general',
        prioridad: 'media',
        fecha_recordatorio: ''
      })
      showToast('Recordatorio actualizado correctamente', 'success')
    } catch (error) {
      console.error('❌ [RECORDATORIO] Error actualizando recordatorio:', error)
      showToast('Error al actualizar el recordatorio', 'error')
    }
  }

  const handleCancelarEdicionRecordatorio = () => {
    setEditingRecordatorioId(null)
    setEditingRecordatorioData({
      titulo: '',
      descripcion: '',
      tipo: 'general',
      prioridad: 'media',
      fecha_recordatorio: ''
    })
  }

  const handleEliminarRecordatorio = async (recordatorioId: number) => {
    if (!entityId) return

    try {
      console.log(`🗑️ [RECORDATORIO] Eliminando recordatorio ${recordatorioId} del ${entityType} ${entityId}`)
      const response = await fetch(`/api/${entityType}s/${entityId}/recordatorios?recordatorioId=${recordatorioId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ [RECORDATORIO] Error eliminando recordatorio:', errorData)
        showToast(`Error al eliminar el recordatorio: ${errorData.error}`, 'error')
        return
      }

      console.log(`✅ [RECORDATORIO] Recordatorio eliminado`)

      await fetchRecordatorios()
      showToast('Recordatorio eliminado correctamente', 'success')
    } catch (error) {
      console.error('❌ [RECORDATORIO] Error eliminando recordatorio:', error)
      showToast('Error al eliminar el recordatorio', 'error')
    }
  }

  const handleToggleCompletado = async (recordatorio: Recordatorio) => {
    if (!entityId) return

    try {
      console.log(`✅ [RECORDATORIO] Cambiando estado de recordatorio ${recordatorio.id}`)
      const response = await fetch(`/api/${entityType}s/${entityId}/recordatorios`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: recordatorio.id,
          completado: !recordatorio.completado
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ [RECORDATORIO] Error cambiando estado:', errorData)
        showToast(`Error al cambiar el estado: ${errorData.error}`, 'error')
        return
      }

      console.log(`✅ [RECORDATORIO] Estado cambiado`)

      await fetchRecordatorios()
      showToast(`Recordatorio ${!recordatorio.completado ? 'completado' : 'pendiente'}`, 'success')
    } catch (error) {
      console.error('❌ [RECORDATORIO] Error cambiando estado:', error)
      showToast('Error al cambiar el estado', 'error')
    }
  }

  const getPrioridadColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta': return 'text-red-600 bg-red-100'
      case 'media': return 'text-yellow-600 bg-yellow-100'
      case 'baja': return 'text-green-600 bg-green-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'llamada': return '📞'
      case 'visita': return '🏠'
      case 'email': return '📧'
      case 'seguimiento': return '📋'
      case 'general': return '📝'
      default: return '📝'
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Recordatorios ({recordatorios.length})</h2>
      
      {/* Formulario para agregar recordatorio */}
      <div className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
            <input
              type="text"
              value={nuevoRecordatorio.titulo}
              onChange={(e) => setNuevoRecordatorio({...nuevoRecordatorio, titulo: e.target.value})}
              placeholder="Título del recordatorio"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              value={nuevoRecordatorio.fecha_recordatorio}
              onChange={(e) => setNuevoRecordatorio({...nuevoRecordatorio, fecha_recordatorio: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={nuevoRecordatorio.tipo}
              onChange={(e) => setNuevoRecordatorio({...nuevoRecordatorio, tipo: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="general">General</option>
              <option value="llamada">Llamada</option>
              <option value="visita">Visita</option>
              <option value="email">Email</option>
              <option value="seguimiento">Seguimiento</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
            <select
              value={nuevoRecordatorio.prioridad}
              onChange={(e) => setNuevoRecordatorio({...nuevoRecordatorio, prioridad: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </div>
        </div>
        
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <textarea
            value={nuevoRecordatorio.descripcion}
            onChange={(e) => setNuevoRecordatorio({...nuevoRecordatorio, descripcion: e.target.value})}
            placeholder="Descripción del recordatorio"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={2}
          />
        </div>
        
        <button
          onClick={handleAgregarRecordatorio}
          disabled={!nuevoRecordatorio.titulo.trim() || !nuevoRecordatorio.fecha_recordatorio}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Agregar Recordatorio
        </button>
      </div>
      
      {/* Lista de recordatorios */}
      <div className="space-y-3">
        {recordatorios.map(recordatorio => (
          <div key={recordatorio.id} className={`border rounded-lg p-3 ${
            recordatorio.completado ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {editingRecordatorioId === recordatorio.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editingRecordatorioData.titulo}
                      onChange={(e) => setEditingRecordatorioData({...editingRecordatorioData, titulo: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Título del recordatorio"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <select
                        value={editingRecordatorioData.tipo}
                        onChange={(e) => setEditingRecordatorioData({...editingRecordatorioData, tipo: e.target.value})}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="general">General</option>
                        <option value="llamada">Llamada</option>
                        <option value="visita">Visita</option>
                        <option value="email">Email</option>
                        <option value="seguimiento">Seguimiento</option>
                      </select>
                      <select
                        value={editingRecordatorioData.prioridad}
                        onChange={(e) => setEditingRecordatorioData({...editingRecordatorioData, prioridad: e.target.value})}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="baja">Baja</option>
                        <option value="media">Media</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>
                    <input
                      type="date"
                      value={editingRecordatorioData.fecha_recordatorio}
                      onChange={(e) => setEditingRecordatorioData({...editingRecordatorioData, fecha_recordatorio: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <textarea
                      value={editingRecordatorioData.descripcion}
                      onChange={(e) => setEditingRecordatorioData({...editingRecordatorioData, descripcion: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={2}
                      placeholder="Descripción del recordatorio"
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={handleGuardarEdicionRecordatorio}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={handleCancelarEdicionRecordatorio}
                        className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-lg">{getTipoIcon(recordatorio.tipo)}</span>
                      <h3 className={`font-medium ${recordatorio.completado ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                        {recordatorio.titulo}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(recordatorio.prioridad)}`}>
                        {recordatorio.prioridad}
                      </span>
                    </div>
                    {recordatorio.descripcion && (
                      <p className={`text-sm mb-2 ${recordatorio.completado ? 'text-gray-400' : 'text-gray-600'}`}>
                        {recordatorio.descripcion}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      📅 {new Date(recordatorio.fecha_recordatorio).toLocaleDateString('es-ES')}
                    </p>
                  </>
                )}
              </div>
              {editingRecordatorioId !== recordatorio.id && (
                <div className="flex space-x-1 ml-2">
                  <button
                    onClick={() => handleToggleCompletado(recordatorio)}
                    className={`p-1 rounded transition-colors ${
                      recordatorio.completado 
                        ? 'text-green-600 hover:text-green-700' 
                        : 'text-gray-400 hover:text-green-600'
                    }`}
                    title={recordatorio.completado ? 'Marcar como pendiente' : 'Marcar como completado'}
                  >
                    {recordatorio.completado ? '✅' : '⏳'}
                  </button>
                  <button
                    onClick={() => handleEditarRecordatorio(recordatorio)}
                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Editar recordatorio"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleEliminarRecordatorio(recordatorio.id)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    title="Eliminar recordatorio"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
