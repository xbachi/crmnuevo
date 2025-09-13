'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/Navigation'

interface Cliente {
  id: number
  nombre: string
  apellidos: string
  telefono: string
  email?: string
  estado: 'nuevo' | 'en_seguimiento' | 'cita_agendada' | 'cerrado' | 'descartado'
  prioridad: 'alta' | 'media' | 'baja'
  fechaPrimerContacto: string
  intereses: {
    vehiculoPrincipal: string
    precioMaximo: number
    combustiblePreferido: string
    cambioPreferido: string
  }
  proximoPaso?: string
  etiquetas: string[]
}

interface Metricas {
  totalClientes: number
  clientesNuevos: number
  clientesEnSeguimiento: number
  clientesCerrados: number
  tasaConversion: number
  clientesAltaPrioridad: number
  clientesSinContacto: number
  promedioPrecioMaximo: number
  topVehiculos: Array<{ vehiculo: string; count: number }>
  distribucionEstados: Array<{ estado: string; count: number; porcentaje: number }>
  tendenciaMensual: Array<{ mes: string; nuevos: number; cerrados: number }>
}

export default function DashboardClientes() {
  const router = useRouter()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [periodo, setPeriodo] = useState('30') // días

  useEffect(() => {
    fetchClientes()
  }, [periodo])

  const fetchClientes = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/clientes')
      if (response.ok) {
        const data = await response.json()
        setClientes(data)
        calcularMetricas(data)
      }
    } catch (error) {
      console.error('Error al cargar clientes:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const calcularMetricas = (clientesData: Cliente[]) => {
    const ahora = new Date()
    const diasAtras = parseInt(periodo)
    const fechaLimite = new Date(ahora.getTime() - diasAtras * 24 * 60 * 60 * 1000)

    // Filtros por período
    const clientesPeriodo = clientesData.filter(cliente => 
      new Date(cliente.fechaPrimerContacto) >= fechaLimite
    )

    // Cálculos básicos
    const totalClientes = clientesData.length
    const clientesNuevos = clientesData.filter(c => c.estado === 'nuevo').length
    const clientesEnSeguimiento = clientesData.filter(c => c.estado === 'en_seguimiento').length
    const clientesCerrados = clientesData.filter(c => c.estado === 'cerrado').length
    const clientesAltaPrioridad = clientesData.filter(c => c.prioridad === 'alta').length

    // Tasa de conversión
    const tasaConversion = totalClientes > 0 ? (clientesCerrados / totalClientes) * 100 : 0

    // Clientes sin contacto (más de 7 días)
    const sieteDiasAtras = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000)
    const clientesSinContacto = clientesData.filter(c => 
      new Date(c.fechaPrimerContacto) < sieteDiasAtras && 
      c.estado !== 'cerrado' && 
      c.estado !== 'descartado'
    ).length

    // Precio promedio
    const precios = clientesData
      .filter(c => c.intereses.precioMaximo > 0)
      .map(c => c.intereses.precioMaximo)
    const promedioPrecioMaximo = precios.length > 0 
      ? precios.reduce((a, b) => a + b, 0) / precios.length 
      : 0

    // Top vehículos
    const vehiculosCount: { [key: string]: number } = {}
    clientesData.forEach(cliente => {
      if (cliente.intereses.vehiculoPrincipal) {
        vehiculosCount[cliente.intereses.vehiculoPrincipal] = 
          (vehiculosCount[cliente.intereses.vehiculoPrincipal] || 0) + 1
      }
    })
    const topVehiculos = Object.entries(vehiculosCount)
      .map(([vehiculo, count]) => ({ vehiculo, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Distribución por estados
    const estados = ['nuevo', 'en_seguimiento', 'cita_agendada', 'cerrado', 'descartado']
    const distribucionEstados = estados.map(estado => {
      const count = clientesData.filter(c => c.estado === estado).length
      return {
        estado: estado.charAt(0).toUpperCase() + estado.slice(1).replace('_', ' '),
        count,
        porcentaje: totalClientes > 0 ? (count / totalClientes) * 100 : 0
      }
    })

    // Tendencia mensual (últimos 6 meses)
    const tendenciaMensual = []
    for (let i = 5; i >= 0; i--) {
      const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
      const mesSiguiente = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 1)
      
      const nuevos = clientesData.filter(c => {
        const fechaCliente = new Date(c.fechaPrimerContacto)
        return fechaCliente >= fecha && fechaCliente < mesSiguiente
      }).length

      const cerrados = clientesData.filter(c => {
        const fechaCliente = new Date(c.fechaPrimerContacto)
        return fechaCliente >= fecha && fechaCliente < mesSiguiente && c.estado === 'cerrado'
      }).length

      tendenciaMensual.push({
        mes: fecha.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
        nuevos,
        cerrados
      })
    }

    setMetricas({
      totalClientes,
      clientesNuevos,
      clientesEnSeguimiento,
      clientesCerrados,
      tasaConversion,
      clientesAltaPrioridad,
      clientesSinContacto,
      promedioPrecioMaximo,
      topVehiculos,
      distribucionEstados,
      tendenciaMensual
    })
  }

  const getEstadoColor = (estado: string) => {
    const colors = {
      'Nuevo': 'bg-blue-100 text-blue-800',
      'En seguimiento': 'bg-yellow-100 text-yellow-800',
      'Cita agendada': 'bg-purple-100 text-purple-800',
      'Cerrado': 'bg-green-100 text-green-800',
      'Descartado': 'bg-red-100 text-red-800'
    }
    return colors[estado as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  const getPrioridadColor = (prioridad: string) => {
    const colors = {
      'alta': 'bg-red-100 text-red-800',
      'media': 'bg-yellow-100 text-yellow-800',
      'baja': 'bg-green-100 text-green-800'
    }
    return colors[prioridad as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white p-6 rounded-lg shadow">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-16"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard de Clientes</h1>
              <p className="text-gray-600">Análisis y métricas de gestión de clientes</p>
            </div>
            <div className="flex items-center space-x-4">
              <select
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="7">Últimos 7 días</option>
                <option value="30">Últimos 30 días</option>
                <option value="90">Últimos 90 días</option>
                <option value="365">Último año</option>
              </select>
              <button
                onClick={() => router.push('/clientes')}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Ver Clientes
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Métricas principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Clientes</p>
                <p className="text-2xl font-bold text-gray-900">{metricas?.totalClientes || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Tasa de Conversión</p>
                <p className="text-2xl font-bold text-gray-900">{metricas?.tasaConversion.toFixed(1) || 0}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">En Seguimiento</p>
                <p className="text-2xl font-bold text-gray-900">{metricas?.clientesEnSeguimiento || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Sin Contacto</p>
                <p className="text-2xl font-bold text-gray-900">{metricas?.clientesSinContacto || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Gráficos y análisis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Distribución por estados */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribución por Estados</h3>
            <div className="space-y-3">
              {metricas?.distribucionEstados.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(item.estado)}`}>
                      {item.estado}
                    </span>
                    <span className="text-sm text-gray-600">{item.count} clientes</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full" 
                        style={{ width: `${item.porcentaje}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12 text-right">
                      {item.porcentaje.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top vehículos */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Vehículos Más Demandados</h3>
            <div className="space-y-3">
              {metricas?.topVehiculos.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{item.vehiculo}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full" 
                        style={{ 
                          width: `${(item.count / (metricas?.topVehiculos[0]?.count || 1)) * 100}%` 
                        }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-8 text-right">
                      {item.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tendencia mensual */}
        <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tendencia Mensual</h3>
          <div className="grid grid-cols-6 gap-4">
            {metricas?.tendenciaMensual.map((item, index) => (
              <div key={index} className="text-center">
                <div className="text-sm font-medium text-gray-900 mb-2">{item.mes}</div>
                <div className="space-y-1">
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs text-gray-600">Nuevos: {item.nuevos}</span>
                  </div>
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-xs text-gray-600">Cerrados: {item.cerrados}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Clientes de alta prioridad */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Clientes de Alta Prioridad</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vehículo de Interés
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Precio Máximo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Próximo Paso
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {clientes
                  .filter(c => c.prioridad === 'alta')
                  .slice(0, 10)
                  .map((cliente) => (
                    <tr key={cliente.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-green-800">
                                {cliente.nombre.charAt(0)}{cliente.apellidos.charAt(0)}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {cliente.nombre} {cliente.apellidos}
                            </div>
                            <div className="text-sm text-gray-500">{cliente.telefono}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(cliente.estado.charAt(0).toUpperCase() + cliente.estado.slice(1).replace('_', ' '))}`}>
                          {cliente.estado.charAt(0).toUpperCase() + cliente.estado.slice(1).replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {cliente.intereses.vehiculoPrincipal || 'No especificado'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        €{cliente.intereses.precioMaximo.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {cliente.proximoPaso || 'No especificado'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
