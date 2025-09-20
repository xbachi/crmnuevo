'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import { useConfirmModal } from '@/components/ConfirmModal'
import { formatCurrency, formatVehicleReference, formatDate, generateVehicleSlug } from '@/lib/utils'

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

// Función para extraer el ID del slug (formato: id-marca-modelo)
const extractIdFromSlug = (slug: string): string | null => {
  console.log(`🔧 [EXTRACT] Extracting ID from slug: "${slug}"`)
  
  // Extraer el ID de la primera parte del slug
  const match = slug.match(/^(\d+)-/)
  if (match) {
    const id = match[1]
    console.log(`🔧 [EXTRACT] ID encontrado: "${id}"`)
    return id
  }
  
  console.log(`❌ [EXTRACT] No se pudo extraer ID del slug: "${slug}"`)
  return null
}

export default function VehiculoDetailPage() {
  const router = useRouter()
  const params = useParams()
  // Extraer ID del formato "id-marca-modelo"
  const vehiculoSlug = params.id as string
  const vehiculoId = extractIdFromSlug(vehiculoSlug)
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
    const fetchVehiculo = async () => {
      try {
        console.log(`🔍 [VEHICULO PAGE] Iniciando búsqueda de vehículo`)
        console.log(`📝 [VEHICULO PAGE] Slug completo: "${vehiculoSlug}"`)
        console.log(`🔢 [VEHICULO PAGE] ID extraído: "${vehiculoId}"`)
        
        if (!vehiculoId) {
          console.log(`❌ [VEHICULO PAGE] No se pudo extraer ID del slug`)
          setError('ID de vehículo inválido')
          setIsLoading(false)
          return
        }
        
        setIsLoading(true)
        const apiUrl = `/api/vehiculos/${vehiculoId}`
        console.log(`📞 [VEHICULO PAGE] Llamando API: ${apiUrl}`)
        
        const response = await fetch(apiUrl)
        console.log(`📡 [VEHICULO PAGE] Response status: ${response.status}`)
        
        if (response.ok) {
          const data = await response.json()
          console.log(`✅ [VEHICULO PAGE] Datos recibidos:`, {
            id: data.id,
            referencia: data.referencia,
            marca: data.marca,
            modelo: data.modelo
          })
          console.log(`✅ [VEHICULO PAGE] Datos completos del vehículo:`, data)
          setVehiculo(data)
          
          // Verificar si la URL es correcta y redirigir si es necesario
          const correctSlug = generateVehicleSlug(data)
          console.log(`🔗 [VEHICULO PAGE] Slug correcto calculado: "${correctSlug}"`)
          console.log(`🔗 [VEHICULO PAGE] Slug actual: "${vehiculoSlug}"`)
          
          if (vehiculoSlug !== correctSlug) {
            console.log(`🔄 [VEHICULO PAGE] Redirigiendo a slug correcto: /vehiculos/${correctSlug}`)
            router.replace(`/vehiculos/${correctSlug}`)
          } else {
            console.log(`✅ [VEHICULO PAGE] URL es correcta, mostrando página del vehículo`)
          }
        } else {
          const errorData = await response.json().catch(() => ({}))
          console.error(`❌ [VEHICULO PAGE] Error al cargar el vehículo:`, {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          })
          console.log(`🔄 [VEHICULO PAGE] Redirigiendo a /vehiculos`)
          router.push('/vehiculos')
        }
      } catch (error) {
        console.error('❌ [VEHICULO PAGE] Error en fetchVehiculo:', error)
        console.log(`🔄 [VEHICULO PAGE] Redirigiendo a /vehiculos por error`)
        router.push('/vehiculos')
      } finally {
        setIsLoading(false)
      }
    }

    if (vehiculoId) {
      console.log(`🚀 [VEHICULO PAGE] Iniciando useEffect con ID: "${vehiculoId}"`)
      fetchVehiculo()
    } else {
      console.log(`⚠️ [VEHICULO PAGE] No hay ID para buscar`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculoId])

  useEffect(() => {
    const fetchNotas = async () => {
      if (!vehiculo?.id) return
      try {
        const response = await fetch(`/api/vehiculos/${vehiculo.id}/notas`)
        if (response.ok) {
          const data = await response.json()
          setNotas(data)
        }
      } catch (error) {
        console.error('Error al cargar notas:', error)
      }
    }

    const fetchRecordatorios = async () => {
      if (!vehiculo?.id) return
      try {
        const response = await fetch(`/api/vehiculos/${vehiculo.id}/recordatorios`)
        if (response.ok) {
          const data = await response.json()
          setRecordatorios(data)
        }
      } catch (error) {
        console.error('Error al cargar recordatorios:', error)
      }
    }

    if (vehiculo?.id) {
      fetchNotas()
      fetchRecordatorios()
    }
  }, [vehiculo?.id])

  const handleAgregarNota = async () => {
    if (!nuevaNota.trim() || !vehiculo?.id) return

    try {
      const response = await fetch(`/api/vehiculos/${vehiculo.id}/notas`, {
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
        // Recargar notas
        const notasResponse = await fetch(`/api/vehiculos/${vehiculo.id}/notas`)
        if (notasResponse.ok) {
          const notasData = await notasResponse.json()
          setNotas(notasData)
        }
        console.log('Nota agregada exitosamente')
      } else {
        console.error('Error al agregar la nota')
      }
    } catch (error) {
      console.error('Error al agregar la nota:', error)
    }
  }

  const handleAgregarRecordatorio = async () => {
    if (!nuevoRecordatorio.titulo.trim() || !nuevoRecordatorio.fechaRecordatorio || !vehiculo?.id) return

    try {
      const response = await fetch(`/api/vehiculos/${vehiculo.id}/recordatorios`, {
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
        // Recargar recordatorios
        const recordatoriosResponse = await fetch(`/api/vehiculos/${vehiculo.id}/recordatorios`)
        if (recordatoriosResponse.ok) {
          const recordatoriosData = await recordatoriosResponse.json()
          setRecordatorios(recordatoriosData)
        }
        console.log('Recordatorio agregado exitosamente')
      } else {
        console.error('Error al agregar el recordatorio')
      }
    } catch (error) {
      console.error('Error al agregar el recordatorio:', error)
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
    console.log(`⏳ [VEHICULO PAGE] Mostrando pantalla de carga...`)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  if (!vehiculo) {
    console.log(`⚠️ [VEHICULO PAGE] No hay datos de vehículo para mostrar`)
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

  console.log(`🎯 [VEHICULO PAGE] Renderizando página del vehículo: ${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.referencia})`)

  return (
    <div className="min-h-screen bg-slate-50">
      
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Marca y Modelo */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <h3 className="font-semibold text-blue-900">Identificación</h3>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-blue-700 mb-1">Marca</label>
                          <p className="text-blue-900 font-semibold">{vehiculo.marca}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-blue-700 mb-1">Modelo</label>
                          <p className="text-blue-900 font-semibold">{vehiculo.modelo}</p>
                        </div>
                      </div>
                    </div>

                    {/* Matrícula y Bastidor */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="font-semibold text-green-900">Documentación</h3>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-green-700 mb-1">Matrícula</label>
                          <p className="text-green-900 font-mono font-semibold">{vehiculo.matricula}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-green-700 mb-1">Bastidor</label>
                          <p className="text-green-900 font-mono text-sm break-all">{vehiculo.bastidor}</p>
                        </div>
                      </div>
                    </div>

                    {/* KMs, Fecha y Color */}
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="font-semibold text-orange-900">Características</h3>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-orange-700 mb-1">Kilómetros</label>
                          <p className="text-orange-900 font-semibold">{vehiculo.kms?.toLocaleString() || 'N/A'} km</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-orange-700 mb-1">Fecha Matriculación</label>
                          <p className="text-orange-900 font-medium">
                            {vehiculo.fechaMatriculacion ? formatDate(vehiculo.fechaMatriculacion) : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-orange-700 mb-1">Color</label>
                          <p className="text-orange-900 font-medium">{vehiculo.color || 'N/A'}</p>
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

            {/* Documentación del Vehículo */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center space-x-2 mb-6">
                <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Documentación Legal</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* ITV */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-red-900">ITV</h3>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-red-700 mb-1">Estado</label>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        vehiculo.itv === 'al dia' ? 'bg-green-100 text-green-800' :
                        vehiculo.itv === 'vencida' ? 'bg-red-100 text-red-800' :
                        vehiculo.itv === 'proxima a vencer' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {vehiculo.itv || 'N/A'}
                      </span>
                    </div>
                    {vehiculo.fechaVencimientoItv && (
                      <div>
                        <label className="block text-xs font-medium text-red-700 mb-1">Vencimiento</label>
                        <p className="text-red-900 text-sm font-medium">
                          {formatDate(vehiculo.fechaVencimientoItv)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Seguro */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-blue-900">Seguro</h3>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-blue-700 mb-1">Estado</label>
                    <p className="text-blue-900 font-medium">{vehiculo.seguro || 'N/A'}</p>
                  </div>
                </div>

                {/* Segunda Llave */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-yellow-900">2ª Llave</h3>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-yellow-700 mb-1">Disponible</label>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      vehiculo.segundaLlave === 'si' ? 'bg-green-100 text-green-800' :
                      vehiculo.segundaLlave === 'no' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {vehiculo.segundaLlave || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Documentación */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-green-900">Documentación</h3>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-green-700 mb-1">Estado</label>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      vehiculo.documentacion === 'completa' ? 'bg-green-100 text-green-800' :
                      vehiculo.documentacion === 'incompleta' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {vehiculo.documentacion || 'N/A'}
                    </span>
                  </div>
                </div>
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
            
            {/* Estado del Vehículo */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Estado</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Estado Actual</label>
                  <div className="flex items-center space-x-3">
                    <span className={`px-3 py-2 rounded-lg text-sm font-medium ${getEstadoColor(vehiculo.estado)}`}>
                      {vehiculo.estado.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Estado detallado según el estado actual */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
                  <div className="bg-gray-50 rounded-lg p-3">
                    {(() => {
                      switch (vehiculo.estado.toLowerCase()) {
                        case 'mecanica':
                        case 'mecánica':
                          return (
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                              <span className="text-yellow-800 font-medium">En proceso: Mecánica</span>
                            </div>
                          )
                        case 'fotos':
                          return (
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                              <span className="text-blue-800 font-medium">En proceso: Sesión de fotos</span>
                            </div>
                          )
                        case 'publicado':
                          return (
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="text-green-800 font-medium">Disponible para venta</span>
                            </div>
                          )
                        case 'reservado':
                          return (
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                              <span className="text-orange-800 font-medium">Reservado por cliente</span>
                            </div>
                          )
                        case 'vendido':
                          return (
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                              <span className="text-red-800 font-medium">Vendido - Falta facturar</span>
                            </div>
                          )
                        case 'facturado':
                          return (
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                              <span className="text-purple-800 font-medium">Proceso completado</span>
                            </div>
                          )
                        default:
                          return (
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                              <span className="text-gray-800 font-medium">Estado inicial</span>
                            </div>
                          )
                      }
                    })()}
                  </div>
                </div>

                {vehiculo.ubicacion && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                    <p className="text-gray-900 text-sm bg-gray-50 rounded-lg p-2">{vehiculo.ubicacion}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Documentos del Vehículo */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">Documentos</h2>
                </div>
                <button className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors">
                  <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Subir
                </button>
              </div>
              
              {/* Lista de tipos de documentos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Documentación Legal</p>
                      <p className="text-xs text-gray-500">Permisos de circulación, etc.</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">0 archivos</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Facturas</p>
                      <p className="text-xs text-gray-500">Compra, reparaciones, etc.</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">0 archivos</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Inspecciones</p>
                      <p className="text-xs text-gray-500">ITV, revisiones técnicas</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">0 archivos</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Fotografías</p>
                      <p className="text-xs text-gray-500">Daños, estado del vehículo</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">0 archivos</span>
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