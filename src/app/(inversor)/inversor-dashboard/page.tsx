'use client'

import { useState, useEffect } from 'react'
import { useInversorAuth } from '@/contexts/InversorAuthContext'
import InversorProtectedRoute from '@/components/InversorProtectedRoute'
import { InvestorMetrics } from '@/components/InvestorMetrics'
import { InvestorVehicleCard } from '@/components/InvestorVehicleCard'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { formatDateTime } from '@/lib/utils'

interface InvestorMetrics {
  beneficioAcumulado: number
  capitalInvertido: number
  capitalAportado: number
  capitalDisponible: number
  roi: number
  totalEnStock: number
  diasPromedioEnStock: number
}

export default function InversorDashboardPage() {
  const { inversor } = useInversorAuth()
  const [metrics, setMetrics] = useState<InvestorMetrics | null>(null)
  const [vehiculos, setVehiculos] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (inversor) {
      fetchInversorData()
    }
  }, [inversor])

  const fetchInversorData = async () => {
    if (!inversor) return

    try {
      setIsLoading(true)

      // Obtener métricas del inversor
      const metricsResponse = await fetch(
        `/api/inversores/${inversor.id}/metrics`
      )
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json()
        setMetrics(metricsData)
      }

      // Obtener vehículos del inversor
      const vehiculosResponse = await fetch(
        `/api/inversores/${inversor.id}/vehiculos`
      )
      if (vehiculosResponse.ok) {
        const vehiculosData = await vehiculosResponse.json()
        setVehiculos(vehiculosData)
      }
    } catch (error) {
      console.error('Error fetching inversor data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <InversorProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
          <main className="max-w-7xl mx-auto px-6 py-8">
            <LoadingSkeleton />
          </main>
        </div>
      </InversorProtectedRoute>
    )
  }

  return (
    <InversorProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        {/* Header con información del inversor */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    Bienvenido, {inversor?.nombre}
                  </h1>
                  <p className="text-gray-600 text-sm">
                    Portal de Inversores - Seven Cars Motors
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem('inversor')
                  window.location.href = '/inversor-login'
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">
          {/* Métricas del inversor */}
          {metrics && (
            <div className="mb-8">
              <InvestorMetrics metrics={metrics} />
            </div>
          )}

          {/* Vehículos del inversor */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Mis Vehículos ({vehiculos.length})
              </h2>
            </div>

            {vehiculos.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14-7v16l-2-2v-12a2 2 0 00-2-2H9a2 2 0 00-2 2v12l-2 2V4a2 2 0 012-2h10a2 2 0 012 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No tienes vehículos asignados
                </h3>
                <p className="text-gray-500">
                  Contacta con el administrador para más información
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vehiculos.map((vehiculo) => (
                  <InvestorVehicleCard key={vehiculo.id} vehiculo={vehiculo} />
                ))}
              </div>
            )}
          </div>

          {/* Información adicional */}
          <div className="mt-8 bg-blue-50 rounded-xl border border-blue-200 p-6">
            <div className="flex items-start space-x-3">
              <svg
                className="w-6 h-6 text-blue-600 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-blue-800 mb-1">
                  Información importante
                </h3>
                <p className="text-sm text-blue-700">
                  Esta es una vista de solo lectura de tu información como
                  inversor. Si necesitas realizar cambios o tienes preguntas,
                  contacta con el administrador del sistema.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </InversorProtectedRoute>
  )
}
