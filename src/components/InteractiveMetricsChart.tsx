'use client'

import React, { useState, useEffect } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { useSimpleToast } from '@/hooks/useSimpleToast'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

interface MetricsData {
  vehiculosVendidos: number
  enStock: number
  depositos: number
  enProceso: number
}

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

interface InteractiveMetricsChartProps {
  data: MetricsData
}

export default function InteractiveMetricsChart({
  data: initialData,
}: InteractiveMetricsChartProps) {
  const { showToast, ToastContainer } = useSimpleToast()
  const [data, setData] = useState<MetricsData>(initialData)
  const [periodoSeleccionado, setPeriodoSeleccionado] =
    useState<PeriodoType>('año')
  const [isLoading, setIsLoading] = useState(false)

  const fetchMetricsData = async (periodo: PeriodoType) => {
    try {
      setIsLoading(true)

      // Fetch datos para el período seleccionado
      const response = await fetch(`/api/metrics?periodo=${periodo}`)
      if (response.ok) {
        const newData = await response.json()
        setData(newData)
      } else {
        // Si no hay API específica, usar los datos iniciales
        setData(initialData)
      }
    } catch (error) {
      console.error('Error fetching metrics data:', error)
      showToast('Error al cargar métricas', 'error')
      setData(initialData)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMetricsData(periodoSeleccionado)
  }, [periodoSeleccionado])
  // Datos para el gráfico de barras
  const barData = {
    labels: ['Vehículos Vendidos', 'En Stock', 'Depósitos', 'En Proceso'],
    datasets: [
      {
        label: 'Cantidad',
        data: [
          data.vehiculosVendidos,
          data.enStock,
          data.depositos,
          data.enProceso,
        ],
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)', // Verde para vendidos
          'rgba(59, 130, 246, 0.8)', // Azul para en stock
          'rgba(168, 85, 247, 0.8)', // Púrpura para depósitos
          'rgba(245, 158, 11, 0.8)', // Amarillo para en proceso
        ],
        borderColor: [
          'rgba(34, 197, 94, 1)',
          'rgba(59, 130, 246, 1)',
          'rgba(168, 85, 247, 1)',
          'rgba(245, 158, 11, 1)',
        ],
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      },
    ],
  }

  // Datos para el gráfico de dona
  const doughnutData = {
    labels: ['Vendidos', 'En Stock', 'Depósitos', 'En Proceso'],
    datasets: [
      {
        data: [
          data.vehiculosVendidos,
          data.enStock,
          data.depositos,
          data.enProceso,
        ],
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(245, 158, 11, 0.8)',
        ],
        borderColor: [
          'rgba(34, 197, 94, 1)',
          'rgba(59, 130, 246, 1)',
          'rgba(168, 85, 247, 1)',
          'rgba(245, 158, 11, 1)',
        ],
        borderWidth: 2,
        cutout: '60%',
      },
    ],
  }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          label: function (context: any) {
            return `${context.label}: ${context.parsed.y} vehículos`
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#6B7280',
          font: {
            size: 12,
            weight: '500',
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(107, 114, 128, 0.1)',
        },
        ticks: {
          color: '#6B7280',
          font: {
            size: 12,
          },
          callback: function (value: any) {
            return Number.isInteger(value) ? value : null
          },
        },
      },
    },
    animation: {
      duration: 1000,
      easing: 'easeInOutQuart' as const,
    },
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true,
          pointStyle: 'circle',
          color: '#374151',
          font: {
            size: 12,
            weight: '500',
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          label: function (context: any) {
            const total = context.dataset.data.reduce(
              (a: number, b: number) => a + b,
              0
            )
            const percentage = ((context.parsed / total) * 100).toFixed(1)
            return `${context.label}: ${context.parsed} (${percentage}%)`
          },
        },
      },
    },
    animation: {
      duration: 1000,
      easing: 'easeInOutQuart' as const,
    },
    cutout: '60%',
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end mb-6">
        <div className="flex items-center space-x-4">
          <select
            value={periodoSeleccionado}
            onChange={(e) =>
              setPeriodoSeleccionado(e.target.value as PeriodoType)
            }
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          >
            {PERIODOS.map((periodo) => (
              <option key={periodo.value} value={periodo.value}>
                {periodo.label}
              </option>
            ))}
          </select>

          <div className="flex items-center space-x-2">
            <div
              className={`w-3 h-3 rounded-full ${isLoading ? 'bg-yellow-500' : 'bg-green-500'}`}
            ></div>
            <span className="text-sm text-gray-600">
              {isLoading ? 'Cargando...' : 'Tiempo real'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de barras */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <h4 className="text-sm font-medium text-gray-700">
              Distribución por Categoría
            </h4>
          </div>
          <div className="h-64">
            <Bar data={barData} options={barOptions} />
          </div>
        </div>

        {/* Gráfico de dona */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-purple-500 rounded-full"></div>
            <h4 className="text-sm font-medium text-gray-700">
              Proporción Total
            </h4>
          </div>
          <div className="h-64">
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        </div>
      </div>

      {/* Resumen de métricas */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Vendidos</p>
              <p className="text-2xl font-bold text-green-900">
                {data.vehiculosVendidos}
              </p>
            </div>
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">🚗</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">En Stock</p>
              <p className="text-2xl font-bold text-blue-900">{data.enStock}</p>
            </div>
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">📦</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Depósitos</p>
              <p className="text-2xl font-bold text-purple-900">
                {data.depositos}
              </p>
            </div>
            <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">🏪</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-medium">En Proceso</p>
              <p className="text-2xl font-bold text-yellow-900">
                {data.enProceso}
              </p>
            </div>
            <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">⚙️</span>
            </div>
          </div>
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
