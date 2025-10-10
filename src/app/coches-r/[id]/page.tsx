'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { capitalizeText } from '@/lib/utils'

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  color: string
  año: number
  kms: number
  precioCompra: number
  precioVenta: number
  estado: string
  tipo: string
  tipo_vehiculo: string
  fechaCompra: string
  fechaMatriculacion: string
  combustible: string
  cambio: string
  potencia: number
  cilindrada: number
  itv: string
  createdAt: string
  updatedAt: string
}

interface Cliente {
  id: number
  nombre: string
  apellidos: string
  dni: string
  telefono: string
  email: string
  direccion: string
}

export default function CocheRDetailPage() {
  const params = useParams()
  const router = useRouter()
  const vehiculoId = params.id as string

  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showContratoModal, setShowContratoModal] = useState(false)
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [clienteSearchTerm, setClienteSearchTerm] = useState('')
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const [precioVenta, setPrecioVenta] = useState('')
  const [isGeneratingContrato, setIsGeneratingContrato] = useState(false)

  useEffect(() => {
    if (vehiculoId) {
      fetchCocheR()
    }
  }, [vehiculoId])

  const fetchCocheR = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch(`/api/coches-r/${vehiculoId}`)
      if (response.ok) {
        const data = await response.json()
        setVehiculo(data)
      } else {
        setError('Error al cargar Coche R')
      }
    } catch (error) {
      console.error('Error fetching Coche R:', error)
      setError('Error al cargar Coche R')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchClientes = async (searchTerm: string) => {
    if (searchTerm.length < 2) return []

    try {
      const response = await fetch(
        `/api/clientes?search=${encodeURIComponent(searchTerm)}`
      )
      if (response.ok) {
        return await response.json()
      }
      return []
    } catch (error) {
      console.error('Error fetching clientes:', error)
      return []
    }
  }

  const handleClienteSearch = async (term: string) => {
    setClienteSearchTerm(term)
    if (term.length >= 2) {
      const clientes = await fetchClientes(term)
      setShowClienteDropdown(clientes.length > 0)
    } else {
      setShowClienteDropdown(false)
    }
  }

  const handleSelectCliente = (cliente: Cliente) => {
    setSelectedCliente(cliente)
    setClienteSearchTerm(
      `${capitalizeText(cliente.nombre)} ${capitalizeText(cliente.apellidos)}`
    )
    setShowClienteDropdown(false)
  }

  const handleGenerarContrato = async () => {
    if (!selectedCliente || !precioVenta) {
      alert('Por favor selecciona un cliente e ingresa el precio de venta')
      return
    }

    setIsGeneratingContrato(true)
    try {
      const response = await fetch('/api/coches-r/generar-contrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehiculoId: vehiculo?.id,
          clienteId: selectedCliente.id,
          precioVenta: parseFloat(precioVenta),
        }),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `contrato-coche-r-${vehiculo?.referencia}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)

        setShowContratoModal(false)
        setSelectedCliente(null)
        setClienteSearchTerm('')
        setPrecioVenta('')
      } else {
        alert('Error al generar el contrato')
      }
    } catch (error) {
      console.error('Error generating contract:', error)
      alert('Error al generar el contrato')
    } finally {
      setIsGeneratingContrato(false)
    }
  }

  const formatVehicleReference = (referencia: string, tipo: string) => {
    if (tipo === 'R') {
      return `R-${referencia}`
    }
    return `#${referencia}`
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'PUBLICADO':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'RESERVADO':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'VENDIDO':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'EN_PROCESO':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case 'PUBLICADO':
        return 'Disponible'
      case 'RESERVADO':
        return 'Reservado'
      case 'VENDIDO':
        return 'Vendido'
      case 'EN_PROCESO':
        return 'En Proceso'
      default:
        return estado
    }
  }

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="w-[85%] mx-auto">
            <LoadingSkeleton />
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (error || !vehiculo) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="w-[85%] mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error || 'Coche R no encontrado'}</p>
              <button
                onClick={() => router.back()}
                className="mt-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="w-[85%] mx-auto">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
              <div>
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                  {formatVehicleReference(vehiculo.referencia, vehiculo.tipo)} -{' '}
                  {capitalizeText(vehiculo.marca)}{' '}
                  {capitalizeText(vehiculo.modelo)}
                </h1>
                <p className="text-sm text-gray-600">
                  Coche R - Vendido "en el estado"
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium border ${getEstadoColor(vehiculo.estado)}`}
                >
                  {getEstadoLabel(vehiculo.estado)}
                </span>
                <button
                  onClick={() => setShowContratoModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span>Generar Contrato Venta</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-10 gap-6">
            {/* Contenido principal */}
            <div className="2xl:col-span-7">
              {/* Información General */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Información General
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Identificación */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                      Identificación
                    </h3>
                    <div className="space-y-2">
                      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2">
                        <span className="text-sm text-gray-600">Marca:</span>
                        <span className="text-sm lg:text-base font-medium text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 capitalize">
                          {capitalizeText(vehiculo.marca)}
                        </span>
                      </div>
                      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2">
                        <span className="text-sm text-gray-600">Modelo:</span>
                        <span className="text-sm lg:text-base font-medium text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 capitalize">
                          {capitalizeText(vehiculo.modelo)}
                        </span>
                      </div>
                      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2">
                        <span className="text-sm text-gray-600">Año:</span>
                        <span className="text-sm lg:text-base font-medium text-blue-900 bg-white border border-blue-300 rounded px-2 py-1">
                          {vehiculo.año}
                        </span>
                      </div>
                      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2">
                        <span className="text-sm text-gray-600">Color:</span>
                        <span className="text-sm lg:text-base font-medium text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 capitalize">
                          {capitalizeText(vehiculo.color)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Documentación */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                      Documentación
                    </h3>
                    <div className="space-y-2">
                      <div className="flex flex-col gap-2">
                        <span className="text-sm text-gray-600">
                          Matrícula:
                        </span>
                        <span className="text-sm lg:text-base font-medium text-green-900 bg-white border border-green-300 rounded px-2 py-1 font-mono uppercase">
                          {vehiculo.matricula}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-sm text-gray-600">Bastidor:</span>
                        <span className="text-sm lg:text-base font-medium text-green-900 bg-white border border-green-300 rounded px-2 py-1 font-mono font-bold">
                          {vehiculo.bastidor}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Características */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                      Características
                    </h3>
                    <div className="space-y-2">
                      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2">
                        <span className="text-sm text-gray-600">
                          Combustible:
                        </span>
                        <span className="text-sm lg:text-base font-medium text-purple-900 bg-white border border-purple-300 rounded px-2 py-1 capitalize">
                          {capitalizeText(vehiculo.combustible)}
                        </span>
                      </div>
                      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2">
                        <span className="text-sm text-gray-600">Cambio:</span>
                        <span className="text-sm lg:text-base font-medium text-purple-900 bg-white border border-purple-300 rounded px-2 py-1 capitalize">
                          {capitalizeText(vehiculo.cambio)}
                        </span>
                      </div>
                      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2">
                        <span className="text-sm text-gray-600">Potencia:</span>
                        <span className="text-sm lg:text-base font-medium text-purple-900 bg-white border border-purple-300 rounded px-2 py-1">
                          {vehiculo.potencia} CV
                        </span>
                      </div>
                      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2">
                        <span className="text-sm text-gray-600">
                          Cilindrada:
                        </span>
                        <span className="text-sm lg:text-base font-medium text-purple-900 bg-white border border-purple-300 rounded px-2 py-1">
                          {vehiculo.cilindrada} cc
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Información Financiera */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Información Financiera
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                      Precios
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">
                          Precio Compra:
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {vehiculo.precioCompra.toLocaleString()}€
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">
                          Precio Venta:
                        </span>
                        <span className="text-sm font-bold text-red-600">
                          {vehiculo.precioVenta.toLocaleString()}€
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Margen:</span>
                        <span className="text-sm font-medium text-green-600">
                          {(
                            vehiculo.precioVenta - vehiculo.precioCompra
                          ).toLocaleString()}
                          €
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                      Detalles
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">
                          Kilometraje:
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {vehiculo.kms.toLocaleString()} km
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">
                          ITV Vencimiento:
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {vehiculo.itv || 'No especificado'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="2xl:col-span-3 max-w-[400px]">
              <div className="space-y-6">
                {/* Estado */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                    Estado Actual
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Estado:</span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium border ${getEstadoColor(vehiculo.estado)}`}
                      >
                        {getEstadoLabel(vehiculo.estado)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Tipo:</span>
                      <span className="text-sm font-medium text-red-600">
                        Coche R
                      </span>
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                    Acciones
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowContratoModal(true)}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span>Generar Contrato</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Generación de Contrato */}
      {showContratoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Generar Contrato de Venta
                </h3>
                <button
                  onClick={() => setShowContratoModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Selección de Cliente */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cliente *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar cliente..."
                      value={clienteSearchTerm}
                      onChange={(e) => handleClienteSearch(e.target.value)}
                      onFocus={() => setShowClienteDropdown(true)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    />
                    {showClienteDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {/* Aquí se cargarían los clientes */}
                      </div>
                    )}
                  </div>
                  {selectedCliente && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-800">
                        Cliente seleccionado:{' '}
                        {capitalizeText(selectedCliente.nombre)}{' '}
                        {capitalizeText(selectedCliente.apellidos)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Precio de Venta */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Precio de Venta (€) *
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={precioVenta}
                    onChange={(e) => setPrecioVenta(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>

                {/* Botones */}
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => setShowContratoModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleGenerarContrato}
                    disabled={
                      isGeneratingContrato || !selectedCliente || !precioVenta
                    }
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingContrato ? 'Generando...' : 'Generar Contrato'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  )
}
