'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/hooks/useToast'

interface Deposito {
  id: number
  cliente_id: number
  vehiculo_id: number
  estado: 'BORRADOR' | 'ACTIVO' | 'FINALIZADO'
  fecha_inicio: string
  fecha_fin?: string
  precio_venta?: number
  comision_porcentaje: number
  notas?: string
  created_at: string
  cliente: {
    id: number
    nombre: string
    apellidos: string
    email: string
    telefono: string
  }
  vehiculo: {
    id: number
    referencia: string
    marca: string
    modelo: string
    matricula: string
    tipo: string
  }
}

export default function DepositoDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { showToast, ToastContainer } = useToast()
  
  const [deposito, setDeposito] = useState<Deposito | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'notas' | 'documentos'>('info')
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState({
    estado: '',
    precio_venta: '',
    comision_porcentaje: '',
    notas: ''
  })

  useEffect(() => {
    fetchDeposito()
  }, [params.id])

  const fetchDeposito = async () => {
    try {
      const response = await fetch(`/api/depositos/${params.id}`)
      if (response.ok) {
        const data = await response.json()
        setDeposito(data)
        setEditData({
          estado: data.estado,
          precio_venta: data.precio_venta?.toString() || '',
          comision_porcentaje: data.comision_porcentaje?.toString() || '',
          notas: data.notas || ''
        })
      } else {
        showToast('Error al cargar el depósito', 'error')
        router.push('/depositos')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar el depósito', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdate = async () => {
    setIsUpdating(true)
    try {
      const response = await fetch(`/api/depositos/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: editData.estado,
          precio_venta: editData.precio_venta ? parseFloat(editData.precio_venta) : null,
          comision_porcentaje: parseFloat(editData.comision_porcentaje),
          notas: editData.notas
        })
      })

      if (response.ok) {
        await fetchDeposito()
        setEditMode(false)
        showToast('Depósito actualizado exitosamente', 'success')
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error al actualizar el depósito', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const convertirEnVenta = async () => {
    if (!deposito) return
    
    try {
      const response = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: deposito.cliente_id,
          vehiculo_id: deposito.vehiculo_id,
          estado: 'RESERVA',
          precio_venta: deposito.precio_venta,
          notas: `Convertido desde depósito #${deposito.id}`
        })
      })

      if (response.ok) {
        // Actualizar el depósito a finalizado
        await fetch(`/api/depositos/${params.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estado: 'FINALIZADO',
            fecha_fin: new Date().toISOString().split('T')[0]
          })
        })
        
        showToast('Depósito convertido en venta exitosamente', 'success')
        await fetchDeposito()
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error al convertir en venta', 'error')
    }
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'BORRADOR': return 'bg-gray-100 text-gray-800'
      case 'ACTIVO': return 'bg-green-100 text-green-800'
      case 'FINALIZADO': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case 'BORRADOR': return 'Borrador'
      case 'ACTIVO': return 'Activo'
      case 'FINALIZADO': return 'Finalizado'
      default: return estado
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Cargando depósito...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!deposito) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900 mb-4">Depósito no encontrado</h1>
            <Link href="/depositos" className="text-green-600 hover:text-green-800">
              Volver a la lista
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <Link href="/depositos" className="text-slate-600 hover:text-slate-900">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Depósito #{deposito.id}</h1>
              <p className="text-slate-600">Gestiona este depósito de venta</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getEstadoColor(deposito.estado)}`}>
              {getEstadoLabel(deposito.estado)}
            </span>
            <span className="text-sm text-slate-500">
              Creado el {new Date(deposito.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Información principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tabs */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
              <div className="border-b border-slate-200">
                <nav className="flex space-x-8 px-6">
                  <button
                    onClick={() => setActiveTab('info')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'info'
                        ? 'border-green-500 text-green-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Información
                  </button>
                  <button
                    onClick={() => setActiveTab('notas')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'notas'
                        ? 'border-green-500 text-green-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Notas
                  </button>
                  <button
                    onClick={() => setActiveTab('documentos')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'documentos'
                        ? 'border-green-500 text-green-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Documentos
                  </button>
                </nav>
              </div>

              <div className="p-6">
                {activeTab === 'info' && (
                  <div className="space-y-6">
                    {/* Cliente */}
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-4">Cliente</h3>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-slate-500">Nombre completo</label>
                            <p className="text-slate-900">{deposito.cliente.nombre} {deposito.cliente.apellidos}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-500">Email</label>
                            <p className="text-slate-900">{deposito.cliente.email}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-500">Teléfono</label>
                            <p className="text-slate-900">{deposito.cliente.telefono}</p>
                          </div>
                          <div>
                            <Link
                              href={`/clientes/${deposito.cliente.id}`}
                              className="text-green-600 hover:text-green-800 font-medium"
                            >
                              Ver perfil completo →
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Vehículo */}
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-4">Vehículo</h3>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-slate-500">Marca y modelo</label>
                            <p className="text-slate-900">{deposito.vehiculo.marca} {deposito.vehiculo.modelo}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-500">Matrícula</label>
                            <p className="text-slate-900">{deposito.vehiculo.matricula}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-500">Referencia</label>
                            <p className="text-slate-900">{deposito.vehiculo.referencia}</p>
                          </div>
                          <div>
                            <Link
                              href={`/vehiculos/${deposito.vehiculo.id}`}
                              className="text-green-600 hover:text-green-800 font-medium"
                            >
                              Ver vehículo completo →
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Datos del depósito */}
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-4">Datos del Depósito</h3>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-slate-500">Fecha de inicio</label>
                            <p className="text-slate-900">{new Date(deposito.fecha_inicio).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-500">Fecha de fin</label>
                            <p className="text-slate-900">{deposito.fecha_fin ? new Date(deposito.fecha_fin).toLocaleDateString() : 'No finalizado'}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-500">Precio de venta</label>
                            <p className="text-slate-900">{deposito.precio_venta ? `€${deposito.precio_venta.toLocaleString()}` : 'No especificado'}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-500">Comisión</label>
                            <p className="text-slate-900">{deposito.comision_porcentaje}%</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'notas' && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Notas del Depósito</h3>
                    <div className="bg-slate-50 rounded-lg p-4">
                      {deposito.notas ? (
                        <p className="text-slate-900 whitespace-pre-wrap">{deposito.notas}</p>
                      ) : (
                        <p className="text-slate-500 italic">No hay notas para este depósito</p>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'documentos' && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Documentos</h3>
                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-lg p-4">
                        <h4 className="font-medium text-slate-900 mb-2">Contrato de Depósito</h4>
                        <p className="text-sm text-slate-500 mb-3">Documento oficial del depósito de venta</p>
                        <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                          Generar Contrato
                        </button>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <h4 className="font-medium text-slate-900 mb-2">Otros Documentos</h4>
                        <p className="text-sm text-slate-500">Próximamente disponibles</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Panel lateral */}
          <div className="space-y-6">
            {/* Acciones rápidas */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Acciones</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setEditMode(!editMode)}
                  className="w-full bg-slate-100 text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  {editMode ? 'Cancelar Edición' : 'Editar Depósito'}
                </button>
                
                {deposito.estado === 'ACTIVO' && (
                  <button
                    onClick={convertirEnVenta}
                    className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Convertir en Venta
                  </button>
                )}
                
                <Link
                  href={`/clientes/${deposito.cliente_id}`}
                  className="w-full bg-blue-100 text-blue-800 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors text-center block"
                >
                  Ver Cliente
                </Link>
                
                <Link
                  href={`/vehiculos/${deposito.vehiculo_id}`}
                  className="w-full bg-purple-100 text-purple-800 px-4 py-2 rounded-lg hover:bg-purple-200 transition-colors text-center block"
                >
                  Ver Vehículo
                </Link>
              </div>
            </div>

            {/* Edición rápida */}
            {editMode && (
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Editar Depósito</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                    <select
                      value={editData.estado}
                      onChange={(e) => setEditData(prev => ({ ...prev, estado: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="BORRADOR">Borrador</option>
                      <option value="ACTIVO">Activo</option>
                      <option value="FINALIZADO">Finalizado</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Precio de Venta</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editData.precio_venta}
                      onChange={(e) => setEditData(prev => ({ ...prev, precio_venta: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Comisión (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editData.comision_porcentaje}
                      onChange={(e) => setEditData(prev => ({ ...prev, comision_porcentaje: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                    <textarea
                      value={editData.notas}
                      onChange={(e) => setEditData(prev => ({ ...prev, notas: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  
                  <button
                    onClick={handleUpdate}
                    disabled={isUpdating}
                    className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {isUpdating ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
