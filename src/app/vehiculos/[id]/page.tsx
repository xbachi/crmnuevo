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

export default function VehiculoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const vehiculoId = params.id as string
  const { showToast, ToastContainer } = useToast()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()

  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null)
  const [notas, setNotas] = useState<VehiculoNota[]>([])
  const [recordatorios, setRecordatorios] = useState<VehiculoRecordatorio[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'financiero' | 'documentacion' | 'notas' | 'recordatorios'>('general')

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

  // Estados para edición
  const [editData, setEditData] = useState<Partial<Vehiculo>>({})

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
        setEditData(data)
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

  const handleSaveEdit = async () => {
    try {
      const response = await fetch(`/api/vehiculos/${vehiculoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      })

      if (response.ok) {
        const updatedVehiculo = await response.json()
        setVehiculo(updatedVehiculo)
        setIsEditing(false)
        showToast('Vehículo actualizado exitosamente', 'success')
      } else {
        showToast('Error al actualizar el vehículo', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al actualizar el vehículo', 'error')
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

  const handleDeleteVehiculo = () => {
    if (!vehiculo) return

    showConfirm(
      'Eliminar Vehículo',
      `¿Estás seguro de que quieres eliminar el vehículo ${vehiculo.marca} ${vehiculo.modelo} (${formatVehicleReference(vehiculo.referencia, vehiculo.tipo)})? Esta acción no se puede deshacer.`,
      async () => {
        try {
          const response = await fetch(`/api/vehiculos/${vehiculoId}`, {
            method: 'DELETE'
          })

          if (response.ok) {
            showToast('Vehículo eliminado exitosamente', 'success')
            router.push('/vehiculos')
          } else {
            showToast('Error al eliminar el vehículo', 'error')
          }
        } catch (error) {
          console.error('Error:', error)
          showToast('Error al eliminar el vehículo', 'error')
        }
      }
    )
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  if (!vehiculo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/vehiculos" className="text-gray-500 hover:text-gray-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {vehiculo.marca} {vehiculo.modelo}
              </h1>
              <div className="flex items-center space-x-3 mt-1">
                <span className="text-sm text-gray-500">
                  {formatVehicleReference(vehiculo.referencia, vehiculo.tipo)}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getTipoColor(vehiculo.tipo)}`}>
                  {vehiculo.tipo === 'C' ? 'Compra' : 
                   vehiculo.tipo === 'I' ? 'Inversor' : 
                   vehiculo.tipo === 'D' ? 'Depósito' : 
                   vehiculo.tipo === 'R' ? 'Renting' : vehiculo.tipo}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(vehiculo.estado)}`}>
                  {vehiculo.estado}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors"
                >
                  Guardar Cambios
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={handleDeleteVehiculo}
                  className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors"
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6">
          <nav className="flex space-x-8">
            {[
              { id: 'general', label: 'Información General' },
              { id: 'financiero', label: 'Información Financiera' },
              { id: 'documentacion', label: 'Documentación' },
              { id: 'notas', label: `Notas (${notas.length})` },
              { id: 'recordatorios', label: `Recordatorios (${recordatorios.length})` }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Información General */}
        {activeTab === 'general' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Información Básica */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Información Básica</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Referencia</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.referencia || ''}
                        onChange={(e) => setEditData({ ...editData, referencia: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900 font-mono">
                        {formatVehicleReference(vehiculo.referencia, vehiculo.tipo)}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                    {isEditing ? (
                      <select
                        value={editData.tipo || ''}
                        onChange={(e) => setEditData({ ...editData, tipo: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="C">Compra</option>
                        <option value="I">Inversor</option>
                        <option value="D">Depósito</option>
                        <option value="R">Renting</option>
                      </select>
                    ) : (
                      <p className="text-gray-900">
                        {vehiculo.tipo === 'C' ? 'Compra' : 
                         vehiculo.tipo === 'I' ? 'Inversor' : 
                         vehiculo.tipo === 'D' ? 'Depósito' : 
                         vehiculo.tipo === 'R' ? 'Renting' : vehiculo.tipo}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.marca || ''}
                        onChange={(e) => setEditData({ ...editData, marca: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">{vehiculo.marca}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.modelo || ''}
                        onChange={(e) => setEditData({ ...editData, modelo: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">{vehiculo.modelo}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Matrícula</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editData.matricula || ''}
                      onChange={(e) => setEditData({ ...editData, matricula: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 font-mono">{vehiculo.matricula}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número de Bastidor</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editData.bastidor || ''}
                      onChange={(e) => setEditData({ ...editData, bastidor: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 font-mono break-all">{vehiculo.bastidor}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kilómetros</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.kms || ''}
                        onChange={(e) => setEditData({ ...editData, kms: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">{vehiculo.kms?.toLocaleString() || 'N/A'} km</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                    {isEditing ? (
                      <select
                        value={editData.estado || ''}
                        onChange={(e) => setEditData({ ...editData, estado: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="sin estado">Sin estado</option>
                        <option value="disponible">Disponible</option>
                        <option value="mecánica">Mecánica</option>
                        <option value="fotos">Fotos</option>
                        <option value="publicado">Publicado</option>
                        <option value="reservado">Reservado</option>
                        <option value="vendido">Vendido</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(vehiculo.estado)}`}>
                        {vehiculo.estado}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Características Técnicas */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Características Técnicas</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.año || ''}
                        onChange={(e) => setEditData({ ...editData, año: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">{vehiculo.año || 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.color || ''}
                        onChange={(e) => setEditData({ ...editData, color: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">{vehiculo.color || 'N/A'}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Primera Matriculación</label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editData.fechaMatriculacion || ''}
                      onChange={(e) => setEditData({ ...editData, fechaMatriculacion: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900">
                      {vehiculo.fechaMatriculacion ? formatDate(vehiculo.fechaMatriculacion) : 'N/A'}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Combustible</label>
                    {isEditing ? (
                      <select
                        value={editData.combustible || ''}
                        onChange={(e) => setEditData({ ...editData, combustible: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="">Seleccionar</option>
                        <option value="gasolina">Gasolina</option>
                        <option value="diesel">Diésel</option>
                        <option value="hibrido">Híbrido</option>
                        <option value="electrico">Eléctrico</option>
                        <option value="glp">GLP</option>
                        <option value="gnc">GNC</option>
                      </select>
                    ) : (
                      <p className="text-gray-900">{vehiculo.combustible || 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cambio</label>
                    {isEditing ? (
                      <select
                        value={editData.cambio || ''}
                        onChange={(e) => setEditData({ ...editData, cambio: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="">Seleccionar</option>
                        <option value="manual">Manual</option>
                        <option value="automatico">Automático</option>
                        <option value="semiautomatico">Semiautomático</option>
                      </select>
                    ) : (
                      <p className="text-gray-900">{vehiculo.cambio || 'N/A'}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Potencia (CV)</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.potencia || ''}
                        onChange={(e) => setEditData({ ...editData, potencia: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">{vehiculo.potencia ? `${vehiculo.potencia} CV` : 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cilindrada (cc)</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.cilindrada || ''}
                        onChange={(e) => setEditData({ ...editData, cilindrada: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">{vehiculo.cilindrada ? `${vehiculo.cilindrada} cc` : 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Puertas</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.puertas || ''}
                        onChange={(e) => setEditData({ ...editData, puertas: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">{vehiculo.puertas || 'N/A'}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Plazas</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.plazas || ''}
                        onChange={(e) => setEditData({ ...editData, plazas: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">{vehiculo.plazas || 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.categoria || ''}
                        onChange={(e) => setEditData({ ...editData, categoria: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">{vehiculo.categoria || 'N/A'}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Información Financiera */}
        {activeTab === 'financiero' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Costos */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Costos de Adquisición</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio de Compra</label>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editData.precioCompra || ''}
                      onChange={(e) => setEditData({ ...editData, precioCompra: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 text-lg font-semibold">
                      {vehiculo.precioCompra ? formatCurrency(vehiculo.precioCompra) : 'N/A'}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gastos Transporte</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.gastosTransporte || ''}
                        onChange={(e) => setEditData({ ...editData, gastosTransporte: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">
                        {vehiculo.gastosTransporte ? formatCurrency(vehiculo.gastosTransporte) : 'N/A'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gastos Tasas</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.gastosTasas || ''}
                        onChange={(e) => setEditData({ ...editData, gastosTasas: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">
                        {vehiculo.gastosTasas ? formatCurrency(vehiculo.gastosTasas) : 'N/A'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gastos Mecánica</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.gastosMecanica || ''}
                        onChange={(e) => setEditData({ ...editData, gastosMecanica: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">
                        {vehiculo.gastosMecanica ? formatCurrency(vehiculo.gastosMecanica) : 'N/A'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gastos Pintura</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.gastosPintura || ''}
                        onChange={(e) => setEditData({ ...editData, gastosPintura: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">
                        {vehiculo.gastosPintura ? formatCurrency(vehiculo.gastosPintura) : 'N/A'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gastos Limpieza</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.gastosLimpieza || ''}
                        onChange={(e) => setEditData({ ...editData, gastosLimpieza: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">
                        {vehiculo.gastosLimpieza ? formatCurrency(vehiculo.gastosLimpieza) : 'N/A'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gastos Otros</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editData.gastosOtros || ''}
                        onChange={(e) => setEditData({ ...editData, gastosOtros: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">
                        {vehiculo.gastosOtros ? formatCurrency(vehiculo.gastosOtros) : 'N/A'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Total de Gastos */}
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
            </div>

            {/* Precios y Beneficios */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Precios y Beneficios</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio de Publicación</label>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editData.precioPublicacion || ''}
                      onChange={(e) => setEditData({ ...editData, precioPublicacion: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 text-lg font-semibold">
                      {vehiculo.precioPublicacion ? formatCurrency(vehiculo.precioPublicacion) : 'N/A'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio de Venta</label>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editData.precioVenta || ''}
                      onChange={(e) => setEditData({ ...editData, precioVenta: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 text-lg font-semibold">
                      {vehiculo.precioVenta ? formatCurrency(vehiculo.precioVenta) : 'N/A'}
                    </p>
                  )}
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

                {/* Información de Inversor */}
                {vehiculo.esCocheInversor && (
                  <div className="border-t pt-4">
                    <h4 className="text-md font-medium text-gray-900 mb-3">Información de Inversor</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">ID Inversor:</span>
                        <span className="text-sm text-gray-900">{vehiculo.inversorId || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Nombre Inversor:</span>
                        <span className="text-sm text-gray-900">{vehiculo.inversorNombre || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Fecha de Compra:</span>
                        <span className="text-sm text-gray-900">
                          {vehiculo.fechaCompra ? formatDate(vehiculo.fechaCompra) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Documentación */}
        {activeTab === 'documentacion' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ITV y Documentación Legal */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">ITV y Documentación Legal</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado ITV</label>
                  {isEditing ? (
                    <select
                      value={editData.itv || ''}
                      onChange={(e) => setEditData({ ...editData, itv: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">Seleccionar</option>
                      <option value="al dia">Al día</option>
                      <option value="vencida">Vencida</option>
                      <option value="proxima a vencer">Próxima a vencer</option>
                      <option value="no aplica">No aplica</option>
                    </select>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        vehiculo.itv === 'al dia' ? 'bg-green-100 text-green-800' :
                        vehiculo.itv === 'vencida' ? 'bg-red-100 text-red-800' :
                        vehiculo.itv === 'proxima a vencer' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {vehiculo.itv || 'N/A'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha ITV</label>
                    {isEditing ? (
                      <input
                        type="date"
                        value={editData.fechaItv || ''}
                        onChange={(e) => setEditData({ ...editData, fechaItv: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">
                        {vehiculo.fechaItv ? formatDate(vehiculo.fechaItv) : 'N/A'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vencimiento ITV</label>
                    {isEditing ? (
                      <input
                        type="date"
                        value={editData.fechaVencimientoItv || ''}
                        onChange={(e) => setEditData({ ...editData, fechaVencimientoItv: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900">
                        {vehiculo.fechaVencimientoItv ? formatDate(vehiculo.fechaVencimientoItv) : 'N/A'}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Seguro</label>
                  {isEditing ? (
                    <select
                      value={editData.seguro || ''}
                      onChange={(e) => setEditData({ ...editData, seguro: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">Seleccionar</option>
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <p className="text-gray-900">{vehiculo.seguro || 'N/A'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Segunda Llave</label>
                  {isEditing ? (
                    <select
                      value={editData.segundaLlave || ''}
                      onChange={(e) => setEditData({ ...editData, segundaLlave: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">Seleccionar</option>
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <p className="text-gray-900">{vehiculo.segundaLlave || 'N/A'}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Documentación Adicional */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Documentación Adicional</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Carpeta Documentación</label>
                  {isEditing ? (
                    <select
                      value={editData.carpeta || ''}
                      onChange={(e) => setEditData({ ...editData, carpeta: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">Seleccionar</option>
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <p className="text-gray-900">{vehiculo.carpeta || 'N/A'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Master</label>
                  {isEditing ? (
                    <select
                      value={editData.master || ''}
                      onChange={(e) => setEditData({ ...editData, master: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">Seleccionar</option>
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <p className="text-gray-900">{vehiculo.master || 'N/A'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hojas A</label>
                  {isEditing ? (
                    <select
                      value={editData.hojasA || ''}
                      onChange={(e) => setEditData({ ...editData, hojasA: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">Seleccionar</option>
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <p className="text-gray-900">{vehiculo.hojasA || 'N/A'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Documentación General</label>
                  {isEditing ? (
                    <textarea
                      value={editData.documentacion || ''}
                      onChange={(e) => setEditData({ ...editData, documentacion: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Notas sobre documentación..."
                    />
                  ) : (
                    <p className="text-gray-900">{vehiculo.documentacion || 'N/A'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editData.ubicacion || ''}
                      onChange={(e) => setEditData({ ...editData, ubicacion: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Ubicación física del vehículo"
                    />
                  ) : (
                    <p className="text-gray-900">{vehiculo.ubicacion || 'N/A'}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notas */}
        {activeTab === 'notas' && (
          <div className="space-y-6">
            {/* Agregar Nueva Nota */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Agregar Nueva Nota</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contenido</label>
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
            </div>

            {/* Lista de Notas */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Historial de Notas</h3>
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
        )}

        {/* Recordatorios */}
        {activeTab === 'recordatorios' && (
          <div className="space-y-6">
            {/* Agregar Nuevo Recordatorio */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Agregar Nuevo Recordatorio</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
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
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
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
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                  <input
                    type="text"
                    value={nuevoRecordatorio.titulo}
                    onChange={(e) => setNuevoRecordatorio({ ...nuevoRecordatorio, titulo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Título del recordatorio..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                  <textarea
                    value={nuevoRecordatorio.descripcion}
                    onChange={(e) => setNuevoRecordatorio({ ...nuevoRecordatorio, descripcion: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Descripción del recordatorio..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Recordatorio</label>
                  <input
                    type="datetime-local"
                    value={nuevoRecordatorio.fechaRecordatorio}
                    onChange={(e) => setNuevoRecordatorio({ ...nuevoRecordatorio, fechaRecordatorio: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handleAgregarRecordatorio}
                  disabled={!nuevoRecordatorio.titulo.trim() || !nuevoRecordatorio.fechaRecordatorio}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Agregar Recordatorio
                </button>
              </div>
            </div>

            {/* Lista de Recordatorios */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recordatorios Programados</h3>
              {recordatorios.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay recordatorios programados</p>
              ) : (
                <div className="space-y-4">
                  {recordatorios.map((recordatorio) => (
                    <div key={recordatorio.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            recordatorio.tipo === 'itv' ? 'bg-red-100 text-red-800' :
                            recordatorio.tipo === 'seguro' ? 'bg-blue-100 text-blue-800' :
                            recordatorio.tipo === 'revision' ? 'bg-yellow-100 text-yellow-800' :
                            recordatorio.tipo === 'documentacion' ? 'bg-purple-100 text-purple-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {recordatorio.tipo}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(recordatorio.prioridad)}`}>
                            {recordatorio.prioridad}
                          </span>
                          {recordatorio.completado && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Completado
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(recordatorio.fechaRecordatorio)}
                        </div>
                      </div>
                      <h4 className="font-medium text-gray-900 mb-1">{recordatorio.titulo}</h4>
                      {recordatorio.descripcion && (
                        <p className="text-gray-600 text-sm">{recordatorio.descripcion}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ToastContainer />
      <ConfirmModalComponent />
    </div>
  )
}
