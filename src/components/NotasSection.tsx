'use client'

import { useState, useEffect, memo, useCallback } from 'react'
import { useToast } from '@/components/Toast'

interface Nota {
  id: number
  contenido: string
  usuario_nombre: string
  fecha_creacion: string
}

interface NotasSectionProps {
  notas: Nota[]
  onNotasChange: (notas: Nota[]) => void
  entityId: number
  entityType?: 'vehiculo' | 'deal' | 'cliente' | 'inversor'
}

const NotasSection = memo(function NotasSection({ notas, onNotasChange, entityId, entityType = 'vehiculo' }: NotasSectionProps) {
  const { showToast } = useToast()
  const [nuevaNota, setNuevaNota] = useState('')
  const [editingNotaId, setEditingNotaId] = useState<number | null>(null)
  const [editingNotaTexto, setEditingNotaTexto] = useState('')

  // Cargar notas al montar el componente - memoizada
  const fetchNotas = useCallback(async () => {
    if (!entityId || entityId === 0) {
      console.log(`⚠️ [NOTA] EntityId no válido: ${entityId}`)
      return
    }
    
    try {
      console.log(`📝 [NOTA] Cargando notas para ${entityType} ${entityId}`)
      const apiUrl = entityType === 'inversores' ? `/api/inversores/${entityId}/notas` : `/api/${entityType}s/${entityId}/notas`
      const response = await fetch(apiUrl)
      
      if (response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json()
          onNotasChange(data)
          console.log(`✅ [NOTA] Notas cargadas: ${data.length}`)
        } else {
          console.error('❌ [NOTA] Respuesta no es JSON:', contentType)
          showToast('Error: Respuesta del servidor no es válida', 'error')
        }
      } else {
        console.error('❌ [NOTA] Error al cargar notas:', response.status, response.statusText)
        showToast(`Error al cargar las notas: ${response.status}`, 'error')
      }
    } catch (error) {
      console.error('❌ [NOTA] Error al cargar notas:', error)
      showToast('Error al cargar las notas', 'error')
    }
  }, [entityId, entityType, onNotasChange, showToast])

  useEffect(() => {
    fetchNotas()
  }, [entityId, entityType])

  const handleAgregarNota = useCallback(async () => {
    if (!nuevaNota.trim()) return
    
    try {
      console.log(`📝 [NOTA] Agregando nota para ${entityType} ${entityId}`)
      const apiUrl = entityType === 'inversores' ? `/api/inversores/${entityId}/notas` : `/api/${entityType}s/${entityId}/notas`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contenido: nuevaNota,
          usuario_nombre: 'Admin'
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ [NOTA] Error agregando nota:', errorData)
        showToast(`Error al agregar la nota: ${errorData.error}`, 'error')
        return
      }
      
      const nuevaNotaData = await response.json()
      console.log(`✅ [NOTA] Nota agregada:`, nuevaNotaData)
      
      // Recargar todas las notas
      await fetchNotas()
      setNuevaNota('')
      showToast('Nota agregada correctamente', 'success')
    } catch (error) {
      console.error('❌ [NOTA] Error agregando nota:', error)
      showToast('Error al agregar la nota', 'error')
    }
  }, [nuevaNota, entityType, entityId, fetchNotas, showToast])

  const handleEditarNota = useCallback((nota: Nota) => {
    setEditingNotaId(nota.id)
    setEditingNotaTexto(nota.contenido)
  }, [])

  const handleGuardarEdicionNota = useCallback(async () => {
    if (!editingNotaTexto.trim() || !editingNotaId) return
    
    try {
      console.log(`📝 [NOTA] Actualizando nota ${editingNotaId} para ${entityType} ${entityId}`)
      const apiUrl = entityType === 'inversores' ? `/api/inversores/${entityId}/notas` : `/api/${entityType}s/${entityId}/notas`
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingNotaId,
          contenido: editingNotaTexto
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ [NOTA] Error actualizando nota:', errorData)
        showToast(`Error al actualizar la nota: ${errorData.error}`, 'error')
        return
      }
      
      const notaActualizada = await response.json()
      console.log(`✅ [NOTA] Nota actualizada:`, notaActualizada)
      
      // Recargar todas las notas
      await fetchNotas()
      
      setEditingNotaId(null)
      setEditingNotaTexto('')
      showToast('Nota actualizada correctamente', 'success')
    } catch (error) {
      console.error('❌ [NOTA] Error actualizando nota:', error)
      showToast('Error al actualizar la nota', 'error')
    }
  }, [editingNotaTexto, editingNotaId, entityType, entityId, fetchNotas, showToast])

  const handleCancelarEdicionNota = useCallback(() => {
    setEditingNotaId(null)
    setEditingNotaTexto('')
  }, [])

  const handleEliminarNota = useCallback(async (notaId: number) => {
    try {
      console.log(`🗑️ [NOTA] Eliminando nota ${notaId} del ${entityType} ${entityId}`)
      const apiUrl = entityType === 'inversores' ? `/api/inversores/${entityId}/notas?notaId=${notaId}` : `/api/${entityType}s/${entityId}/notas?notaId=${notaId}`
      const response = await fetch(apiUrl, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ [NOTA] Error eliminando nota:', errorData)
        showToast(`Error al eliminar la nota: ${errorData.error}`, 'error')
        return
      }
      
      console.log(`✅ [NOTA] Nota eliminada`)
      
      // Recargar todas las notas
      await fetchNotas()
      showToast('Nota eliminada correctamente', 'success')
    } catch (error) {
      console.error('❌ [NOTA] Error eliminando nota:', error)
      showToast('Error al eliminar la nota', 'error')
    }
  }, [entityType, entityId, fetchNotas, showToast])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Notas</h2>
      
      {/* Formulario para agregar nota */}
      <div className="mb-4">
        <textarea
          value={nuevaNota}
          onChange={(e) => setNuevaNota(e.target.value)}
          placeholder="Agregar una nueva nota..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={3}
        />
        <button
          onClick={handleAgregarNota}
          disabled={!nuevaNota.trim()}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Agregar Nota
        </button>
      </div>
      
      {/* Lista de notas */}
      <div className="space-y-3">
        {notas.map(nota => (
          <div key={nota.id} className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {editingNotaId === nota.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingNotaTexto}
                      onChange={(e) => setEditingNotaTexto(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={3}
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={handleGuardarEdicionNota}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={handleCancelarEdicionNota}
                        className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-gray-900">{nota.contenido}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {nota.usuario_nombre} • {new Date(nota.fecha_creacion).toLocaleDateString('es-ES')}
                    </p>
                  </>
                )}
              </div>
              {editingNotaId !== nota.id && (
                <div className="flex space-x-1 ml-2">
                  <button
                    onClick={() => handleEditarNota(nota)}
                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Editar nota"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleEliminarNota(nota.id)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    title="Eliminar nota"
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
})

export default NotasSection
