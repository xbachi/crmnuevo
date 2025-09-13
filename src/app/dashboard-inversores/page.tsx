'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Inversor } from '@/lib/database'
import Navigation from '@/components/Navigation'
import { InvestorCard } from '@/components/InvestorCard'
import { useSimpleToast } from '@/hooks/useSimpleToast'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'

interface InvestorSummary {
  id: number
  nombre: string
  totalVehiculos: number
  vehiculosVendidos: number
  vehiculosEnStock: number
  beneficioAcumulado: number
  capitalInvertidoActual: number
  roi: number
}

export default function DashboardInversoresPage() {
  const router = useRouter()
  const { showToast, ToastContainer } = useSimpleToast()
  
  const [inversores, setInversores] = useState<Inversor[]>([])
  const [summaries, setSummaries] = useState<InvestorSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const [searchTerm, setSearchTerm] = useState('')

  const fetchData = async () => {
    try {
      setIsLoading(true)
      
      // Obtener inversores
      const inversoresResponse = await fetch('/api/inversores')
      if (!inversoresResponse.ok) throw new Error('Error al cargar inversores')
      const inversoresData = await inversoresResponse.json()
      setInversores(inversoresData)
      
      // Obtener métricas de cada inversor
      const summariesData = await Promise.all(
        inversoresData.map(async (inversor: Inversor) => {
          try {
            const metricsResponse = await fetch(`/api/inversores/${inversor.id}/metrics`)
            if (!metricsResponse.ok) throw new Error('Error al cargar métricas')
            const metrics = await metricsResponse.json()
            
            return {
              id: inversor.id,
              nombre: inversor.nombre,
              totalVehiculos: metrics.totalVendidos + metrics.totalEnStock,
              vehiculosVendidos: metrics.totalVendidos,
              vehiculosEnStock: metrics.totalEnStock,
              beneficioAcumulado: metrics.beneficioAcumulado,
              capitalInvertidoActual: metrics.capitalInvertidoActual,
              roi: metrics.roi
            }
          } catch (error) {
            console.error(`Error al cargar métricas del inversor ${inversor.id}:`, error)
            return {
              id: inversor.id,
              nombre: inversor.nombre,
              totalVehiculos: 0,
              vehiculosVendidos: 0,
              vehiculosEnStock: 0,
              beneficioAcumulado: 0,
              capitalInvertidoActual: 0,
              roi: 0
            }
          }
        })
      )
      
      setSummaries(summariesData)
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar datos del dashboard', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleViewInvestor = (id: number) => {
    router.push(`/inversores/${id}`)
  }

  const filteredSummaries = summaries.filter(summary =>
    summary.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalBeneficio = summaries.reduce((sum, s) => sum + s.beneficioAcumulado, 0)
  const totalCapital = summaries.reduce((sum, s) => sum + s.capitalInvertidoActual, 0)
  const totalVehiculos = summaries.reduce((sum, s) => sum + s.totalVehiculos, 0)
  const totalVendidos = summaries.reduce((sum, s) => sum + s.vehiculosVendidos, 0)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Dashboard Inversores</h1>
            <p className="text-slate-600">Vista general de todos los inversores</p>
          </div>
          <LoadingSkeleton />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 mb-2">Dashboard Inversores</h1>
              <p className="text-slate-600">Vista general de todos los inversores</p>
            </div>
            <button
              onClick={() => router.push('/inversores')}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              Gestionar Inversores
            </button>
          </div>

          {/* Búsqueda y controles */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
              <input
                type="text"
                placeholder="Buscar inversores..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    viewMode === 'cards' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Cards
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    viewMode === 'list' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Lista
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Métricas generales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Beneficio Total</p>
                <p className="text-2xl font-semibold text-green-600">
                  €{totalBeneficio.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Capital Invertido</p>
                <p className="text-2xl font-semibold text-blue-600">
                  €{totalCapital.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Vehículos</p>
                <p className="text-2xl font-semibold text-purple-600">{totalVehiculos}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Vendidos</p>
                <p className="text-2xl font-semibold text-orange-600">{totalVendidos}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Lista de inversores */}
        {filteredSummaries.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron inversores' : 'No hay inversores registrados'}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm 
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza creando tu primer inversor'
              }
            </p>
            {!searchTerm && (
              <button
                onClick={() => router.push('/inversores')}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
              >
                Crear Primer Inversor
              </button>
            )}
          </div>
        ) : (
          <div className={
            viewMode === 'cards' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'space-y-4'
          }>
            {filteredSummaries.map((summary) => (
              <div
                key={summary.id}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleViewInvestor(summary.id)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{summary.nombre}</h3>
                    <p className="text-sm text-gray-500">Inversor</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">ROI</p>
                    <p className={`text-lg font-semibold ${summary.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {summary.roi.toFixed(1)}%
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Total Vehículos</p>
                    <p className="font-semibold text-gray-900">{summary.totalVehiculos}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Vendidos</p>
                    <p className="font-semibold text-gray-900">{summary.vehiculosVendidos}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">En Stock</p>
                    <p className="font-semibold text-gray-900">{summary.vehiculosEnStock}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Beneficio</p>
                    <p className={`font-semibold ${summary.beneficioAcumulado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      €{summary.beneficioAcumulado.toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500 text-center">Haz clic para ver detalles</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <ToastContainer />
    </div>
  )
}
