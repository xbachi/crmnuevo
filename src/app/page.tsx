'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import RemindersList from '@/components/RemindersList'
import DashboardReminders from '@/components/DashboardReminders'
import ManualReminders from '@/components/ManualReminders'
import VentasPorMes from '@/components/VentasPorMes'

interface DashboardStats {
  totalActivos: number
  publicados: number
  enProceso: number
  vehiculosItvVencida: number
}


export default function Home() {
  const [stats, setStats] = useState<DashboardStats>({
    totalActivos: 0,
    publicados: 0,
    enProceso: 0,
    vehiculosItvVencida: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Cargar estadísticas reales de vehículos
      const vehiculoStatsResponse = await fetch('/api/vehiculos/stats')
      if (vehiculoStatsResponse.ok) {
        const vehiculoStats = await vehiculoStatsResponse.json()
        setStats({
          totalActivos: vehiculoStats.totalActivos,
          publicados: vehiculoStats.publicados,
          enProceso: vehiculoStats.enProceso,
          vehiculosItvVencida: 3 // Mantener por ahora, se puede implementar después
        })
      } else {
        // Fallback a datos simulados si hay error
        setStats({
          totalActivos: 47,
          publicados: 23,
          enProceso: 24,
          vehiculosItvVencida: 3
        })
      }

      setIsLoading(false)
    } catch (error) {
      console.error('Error loading dashboard data:', error)
      // Fallback a datos simulados
      setStats({
        totalActivos: 47,
        publicados: 23,
        enProceso: 24,
        vehiculosItvVencida: 3
      })
      setIsLoading(false)
    }
  }


  if (isLoading) {
    return (
      <div className="min-h-full bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-8"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="h-64 bg-gray-200 rounded-lg"></div>
                <div className="h-48 bg-gray-200 rounded-lg"></div>
              </div>
              <div className="space-y-6">
                <div className="h-32 bg-gray-200 rounded-lg"></div>
                <div className="h-48 bg-gray-200 rounded-lg"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Bienvenido a SevenCars CRM - Resumen del día</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recordatorios - Columna Principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recordatorios Importantes */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Recordatorios Importantes</h2>
                <div className="flex items-center gap-4">
                  <Link 
                    href="/deals" 
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Ver todos los deals →
                  </Link>
                </div>
              </div>
              
              {/* Recordatorios específicos del dashboard */}
              <DashboardReminders />
              
              {/* Separador */}
              <div className="border-t border-gray-200 my-6"></div>
              
              {/* Recordatorios manuales (del sistema de recordatorios) */}
              <div className="mb-4">
                <ManualReminders />
              </div>
              
            </div>

            {/* Acciones Rápidas */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Acciones Rápidas</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link
                  href="/cargar-vehiculo"
                  className="group bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg p-4 hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-105"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">➕</span>
                    <div>
                      <h3 className="font-medium">Cargar Vehículo</h3>
                      <p className="text-blue-100 text-sm">Nuevo registro</p>
                    </div>
                  </div>
                </Link>

                <Link
                  href="/vehiculos"
                  className="group bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg p-4 hover:from-green-600 hover:to-green-700 transition-all duration-200 transform hover:scale-105"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">📋</span>
                    <div>
                      <h3 className="font-medium">Ver Vehículos</h3>
                      <p className="text-green-100 text-sm">Gestionar inventario</p>
                    </div>
                  </div>
                </Link>

                <Link
                  href="/kanban"
                  className="group bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg p-4 hover:from-purple-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">📊</span>
                    <div>
                      <h3 className="font-medium">Proceso</h3>
                      <p className="text-purple-100 text-sm">Flujo de trabajo</p>
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {/* Estadísticas - Sidebar */}
          <div className="space-y-6">
            {/* Resumen de Vehículos */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumen de Vehículos</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold">📊</span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Activos</p>
                      <p className="text-xl font-bold text-gray-900">{stats.totalActivos}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold">✅</span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Publicados</p>
                      <p className="text-xl font-bold text-gray-900">{stats.publicados}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold">🔧</span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">En Proceso</p>
                      <p className="text-xl font-bold text-gray-900">{stats.enProceso}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ventas por Mes */}
            <VentasPorMes />
          </div>
        </div>
      </div>
    </div>
  )
}