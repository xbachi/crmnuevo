'use client'

import { useState, useRef } from 'react'
import { Vehiculo } from '@/lib/database'
import { formatDate, formatVehicleReference, formatVehicleReferenceShort } from '@/lib/utils'

interface InvestorVehicleCardProps {
  vehiculo: Vehiculo
  inversor?: {
    id: number
    nombre: string
    email?: string
  } | null
  onView: (id: number) => void
  onEdit?: (vehiculo: Vehiculo) => void
  onEditVehiculo?: (vehiculo: Vehiculo) => void
  onPhotoUpload?: (vehiculoId: number, photoUrl: string) => void
}

export function InvestorVehicleCard({ vehiculo, inversor, onView, onEdit, onEditVehiculo, onPhotoUpload }: InvestorVehicleCardProps) {
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Determinar si es un vehículo de depósito o inversor
  const esDeposito = vehiculo.tipo === 'D' || vehiculo.tipo === 'Deposito Venta'
  const esInversor = vehiculo.tipo === 'I' || vehiculo.tipo === 'Inversor'

  // Helper function para normalizar valores booleanos
  const isPositive = (value: string | boolean | null | undefined): boolean => {
    if (typeof value === 'boolean') return value
    if (!value) return false
    const normalized = value.toString().toLowerCase().trim()
    return normalized === 'si' || normalized === 'sí' || normalized === 'yes' || 
           normalized === 'true' || normalized === '1' || 
           (normalized !== 'no' && normalized !== 'false' && normalized !== '0' && normalized.length > 0)
  }

  // Helper function para normalizar estado vendido
  const isVendido = (estado: string | null | undefined): boolean => {
    if (!estado) return false
    const normalized = estado.toString().toLowerCase().trim()
    return normalized === 'vendido'
  }

  // Debug: mostrar información de la foto
  console.log('Vehiculo fotoInversor:', vehiculo.fotoInversor)
  console.log('Local photo URL:', localPhotoUrl)
  console.log('Image error:', imageError)

  const handlePhotoClick = () => {
    if (vehiculo.fotoInversor || localPhotoUrl) {
      setShowPhotoModal(true)
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !onPhotoUpload) return

    setIsUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = (e) => {
        const photoUrl = e.target?.result as string
        setLocalPhotoUrl(photoUrl)
        onPhotoUpload(vehiculo.id, photoUrl)
        setIsUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error al cargar foto:', error)
      setIsUploading(false)
    }
  }

  const handleImageError = () => {
    setImageError(true)
  }

  const getEstadoColor = (estado: string) => {
    const estados = {
      'REVI_INIC': 'bg-yellow-100 text-yellow-800',
      'MECAUTO': 'bg-blue-100 text-blue-800',
      'REVI_PINTURA': 'bg-orange-100 text-orange-800',
      'PINTURA': 'bg-purple-100 text-purple-800',
      'LIMPIEZA': 'bg-cyan-100 text-cyan-800',
      'FOTOS': 'bg-indigo-100 text-indigo-800',
      'PUBLICADO': 'bg-green-100 text-green-800',
      'vendido': 'bg-emerald-100 text-emerald-800',
      '': 'bg-gray-100 text-gray-800'
    }
    return estados[estado as keyof typeof estados] || 'bg-gray-100 text-gray-800'
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount)
  }

  const calcularDiasEnStock = () => {
    const fechaCompra = vehiculo.fechaCompra ? new Date(vehiculo.fechaCompra) : new Date(vehiculo.createdAt)
    const ahora = new Date()
    const dias = Math.floor((ahora.getTime() - fechaCompra.getTime()) / (1000 * 60 * 60 * 24))
    return dias
  }

  const diasEnStock = calcularDiasEnStock()
  const esVendido = isVendido(vehiculo.estado)
  // Mostrar información básica si el vehículo tiene al menos precio de compra o está vendido
  const tieneDatosFinancieros = vehiculo.precioCompra || (esVendido && (vehiculo.precioVenta || vehiculo.beneficioNeto))

  return (
    <div className={`rounded-xl border shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden bg-white border-gray-200`}>
      {/* Header con estado destacado */}
      <div className={`px-6 py-4 border-b ${
        esDeposito 
          ? 'bg-gradient-to-r from-cyan-200 to-blue-200 border-cyan-300' 
          : esInversor
          ? 'bg-gradient-to-r from-orange-200 to-amber-200 border-orange-300'
          : 'bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200'
      }`}>
        <div className="flex justify-between items-start">
          <div className="flex items-start space-x-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${
              esDeposito 
                ? 'bg-gradient-to-br from-cyan-500 to-blue-600' 
                : esInversor
                ? 'bg-gradient-to-br from-orange-500 to-amber-600'
                : 'bg-gradient-to-br from-purple-500 to-blue-600'
            }`}>
              <span className="text-white font-bold text-sm">
                {formatVehicleReferenceShort(vehiculo.referencia, vehiculo.tipo)}
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900">
                {vehiculo.marca} {vehiculo.modelo}
              </h3>
              {/* Alerta de ITV vencida o info básica */}
              {vehiculo.itv !== null && vehiculo.itv !== undefined && vehiculo.itv !== '' && !isPositive(vehiculo.itv) ? (
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-red-600 rounded-full">
                  <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs text-white font-semibold">ITV VENCIDA</span>
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  Vehículo
                </p>
              )}
              {/* Información del inversor en el header */}
              {inversor && (
                <p className="text-xs text-purple-600 font-medium mt-1">
                  Inversor: {inversor.nombre}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex space-x-1">
            {onEdit && (
              <button
                onClick={() => onEdit(vehiculo)}
                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                title="Editar vehículo"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            <button
              onClick={() => onView(vehiculo.id)}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
              title="Ver detalles"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>


      {/* Estado destacado */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="text-sm font-medium text-gray-700">Estado Actual:</span>
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getEstadoColor(vehiculo.estado)}`}>
              {vehiculo.estado || 'Inicial'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-gray-600">Días en stock:</span>
            <span className="text-sm font-medium text-blue-600">{diasEnStock}</span>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="p-6">
        {/* Información básica del vehículo */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 mb-4 border border-blue-200">
          <div className="space-y-3 text-sm">
            {/* Primera fila: Matrícula y Color */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-gray-600 font-medium">Matrícula:</span>
                <span className="font-semibold text-gray-900">{vehiculo.matricula}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-600 font-medium">Color:</span>
                <span className="font-semibold text-gray-900">{vehiculo.color || 'No especificado'}</span>
              </div>
            </div>
            
            {/* Segunda fila: Fecha de matriculación y KMs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-gray-600 font-medium">Fecha Matriculación:</span>
                <span className="font-semibold text-gray-900">
                  {vehiculo.fechaMatriculacion ? new Date(vehiculo.fechaMatriculacion).toLocaleDateString('es-ES') : 'No especificada'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-600 font-medium">KMs:</span>
                <span className="font-semibold text-gray-900">{vehiculo.kms?.toLocaleString()}</span>
              </div>
            </div>
            
            {/* Tercera fila: Bastidor (ancho completo) */}
            <div className="flex items-center space-x-2">
              <span className="text-gray-600 font-medium">Bastidor:</span>
              <span className="font-semibold text-gray-900 text-xs break-all flex-1">{vehiculo.bastidor}</span>
            </div>
          </div>
        </div>

        {/* Información financiera */}
        <div className="space-y-4">
          {/* Mensaje informativo si faltan datos financieros */}
          {!tieneDatosFinancieros && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">Información financiera pendiente.</span> Completa los datos de precio de compra para ver el análisis completo.
                </p>
              </div>
            </div>
          )}


            {/* Desglose de gastos */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center justify-between">
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Desglose de Gastos
                </div>
                <button
                  onClick={() => onEditVehiculo(vehiculo)}
                  className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-full transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between bg-white rounded px-2 py-1">
                  <span className="text-gray-600">Precio compra:</span>
                  <span className="font-semibold text-gray-900">
                    {vehiculo.precioCompra ? formatCurrency(vehiculo.precioCompra) : '-'}
                  </span>
                </div>
                <div className="flex justify-between bg-white rounded px-2 py-1">
                  <span className="text-gray-600">Transporte:</span>
                  <span className="font-semibold text-gray-900">
                    {vehiculo.gastosTransporte ? formatCurrency(vehiculo.gastosTransporte) : '-'}
                  </span>
                </div>
                <div className="flex justify-between bg-white rounded px-2 py-1">
                  <span className="text-gray-600">Tasas/Gestoría:</span>
                  <span className="font-semibold text-gray-900">
                    {vehiculo.gastosTasas ? formatCurrency(vehiculo.gastosTasas) : '-'}
                  </span>
                </div>
                <div className="flex justify-between bg-white rounded px-2 py-1">
                  <span className="text-gray-600">Mecánica:</span>
                  <span className="font-semibold text-gray-900">
                    {vehiculo.gastosMecanica ? formatCurrency(vehiculo.gastosMecanica) : '-'}
                  </span>
                </div>
                <div className="flex justify-between bg-white rounded px-2 py-1">
                  <span className="text-gray-600">Pintura:</span>
                  <span className="font-semibold text-gray-900">
                    {vehiculo.gastosPintura ? formatCurrency(vehiculo.gastosPintura) : '-'}
                  </span>
                </div>
                <div className="flex justify-between bg-white rounded px-2 py-1">
                  <span className="text-gray-600">Limpieza:</span>
                  <span className="font-semibold text-gray-900">
                    {vehiculo.gastosLimpieza ? formatCurrency(vehiculo.gastosLimpieza) : '-'}
                  </span>
                </div>
                <div className="flex justify-between bg-white rounded px-2 py-1">
                  <span className="text-gray-600">Otros:</span>
                  <span className="font-semibold text-gray-900">
                    {vehiculo.gastosOtros ? formatCurrency(vehiculo.gastosOtros) : '-'}
                  </span>
                </div>
                {esVendido && vehiculo.precioVenta && (
                  <div className="flex justify-between bg-white rounded px-2 py-1">
                    <span className="text-gray-600">Precio venta:</span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(vehiculo.precioVenta)}
                    </span>
                  </div>
                )}
                {esVendido && vehiculo.beneficioNeto !== undefined && (
                  <div className="flex justify-between bg-white rounded px-2 py-1">
                    <span className="text-gray-600">Beneficio:</span>
                    <span className={`font-semibold ${vehiculo.beneficioNeto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(vehiculo.beneficioNeto)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Costo total */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
              <div className="flex justify-between items-center bg-green-100 rounded-lg px-3 py-2 border border-green-300">
                <span className="text-sm font-bold text-green-800">COSTO TOTAL:</span>
                <span className="font-bold text-green-900 text-base">
                  {(() => {
                    const totalGastos = (vehiculo.gastosTransporte || 0) + 
                                      (vehiculo.gastosTasas || 0) + 
                                      (vehiculo.gastosMecanica || 0) + 
                                      (vehiculo.gastosPintura || 0) + 
                                      (vehiculo.gastosLimpieza || 0) + 
                                      (vehiculo.gastosOtros || 0)
                    const precioCompra = vehiculo.precioCompra || 0
                    const costoTotal = precioCompra + totalGastos
                    return formatCurrency(costoTotal)
                  })()}
                </span>
              </div>
            </div>

          </div>

        {/* Foto */}
        <div className="mt-4">
          {vehiculo.fotoInversor || localPhotoUrl ? (
            <div 
              className="cursor-pointer group relative"
              onClick={handlePhotoClick}
            >
              <img 
                src={localPhotoUrl || vehiculo.fotoInversor} 
                alt={`${vehiculo.marca} ${vehiculo.modelo}`}
                className="w-full h-32 object-cover rounded-lg shadow-sm group-hover:shadow-md transition-shadow border border-gray-200"
                onError={(e) => {
                  console.error('Error al cargar imagen:', e)
                  setImageError(true)
                }}
                onLoad={() => {
                  console.log('Imagen cargada correctamente')
                  setImageError(false)
                }}
              />
              <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                Ver grande
              </div>
            </div>
          ) : (
            <div 
              className="bg-gray-100 rounded-lg h-32 flex items-center justify-center border-2 border-dashed border-gray-300 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
              onClick={handlePhotoClick}
            >
              <div className="text-center text-gray-500">
                {isUploading ? (
                  <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500 mb-2"></div>
                    <p className="text-sm font-medium">Cargando...</p>
                  </div>
                ) : (
                  <>
                    <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-medium">Haz clic para cargar foto</p>
                  </>
                )}
              </div>
            </div>
          )}
          
          {/* Input oculto para carga de archivos */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>
      
      {/* Modal para ver foto en grande */}
      {showPhotoModal && vehiculo.fotoInversor && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={() => setShowPhotoModal(false)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img 
              src={vehiculo.fotoInversor} 
              alt={`${vehiculo.marca} ${vehiculo.modelo}`}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
            <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-50 text-white p-3 rounded-lg">
              <p className="text-sm font-medium">{vehiculo.marca} {vehiculo.modelo}</p>
              <p className="text-xs text-gray-300">Haz clic fuera para cerrar</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
