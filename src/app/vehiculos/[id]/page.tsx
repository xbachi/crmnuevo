'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import { useConfirmModal } from '@/components/ConfirmModal'
import { formatCurrency, formatVehicleReference, formatDate } from '@/lib/utils'

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  tipo: string
  estado: string
  orden: number
  color?: string
  fechaMatriculacion?: string
  año?: number
  combustible?: string
  cambio?: string
  potencia?: number
  cilindrada?: number
  puertas?: number
  plazas?: number
  categoria?: string
  
  // Campos financieros
  precioCompra?: number
  gastosTransporte?: number
  gastosTasas?: number
  gastosMecanica?: number
  gastosPintura?: number
  gastosLimpieza?: number
  gastosOtros?: number
  precioPublicacion?: number
  precioVenta?: number
  beneficioNeto?: number
  
  // Campos de inversor
  esCocheInversor?: boolean
  inversorId?: number
  inversorNombre?: string
  fechaCompra?: string
  notasInversor?: string
  fotoInversor?: string
  
  // Campos de documentación/estado
  itv?: string
  fechaItv?: string
  fechaVencimientoItv?: string
  seguro?: string
  segundaLlave?: string
  carpeta?: string
  master?: string
  hojasA?: string
  documentacion?: string
  ubicacion?: string
  
  createdAt: string
  updatedAt?: string
}

interface VehiculoNota {
  id: number
  vehiculoId: number
  contenido: string
  fecha: string
  usuario: string
  tipo: 'general' | 'tecnica' | 'comercial' | 'financiera'
  prioridad: 'baja' | 'media' | 'alta'
  completada: boolean
  createdAt: string
  updatedAt: string
}

interface VehiculoRecordatorio {
  id: number
  vehiculoId: number
  titulo: string
  descripcion: string
  fechaRecordatorio: string
  tipo: 'itv' | 'seguro' | 'revision' | 'documentacion' | 'otro'
  prioridad: 'baja' | 'media' | 'alta'
  completado: boolean
  createdAt: string
}

// Función para generar el slug
const generateVehicleSlug = (vehiculo: Vehiculo): string => {
  const cleanMarca = vehiculo.marca.toLowerCase().replace(/[^a-z0-9]/g, '')
  const cleanModelo = vehiculo.modelo.toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${vehiculo.id}-${cleanMarca}-${cleanModelo}`
}

export default function VehiculoDetailPage() {
  const router = useRouter()
  const params = useParams()
  // Extraer ID del formato "id-marca-modelo"
  const vehiculoSlug = params.id as string
  const vehiculoId = vehiculoSlug.split('-')[0]
  const { showToast, ToastContainer } = useToast()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()

  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null)
  const [notas, setNotas] = useState<VehiculoNota[]>([])
  const [recordatorios, setRecordatorios] = useState<VehiculoRecordatorio[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'general' | 'financiero'>('general')
  const [isAdmin] = useState(true) // TODO: Obtener del contexto de autenticación

  // Estados para nueva nota
  const [nuevaNota, setNuevaNota] = useState('')
  const [nuevaNotaTipo, setNuevaNotaTipo] = useState<'general' | 'tecnica' | 'comercial' | 'financiera'>('general')
  const [nuevaNotaPrioridad, setNuevaNotaPrioridad] = useState<'baja' | 'media' | 'alta'>('media')

  // Estados para nuevo recordatorio
  const [nuevoRecordatorio, setNuevoRecordatorio] = useState({
    titulo: '',
    descripcion: '',
    fechaRecordatorio: '',
    tipo: 'otro' as 'itv' | 'seguro' | 'revision' | 'documentacion' | 'otro',
    prioridad: 'media' as 'baja' | 'media' | 'alta'
  })

  useEffect(() => {
    if (vehiculoId) {
      fetchVehiculo()
      fetchNotas()
      fetchRecordatorios()
    }
  }, [vehiculoId])

  const fetchVehiculo = async () => {
    try {
      const response = await fetch(`/api/vehiculos/${vehiculoId}`)
      if (response.ok) {
        const data = await response.json()
        setVehiculo(data)
        
        // Verificar si la URL es correcta y redirigir si es necesario
        const correctSlug = generateVehicleSlug(data)
        if (vehiculoSlug !== correctSlug) {
          router.replace(`/vehiculos/${correctSlug}`)
        }
      } else {
        showToast('Error al cargar el vehículo', 'error')
        router.push('/vehiculos')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar el vehículo', 'error')
      router.push('/vehiculos')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchNotas = async () => {
    try {
      const response = await fetch(`/api/vehiculos/${vehiculoId}/notas`)
      if (response.ok) {
        const data = await response.json()
        setNotas(data)
      }
    } catch (error) {
      console.error('Error al cargar notas:', error)
    }
  }

  const fetchRecordatorios = async () => {
    try {
      const response = await fetch(`/api/vehiculos/${vehiculoId}/recordatorios`)
      if (response.ok) {
        const data = await response.json()
        setRecordatorios(data)
      }
    } catch (error) {
      console.error('Error al cargar recordatorios:', error)
    }
  }

  const handleAgregarNota = async () => {
    if (!nuevaNota.trim()) return

    try {
      const response = await fetch(`/api/vehiculos/${vehiculoId}/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contenido: nuevaNota,
          tipo: nuevaNotaTipo,
          prioridad: nuevaNotaPrioridad,
          usuario: 'Usuario Actual' // TODO: Obtener del contexto de autenticación
        })
      })

      if (response.ok) {
        setNuevaNota('')
        fetchNotas()
        showToast('Nota agregada exitosamente', 'success')
      } else {
        showToast('Error al agregar la nota', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al agregar la nota', 'error')
    }
  }

  const handleAgregarRecordatorio = async () => {
    if (!nuevoRecordatorio.titulo.trim() || !nuevoRecordatorio.fechaRecordatorio) return

    try {
      const response = await fetch(`/api/vehiculos/${vehiculoId}/recordatorios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevoRecordatorio)
      })

      if (response.ok) {
        setNuevoRecordatorio({
          titulo: '',
          descripcion: '',
          fechaRecordatorio: '',
          tipo: 'otro',
          prioridad: 'media'
        })
        fetchRecordatorios()
        showToast('Recordatorio agregado exitosamente', 'success')
      } else {
        showToast('Error al agregar el recordatorio', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al agregar el recordatorio', 'error')
    }
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'C':
      case 'Compra':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'I':
      case 'Inversor':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'D':
      case 'Deposito Venta':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'R':
      case 'Coche R':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getEstadoColor = (estado: string) => {
    switch (estado.toLowerCase()) {
      case 'disponible':
      case 'sin estado':
        return 'bg-gray-100 text-gray-800'
      case 'mecanica':
      case 'mecánica':
        return 'bg-yellow-100 text-yellow-800'
      case 'fotos':
        return 'bg-blue-100 text-blue-800'
      case 'publicado':
        return 'bg-green-100 text-green-800'
      case 'reservado':
        return 'bg-orange-100 text-orange-800'
      case 'vendido':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getPrioridadColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta':
        return 'bg-red-100 text-red-800'
      case 'media':
        return 'bg-yellow-100 text-yellow-800'
      case 'baja':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  if (!vehiculo) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Vehículo no encontrado</h1>
          <Link href="/vehiculos" className="text-green-600 hover:text-green-800">
            Volver a la lista de vehículos
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <ToastContainer />
      
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/vehiculos')}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {formatVehicleReference(vehiculo.referencia, vehiculo.tipo)} - {vehiculo.marca} {vehiculo.modelo}
                </h1>
                <p className="text-sm text-gray-500">
                  {vehiculo.matricula} • {vehiculo.kms?.toLocaleString()} km • {vehiculo.fechaMatriculacion ? new Date(vehiculo.fechaMatriculacion).getFullYear() : 'N/A'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getEstadoColor(vehiculo.estado)}`}>
                {vehiculo.estado.toUpperCase()}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getTipoColor(vehiculo.tipo)}`}>
                {vehiculo.tipo === 'C' ? 'COMPRA' : 
                 vehiculo.tipo === 'I' ? 'INVERSOR' : 
                 vehiculo.tipo === 'D' ? 'DEPÓSITO' : 
                 vehiculo.tipo === 'R' ? 'RENTING' : vehiculo.tipo}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Panel Principal */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Tabs de Información */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              {/* Tab Headers */}
              <div className="border-b border-gray-200">
                <nav className="flex space-x-8 px-6">
                  <button
                    onClick={() => setActiveTab('general')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'general'
                        ? 'border-green-500 text-green-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Información General
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => setActiveTab('financiero')}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'financiero'
                          ? 'border-green-500 text-green-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Información Financiera
                    </button>
                  )}
                </nav>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {/* Información General */}
                {activeTab === 'general' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Datos Básicos */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Datos Básicos</h3>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                        <p className="text-gray-900">{vehiculo.marca}</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                        <p className="text-gray-900">{vehiculo.modelo}</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Matrícula</label>
                        <p className="text-gray-900 font-mono">{vehiculo.matricula}</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bastidor</label>
                        <p className="text-gray-900 font-mono text-sm break-all">{vehiculo.bastidor}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Kilómetros</label>
                          <p className="text-gray-900">{vehiculo.kms?.toLocaleString() || 'N/A'} km</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
                          <p className="text-gray-900">{vehiculo.año || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Características */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Características</h3>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                        <p className="text-gray-900">{vehiculo.color || 'N/A'}</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Matriculación</label>
                        <p className="text-gray-900">
                          {vehiculo.fechaMatriculacion ? formatDate(vehiculo.fechaMatriculacion) : 'N/A'}
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Combustible</label>
                          <p className="text-gray-900">{vehiculo.combustible || 'N/A'}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Cambio</label>
                          <p className="text-gray-900">{vehiculo.cambio || 'N/A'}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Potencia</label>
                          <p className="text-gray-900">{vehiculo.potencia ? `${vehiculo.potencia} CV` : 'N/A'}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Puertas</label>
                          <p className="text-gray-900">{vehiculo.puertas || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Información Financiera (Solo Admin) */}
                {activeTab === 'financiero' && isAdmin && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Costos */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Costos de Adquisición</h3>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Precio de Compra</label>
                        <p className="text-gray-900 text-lg font-semibold">
                          {vehiculo.precioCompra ? formatCurrency(vehiculo.precioCompra) : 'N/A'}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Transporte</label>
                          <p className="text-gray-900">
                            {vehiculo.gastosTransporte ? formatCurrency(vehiculo.gastosTransporte) : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tasas</label>
                          <p className="text-gray-900">
                            {vehiculo.gastosTasas ? formatCurrency(vehiculo.gastosTasas) : 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Mecánica</label>
                          <p className="text-gray-900">
                            {vehiculo.gastosMecanica ? formatCurrency(vehiculo.gastosMecanica) : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Otros</label>
                          <p className="text-gray-900">
                            {vehiculo.gastosOtros ? formatCurrency(vehiculo.gastosOtros) : 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Total */}
                      <div className="border-t pt-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">Total Invertido:</span>
                          <span className="text-lg font-bold text-gray-900">
                            {(() => {
                              const total = (vehiculo.precioCompra || 0) +
                                           (vehiculo.gastosTransporte || 0) +
                                           (vehiculo.gastosTasas || 0) +
                                           (vehiculo.gastosMecanica || 0) +
                                           (vehiculo.gastosPintura || 0) +
                                           (vehiculo.gastosLimpieza || 0) +
                                           (vehiculo.gastosOtros || 0)
                              return formatCurrency(total)
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Precios y Beneficios */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Precios y Beneficios</h3>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Precio de Publicación</label>
                        <p className="text-gray-900 text-lg font-semibold">
                          {vehiculo.precioPublicacion ? formatCurrency(vehiculo.precioPublicacion) : 'N/A'}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Precio de Venta</label>
                        <p className="text-gray-900 text-lg font-semibold">
                          {vehiculo.precioVenta ? formatCurrency(vehiculo.precioVenta) : 'N/A'}
                        </p>
                      </div>

                      {/* Cálculo de Beneficio */}
                      <div className="border-t pt-4">
                        <div className="space-y-2">
                          {(() => {
                            const totalInvertido = (vehiculo.precioCompra || 0) +
                                                 (vehiculo.gastosTransporte || 0) +
                                                 (vehiculo.gastosTasas || 0) +
                                                 (vehiculo.gastosMecanica || 0) +
                                                 (vehiculo.gastosPintura || 0) +
                                                 (vehiculo.gastosLimpieza || 0) +
                                                 (vehiculo.gastosOtros || 0)
                            const precioVenta = vehiculo.precioVenta || 0
                            const beneficioBruto = precioVenta - totalInvertido
                            const porcentajeBeneficio = totalInvertido > 0 ? (beneficioBruto / totalInvertido) * 100 : 0

                            return (
                              <>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600">Beneficio Bruto:</span>
                                  <span className={`font-semibold ${beneficioBruto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatCurrency(beneficioBruto)}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600">Margen:</span>
                                  <span className={`font-semibold ${porcentajeBeneficio >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {porcentajeBeneficio.toFixed(1)}%
                                  </span>
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notas */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notas ({notas.length})</h2>
              
              {/* Agregar Nueva Nota */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                    <select
                      value={nuevaNotaTipo}
                      onChange={(e) => setNuevaNotaTipo(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="general">General</option>
                      <option value="tecnica">Técnica</option>
                      <option value="comercial">Comercial</option>
                      <option value="financiera">Financiera</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
                    <select
                      value={nuevaNotaPrioridad}
                      onChange={(e) => setNuevaNotaPrioridad(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <textarea
                    value={nuevaNota}
                    onChange={(e) => setNuevaNota(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Escribe tu nota aquí..."
                  />
                </div>
                <button
                  onClick={handleAgregarNota}
                  disabled={!nuevaNota.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Agregar Nota
                </button>
              </div>

              {/* Lista de Notas */}
              {notas.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay notas registradas</p>
              ) : (
                <div className="space-y-4">
                  {notas.map((nota) => (
                    <div key={nota.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            nota.tipo === 'tecnica' ? 'bg-blue-100 text-blue-800' :
                            nota.tipo === 'comercial' ? 'bg-green-100 text-green-800' :
                            nota.tipo === 'financiera' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {nota.tipo}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(nota.prioridad)}`}>
                            {nota.prioridad}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          <div>{nota.usuario}</div>
                          <div>{formatDate(nota.fecha)}</div>
                        </div>
                      </div>
                      <p className="text-gray-900">{nota.contenido}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Derecha */}
          <div className="space-y-6">
            
            {/* Documentación */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Documentación</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado ITV</label>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    vehiculo.itv === 'al dia' ? 'bg-green-100 text-green-800' :
                    vehiculo.itv === 'vencida' ? 'bg-red-100 text-red-800' :
                    vehiculo.itv === 'proxima a vencer' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {vehiculo.itv || 'N/A'}
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vencimiento ITV</label>
                  <p className="text-gray-900 text-sm">
                    {vehiculo.fechaVencimientoItv ? formatDate(vehiculo.fechaVencimientoItv) : 'N/A'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Seguro</label>
                  <p className="text-gray-900 text-sm">{vehiculo.seguro || 'N/A'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Segunda Llave</label>
                  <p className="text-gray-900 text-sm">{vehiculo.segundaLlave || 'N/A'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                  <p className="text-gray-900 text-sm">{vehiculo.ubicacion || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Recordatorios */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recordatorios ({recordatorios.length})</h2>
              
              {/* Agregar Nuevo Recordatorio */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="space-y-3">
                  <div>
                    <input
                      type="text"
                      value={nuevoRecordatorio.titulo}
                      onChange={(e) => setNuevoRecordatorio({ ...nuevoRecordatorio, titulo: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Título del recordatorio..."
                    />
                  </div>
                  <div>
                    <input
                      type="datetime-local"
                      value={nuevoRecordatorio.fechaRecordatorio}
                      onChange={(e) => setNuevoRecordatorio({ ...nuevoRecordatorio, fechaRecordatorio: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={nuevoRecordatorio.tipo}
                      onChange={(e) => setNuevoRecordatorio({ ...nuevoRecordatorio, tipo: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="itv">ITV</option>
                      <option value="seguro">Seguro</option>
                      <option value="revision">Revisión</option>
                      <option value="documentacion">Documentación</option>
                      <option value="otro">Otro</option>
                    </select>
                    <select
                      value={nuevoRecordatorio.prioridad}
                      onChange={(e) => setNuevoRecordatorio({ ...nuevoRecordatorio, prioridad: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>
                  <button
                    onClick={handleAgregarRecordatorio}
                    disabled={!nuevoRecordatorio.titulo.trim() || !nuevoRecordatorio.fechaRecordatorio}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Agregar Recordatorio
                  </button>
                </div>
              </div>

              {/* Lista de Recordatorios */}
              {recordatorios.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No hay recordatorios</p>
              ) : (
                <div className="space-y-3">
                  {recordatorios.map((recordatorio) => (
                    <div key={recordatorio.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            recordatorio.tipo === 'itv' ? 'bg-red-100 text-red-800' :
                            recordatorio.tipo === 'seguro' ? 'bg-blue-100 text-blue-800' :
                            recordatorio.tipo === 'revision' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {recordatorio.tipo}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(recordatorio.prioridad)}`}>
                            {recordatorio.prioridad}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(recordatorio.fechaRecordatorio)}
                        </div>
                      </div>
                      <h4 className="font-medium text-gray-900 text-sm mb-1">{recordatorio.titulo}</h4>
                      {recordatorio.descripcion && (
                        <p className="text-gray-600 text-xs">{recordatorio.descripcion}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmModalComponent />
    </div>
  )
}