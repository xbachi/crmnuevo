'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { capitalizeText } from '@/lib/utils'

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

export default function InteresadoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const interesadoId = params.id as string

  const [interesado, setInteresado] = useState<Interesado | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchInteresado()
  }, [interesadoId])

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
    </ProtectedRoute>
  )
}
