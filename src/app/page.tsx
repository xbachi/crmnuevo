'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface DashboardStats {
  totalVehiculos: number
  vehiculosEnStock: number
  vehiculosVendidos: number
  totalInversores: number
  capitalInvertido: number
  beneficioTotal: number
  vehiculosItvVencida: number
}

interface VehiculoItvVencida {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
}

interface Reminder {
  id: number
  title: string
  description: string
  type: 'warning' | 'info' | 'success' | 'urgent'
  date?: string
  priority: 'high' | 'medium' | 'low'
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
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [vehiculosItvVencida, setVehiculosItvVencida] = useState<VehiculoItvVencida[]>([])
  const [showItvDetails, setShowItvDetails] = useState(false)
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

      // Simular datos de vehículos con ITV vencida
      setVehiculosItvVencida([
        {
          id: 1,
          referencia: "#100",
          marca: "Audi",
          modelo: "A4",
          matricula: "5678ABC"
        },
        {
          id: 2,
          referencia: "#101",
          marca: "BMW",
          modelo: "X3",
          matricula: "1234DEF"
        },
        {
          id: 3,
          referencia: "#102",
          marca: "Mercedes",
          modelo: "C-Class",
          matricula: "9876GHI"
        }
      ])

      setReminders([
        {
          id: 1,
          title: 'ITV Vencida',
          description: `${stats.vehiculosItvVencida} vehículos tienen la ITV vencida y necesitan renovación`,
          type: 'urgent',
          priority: 'high'
        },
        {
          id: 2,
          title: 'Seguro por Vencer',
          description: '5 vehículos tienen el seguro próximo a vencer en los próximos 30 días',
          type: 'warning',
          priority: 'medium'
        },
        {
          id: 3,
          title: 'Revisión Mecánica',
          description: 'Audi A4 (Ref: #100) requiere revisión mecánica programada',
          type: 'info',
          priority: 'medium'
        },
        {
          id: 4,
          title: 'Documentación Pendiente',
          description: '2 vehículos necesitan documentación adicional',
          type: 'info',
          priority: 'low'
        }
      ])

      setIsLoading(false)
    } catch (error) {
      console.error('Error loading dashboard data:', error)
      setIsLoading(false)
    }
  }

  const getReminderIcon = (type: string) => {
    switch (type) {
      case 'urgent':
        return '🚨'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
      case 'success':
        return '✅'
      default:
        return '📋'
    }
  }

  const getReminderColor = (type: string) => {
    switch (type) {
      case 'urgent':
        return 'border-red-200 bg-red-50'
      case 'warning':
        return 'border-yellow-200 bg-yellow-50'
      case 'info':
        return 'border-blue-200 bg-blue-50'
      case 'success':
        return 'border-green-200 bg-green-50'
      default:
        return 'border-gray-200 bg-gray-50'
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
                <span className="text-sm text-gray-500">{reminders.length} pendientes</span>
              </div>
              
              <div className="space-y-4">
                {reminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className={`p-4 rounded-lg border-l-4 ${getReminderColor(reminder.type)} ${
                      reminder.id === 1 ? 'cursor-pointer hover:bg-opacity-80 transition-all duration-200' : ''
                    }`}
                    onClick={reminder.id === 1 ? () => setShowItvDetails(!showItvDetails) : undefined}
                  >
                    <div className="flex items-start space-x-3">
                      <span className="text-xl">{getReminderIcon(reminder.type)}</span>
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{reminder.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{reminder.description}</p>
                        {reminder.id === 1 && showItvDetails && (
                          <div className="mt-3 p-3 bg-red-100 rounded-lg border border-red-200">
                            <h4 className="text-sm font-medium text-red-800 mb-2">Vehículos con ITV vencida:</h4>
                            <div className="space-y-2">
                              {vehiculosItvVencida.map((vehiculo) => (
                                <div key={vehiculo.id} className="text-sm text-red-700 bg-white rounded px-2 py-1">
                                  {vehiculo.referencia} - {vehiculo.marca} {vehiculo.modelo} ({vehiculo.matricula})
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        reminder.priority === 'high' 
                          ? 'bg-red-100 text-red-800' 
                          : reminder.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {reminder.priority === 'high' ? 'Alta' : reminder.priority === 'medium' ? 'Media' : 'Baja'}
                      </span>
                    </div>
                  </div>
                ))}
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