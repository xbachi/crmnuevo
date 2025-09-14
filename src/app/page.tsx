'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import RemindersList from '@/components/RemindersList'
import DashboardReminders from '@/components/DashboardReminders'

interface DashboardStats {
  totalVehiculos: number
  vehiculosEnStock: number
  vehiculosVendidos: number
  totalInversores: number
  capitalInvertido: number
  beneficioTotal: number
  vehiculosItvVencida: number
}


export default function Home() {
  const [stats, setStats] = useState<DashboardStats>({
    totalVehiculos: 0,
    vehiculosEnStock: 0,
    vehiculosVendidos: 0,
    totalInversores: 0,
    capitalInvertido: 0,
    beneficioTotal: 0,
    vehiculosItvVencida: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Simular carga de datos - en una implementación real, harías llamadas a la API
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      setStats({
        totalVehiculos: 47,
        vehiculosEnStock: 23,
        vehiculosVendidos: 24,
        totalInversores: 5,
        capitalInvertido: 450000,
        beneficioTotal: 85000,
        vehiculosItvVencida: 3
      })


      setIsLoading(false)
    } catch (error) {
      console.error('Error loading dashboard data:', error)
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
                <h3 className="text-sm font-medium text-gray-700 mb-3">Recordatorios Manuales</h3>
                <RemindersList maxItems={5} className="mb-4" />
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
                      <h3 className="font-medium">Kanban</h3>
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
                      <p className="text-sm text-gray-600">Total</p>
                      <p className="text-xl font-bold text-gray-900">{stats.totalVehiculos}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold">✅</span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">En Stock</p>
                      <p className="text-xl font-bold text-gray-900">{stats.vehiculosEnStock}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold">💰</span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Vendidos</p>
                      <p className="text-xl font-bold text-gray-900">{stats.vehiculosVendidos}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Resumen Financiero */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumen Financiero</h2>
              
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Capital Invertido</span>
                    <span className="font-bold text-gray-900">€{stats.capitalInvertido.toLocaleString()}</span>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Beneficio Total</span>
                    <span className="font-bold text-green-600">€{stats.beneficioTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Inversores Activos</span>
                    <span className="font-bold text-gray-900">{stats.totalInversores}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Gráfico Simple */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Ventas por Mes</h2>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Enero</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{width: '75%'}}></div>
                    </div>
                    <span className="text-sm font-medium">6</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Febrero</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{width: '60%'}}></div>
                    </div>
                    <span className="text-sm font-medium">5</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Marzo</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full" style={{width: '90%'}}></div>
                    </div>
                    <span className="text-sm font-medium">7</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}