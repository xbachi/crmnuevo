'use client'

interface InvestorMetricsProps {
  metrics: {
    beneficioAcumulado: number
    capitalInvertido: number
    capitalAportado: number
    capitalDisponible: number
    roi: number
    totalVendidos: number
    totalEnStock: number
    diasPromedioEnStock: number
  }
  periodo?: string
  ultimaActualizacion?: string
}

export function InvestorMetrics({ metrics, periodo, ultimaActualizacion }: InvestorMetricsProps) {
  const formatCurrency = (amount: number) => {
    const safeAmount = Number(amount) || 0
    if (isNaN(safeAmount) || safeAmount === undefined || safeAmount === null) {
      return '€0,00'
    }
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(safeAmount)
  }

  const formatPercentage = (value: number) => {
    const safeValue = Number(value) || 0
    if (isNaN(safeValue)) return '0.0%'
    return `${safeValue.toFixed(1)}%`
  }

  return (
    <div className="space-y-6">
      {/* Contadores - Arriba */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">En Stock</p>
            <p className="text-3xl font-bold text-blue-600">{metrics.totalEnStock}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Vendidos</p>
            <p className="text-3xl font-bold text-green-600">{metrics.totalVendidos}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">Días Promedio en Stock</p>
            <p className="text-3xl font-bold text-purple-600">{Math.round(metrics.diasPromedioEnStock)}</p>
          </div>
        </div>
      </div>

      {/* Capital - Franja del medio */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <p className="text-sm font-medium text-gray-500">Capital Aportado</p>
              <p className="text-2xl font-semibold text-orange-600">
                {formatCurrency(metrics.capitalAportado)}
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
                {formatCurrency(metrics.capitalInvertido)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Capital Disponible</p>
              <p className={`text-2xl font-semibold ${metrics.capitalDisponible >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(metrics.capitalDisponible)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Beneficio y ROI - Abajo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <p className="text-sm font-medium text-gray-500">Beneficio Acumulado</p>
              <p className={`text-2xl font-semibold ${metrics.beneficioAcumulado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(metrics.beneficioAcumulado)}
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
              <p className="text-sm font-medium text-gray-500">ROI</p>
              <p className={`text-2xl font-semibold ${metrics.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatPercentage(metrics.roi)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Información del periodo */}
      {(periodo || ultimaActualizacion) && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600">
            {periodo && (
              <p><span className="font-medium">Periodo:</span> {periodo}</p>
            )}
            {ultimaActualizacion && (
              <p><span className="font-medium">Última actualización:</span> {ultimaActualizacion}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
