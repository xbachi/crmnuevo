'use client'

import { useState, useEffect } from 'react'
import { useSimpleToast } from '@/hooks/useSimpleToast'
import {
  derivarVentasStats,
  type VentaMes,
  type VentasStats,
} from '@/lib/ventasPorMes'

type PeriodoType =
  | 'año'
  | '6_meses'
  | '3_meses'
  | 'mes_anterior'
  | 'mes_actual'
  | '7_dias'

const PERIODOS = [
  { value: 'año', label: 'Último año' },
  { value: '6_meses', label: 'Últimos 6 meses' },
  { value: '3_meses', label: 'Últimos 3 meses' },
  { value: 'mes_anterior', label: 'Mes anterior' },
  { value: 'mes_actual', label: 'Mes actual' },
  { value: '7_dias', label: 'Últimos 7 días' },
]

export default function VentasPorMes() {
  const { showToast, ToastContainer } = useSimpleToast()
  const [stats, setStats] = useState<VentasStats>({
    añoActual: 0,
    ultimoMes: 0,
    mesActual: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const fetchVentasStats = async () => {
    try {
      setIsLoading(true)

      // Una sola serie (año en curso + mes anterior aunque cruce de año);
      // año / mes anterior / mes actual se derivan en cliente.
      const response = await fetch('/api/ventas?periodo=13_meses')
      const serie: VentaMes[] = response.ok ? await response.json() : []

      setStats(derivarVentasStats(serie))
    } catch (error) {
      console.error('Error fetching ventas stats:', error)
      showToast('Error al cargar estadísticas de ventas', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchVentasStats()
  }, [])

  const getCurrentYear = () => {
    return new Date().getFullYear()
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="flex gap-3 sm:gap-4">
            <div className="flex-1 h-16 bg-gray-200 rounded-lg"></div>
            <div className="flex-1 h-16 bg-gray-200 rounded-lg"></div>
            <div className="flex-1 h-16 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900">
          Ventas
        </h2>
      </div>

      <div className="flex gap-3 sm:gap-4">
        <div className="flex flex-col lg:flex-col p-3 bg-blue-50 rounded-lg flex-1">
          {/* Layout móvil: icono + texto lado a lado */}
          <div className="flex items-center space-x-2 sm:space-x-3 lg:hidden">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm sm:text-base">
                📅
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-600">Año</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900">
                {stats.añoActual}
              </p>
            </div>
          </div>

          {/* Layout desktop: label arriba, icono y número abajo en 2 columnas */}
          <div className="hidden lg:flex lg:flex-col lg:space-y-3">
            <div className="text-center">
              <p className="text-xs sm:text-sm text-gray-600">Año</p>
            </div>
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm sm:text-base">
                  📅
                </span>
              </div>
              <div className="text-right">
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {stats.añoActual}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-col p-3 bg-orange-50 rounded-lg flex-1">
          {/* Layout móvil: icono + texto lado a lado */}
          <div className="flex items-center space-x-2 sm:space-x-3 lg:hidden">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm sm:text-base">
                📊
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-600">Mes anterior</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900">
                {stats.ultimoMes}
              </p>
            </div>
          </div>

          {/* Layout desktop: label arriba, icono y número abajo en 2 columnas */}
          <div className="hidden lg:flex lg:flex-col lg:space-y-3">
            <div className="text-center">
              <p className="text-xs sm:text-sm text-gray-600">Mes anterior</p>
            </div>
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm sm:text-base">
                  📊
                </span>
              </div>
              <div className="text-right">
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {stats.ultimoMes}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-col p-3 bg-green-50 rounded-lg flex-1">
          {/* Layout móvil: icono + texto lado a lado */}
          <div className="flex items-center space-x-2 sm:space-x-3 lg:hidden">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm sm:text-base">
                ✅
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-600">Mes actual</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900">
                {stats.mesActual}
              </p>
            </div>
          </div>

          {/* Layout desktop: label arriba, icono y número abajo en 2 columnas */}
          <div className="hidden lg:flex lg:flex-col lg:space-y-3">
            <div className="text-center">
              <p className="text-xs sm:text-sm text-gray-600">Mes actual</p>
            </div>
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm sm:text-base">
                  ✅
                </span>
              </div>
              <div className="text-right">
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {stats.mesActual}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
