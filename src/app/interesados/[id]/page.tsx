'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { capitalizeText } from '@/lib/utils'
import { useSimpleToast } from '@/hooks/useSimpleToast'

interface Interesado {
  id: number
  nombre: string
  apellidos: string
  telefono: string
  vehiculosInteres?: string
  presupuestoMaximo?: number
  kilometrajeMaximo?: number
  añoMinimo?: number
  combustiblePreferido?: string
  cambioPreferido?: string
  formaPagoPreferida?: string
  createdAt?: string
  updatedAt?: string
}

interface NotaInteresado {
  id: number
  interesadoId: number
  tipo: string
  titulo: string
  contenido: string
  prioridad: string
  completada: boolean
  fecha: string
  usuario: string
  createdAt: string
}

export default function InteresadoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { showToast, ToastContainer } = useSimpleToast()
  const interesadoId = params.id as string

  const [interesado, setInteresado] = useState<Interesado | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [nuevaNota, setNuevaNota] = useState('')
  const [notasInteresado, setNotasInteresado] = useState<NotaInteresado[]>([])
  const [editingNotaId, setEditingNotaId] = useState<number | null>(null)
  const [editingContent, setEditingContent] = useState('')

  useEffect(() => {
    fetchInteresado()
    fetchNotas()
  }, [interesadoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchInteresado = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/interesados/${interesadoId}`)

      if (!response.ok) {
        throw new Error('Interesado no encontrado')
      }

      const data = await response.json()
      setInteresado(data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchNotas = async () => {
    try {
      const response = await fetch(`/api/interesados/${interesadoId}/notas`)
      if (response.ok) {
        const notas = await response.json()
        setNotasInteresado(notas)
      }
    } catch (error) {
      console.error('Error cargando notas:', error)
    }
  }

  const handleAgregarNota = async () => {
    if (!interesado || !nuevaNota.trim()) return

    try {
      const response = await fetch(`/api/interesados/${interesado.id}/notas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contenido: nuevaNota.trim(),
          tipo: 'general',
          titulo: 'Nota general',
          usuario: 'Admin',
        }),
      })

      if (response.ok) {
        setNuevaNota('')
        fetchNotas()
        showToast('Nota agregada correctamente', 'success')
      } else {
        const errorData = await response.json()
        showToast(
          `Error al agregar la nota: ${errorData.details || errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error('Error agregando nota:', error)
      showToast('Error al agregar la nota', 'error')
    }
  }

  const handleEditarNota = async (notaId: number) => {
    if (!interesado) return

    try {
      const response = await fetch(`/api/interesados/${interesado.id}/notas`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notaId: notaId,
          contenido: editingContent.trim(),
          tipo: 'general',
          titulo: 'Nota general',
          usuario: 'Admin',
        }),
      })

      if (response.ok) {
        setEditingNotaId(null)
        setEditingContent('')
        fetchNotas()
        showToast('Nota editada correctamente', 'success')
      } else {
        const errorData = await response.json()
        showToast(
          `Error al editar la nota: ${errorData.details || errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error('Error editando nota:', error)
      showToast('Error al editar la nota', 'error')
    }
  }

  const handleEliminarNota = async (notaId: number) => {
    if (!interesado) return

    try {
      const response = await fetch(
        `/api/interesados/${interesado.id}/notas?notaId=${notaId}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        fetchNotas()
        showToast('Nota eliminada correctamente', 'success')
      } else {
        const errorData = await response.json()
        showToast(
          `Error al eliminar la nota: ${errorData.details || errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error('Error eliminando nota:', error)
      showToast('Error al eliminar la nota', 'error')
    }
  }

  const startEditing = (nota: NotaInteresado) => {
    setEditingNotaId(nota.id)
    setEditingContent(nota.contenido || '')
  }

  const cancelEditing = () => {
    setEditingNotaId(null)
    setEditingContent('')
  }

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Cargando...</p>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    )
  }

  if (!interesado) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center py-12">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                Interesado no encontrado
              </h1>
              <button
                onClick={() => router.push('/interesados')}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Volver a Interesados
              </button>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    )
  }

  const vehiculos = interesado.vehiculosInteres
    ? (() => {
        try {
          return JSON.parse(interesado.vehiculosInteres)
        } catch {
          return []
        }
      })()
    : []

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => router.push('/interesados')}
              className="text-gray-500 hover:text-gray-700 mb-2 flex items-center"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Volver a Interesados
            </button>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">
              {capitalizeText(interesado.nombre)}{' '}
              {capitalizeText(interesado.apellidos)}
            </h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Información Principal */}
            <div className="lg:col-span-2 space-y-6">
              {/* Datos Básicos */}
              <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Información Personal
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Teléfono</p>
                    <p className="font-medium text-gray-900">
                      {interesado.telefono}
                    </p>
                  </div>
                  {interesado.createdAt && (
                    <div>
                      <p className="text-sm text-gray-500">Fecha de registro</p>
                      <p className="font-medium text-gray-900">
                        {new Date(interesado.createdAt).toLocaleDateString(
                          'es-ES'
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Intereses */}
              <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Intereses
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">
                      Vehículos de interés
                    </p>
                    <div className="font-medium text-gray-900">
                      {vehiculos && vehiculos.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {vehiculos.map((vehiculo: string, index: number) => (
                            <span
                              key={index}
                              className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium"
                            >
                              {vehiculo}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-500">No especificado</span>
                      )}
                    </div>
                  </div>
                  {interesado.presupuestoMaximo && (
                    <div>
                      <p className="text-sm text-gray-500">Precio máximo</p>
                      <p className="font-medium text-gray-900">
                        €{interesado.presupuestoMaximo.toLocaleString()}
                      </p>
                    </div>
                  )}
                  {interesado.kilometrajeMaximo && (
                    <div>
                      <p className="text-sm text-gray-500">
                        Kilometraje máximo
                      </p>
                      <p className="font-medium text-gray-900">
                        {interesado.kilometrajeMaximo.toLocaleString()} km
                      </p>
                    </div>
                  )}
                  {interesado.añoMinimo && (
                    <div>
                      <p className="text-sm text-gray-500">Año mínimo</p>
                      <p className="font-medium text-gray-900">
                        {interesado.añoMinimo}
                      </p>
                    </div>
                  )}
                  {interesado.combustiblePreferido && (
                    <div>
                      <p className="text-sm text-gray-500">
                        Combustible preferido
                      </p>
                      <p className="font-medium text-gray-900 capitalize">
                        {interesado.combustiblePreferido}
                      </p>
                    </div>
                  )}
                  {interesado.cambioPreferido && (
                    <div>
                      <p className="text-sm text-gray-500">Cambio preferido</p>
                      <p className="font-medium text-gray-900 capitalize">
                        {interesado.cambioPreferido}
                      </p>
                    </div>
                  )}
                  {interesado.formaPagoPreferida && (
                    <div>
                      <p className="text-sm text-gray-500">
                        Forma de pago preferida
                      </p>
                      <p className="font-medium text-gray-900 capitalize">
                        {interesado.formaPagoPreferida}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Notas */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Notas
                </h2>

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
                  {notasInteresado.map((nota) => (
                    <div
                      key={nota.id}
                      className="border border-gray-200 rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {editingNotaId === nota.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingContent || ''}
                                onChange={(e) =>
                                  setEditingContent(e.target.value)
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                rows={3}
                              />
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleEditarNota(nota.id)}
                                  className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                >
                                  Guardar
                                </button>
                                <button
                                  onClick={cancelEditing}
                                  className="px-3 py-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p className="text-gray-900 whitespace-pre-wrap">
                                {nota.contenido}
                              </p>
                              <p className="text-xs text-gray-500 mt-2">
                                {new Date(nota.fecha).toLocaleString('es-ES')}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex space-x-2 ml-2">
                          {editingNotaId !== nota.id && (
                            <>
                              <button
                                onClick={() => startEditing(nota)}
                                className="text-blue-600 hover:text-blue-800"
                                title="Editar nota"
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
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleEliminarNota(nota.id)}
                                className="text-red-600 hover:text-red-800"
                                title="Eliminar nota"
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
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {notasInteresado.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-4">
                    No hay notas aún
                  </p>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Resumen
                </h3>
                <div className="space-y-3">
                  {interesado.createdAt && (
                    <div>
                      <p className="text-sm text-gray-500">Registrado el</p>
                      <p className="font-medium text-gray-900">
                        {new Date(interesado.createdAt).toLocaleDateString(
                          'es-ES'
                        )}
                      </p>
                    </div>
                  )}
                  {interesado.updatedAt && (
                    <div>
                      <p className="text-sm text-gray-500">
                        Última actualización
                      </p>
                      <p className="font-medium text-gray-900">
                        {new Date(interesado.updatedAt).toLocaleDateString(
                          'es-ES'
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
      <ToastContainer />
    </ProtectedRoute>
  )
}
