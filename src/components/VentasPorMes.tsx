'use client'

import { useState, useEffect } from 'react'
import { useSimpleToast } from '@/hooks/useSimpleToast'

interface VentasPorMes {
  mes: string
  año: number
  cantidad: number
}

export default function VentasPorMes() {
  const { showToast, ToastContainer } = useSimpleToast()
  const [ventas, setVentas] = useState<VentasPorMes[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [periodo, setPeriodo] = useState<'mes_actual' | 'mes_anterior' | 'ultimos_3_meses' | 'ultimos_6_meses' | 'año'>('mes_actual')

  const fetchVentas = async (periodoSeleccionado: string) => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/ventas?periodo=${periodoSeleccionado}`)
      if (response.ok) {
        const data = await response.json()
        setVentas(data)
      } else {
        showToast('Error al cargar ventas', 'error')
      }
    } catch (error) {
      console.error('Error fetching ventas:', error)
      showToast('Error al cargar ventas', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchVentas(periodo)
  }, [periodo])

  const getPeriodoLabel = (periodo: string) => {
    switch (periodo) {
      case 'mes_actual': return 'Mes Actual'
      case 'mes_anterior': return 'Mes Anterior'
      case 'ultimos_3_meses': return 'Últimos 3 Meses'
      case 'ultimos_6_meses': return 'Últimos 6 Meses'
      case 'año': return 'Año Actual'
      default: return 'Mes Actual'
    }
  }

  const formatMes = (mes: string) => {
    const [año, mesNum] = mes.split('-')
    const fecha = new Date(parseInt(año), parseInt(mesNum) - 1)
    return fecha.toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long' 
    })
  }

  const getMaxCantidad = () => {
    return Math.max(...ventas.map(v => v.cantidad), 1)
  }

  const getBarColor = (index: number) => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-indigo-500']
    return colors[index % colors.length]
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Ventas por Mes</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Ventas por Mes</h2>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as any)}
          className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="mes_actual">Mes Actual</option>
          <option value="mes_anterior">Mes Anterior</option>
          <option value="ultimos_3_meses">Últimos 3 Meses</option>
          <option value="ultimos_6_meses">Últimos 6 Meses</option>
          <option value="año">Año Actual</option>
        </select>
      </div>
      
      {ventas.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No hay ventas en el período seleccionado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ventas.map((venta, index) => (
            <div key={`${venta.año}-${venta.mes}`} className="flex items-center justify-between">
              <span className="text-sm text-gray-600 min-w-0 flex-1">
                {formatMes(venta.mes)}
              </span>
              <div className="flex items-center space-x-2 flex-1 max-w-32">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${getBarColor(index)}`}
                    style={{width: `${(venta.cantidad / getMaxCantidad()) * 100}%`}}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900 min-w-0">
                  {venta.cantidad}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ToastContainer />
    </div>
  )
}
