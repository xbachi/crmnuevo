'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Cliente, NotaCliente } from '@/lib/database'
import Navigation from '@/components/Navigation'
import { useSimpleToast } from '@/hooks/useSimpleToast'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'

export default function ClienteDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { showToast, ToastContainer } = useSimpleToast()
  
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [notas, setNotas] = useState<NotaCliente[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showNotaForm, setShowNotaForm] = useState(false)
  const [isAddingNota, setIsAddingNota] = useState(false)
  
  const [editData, setEditData] = useState({
    nombre: '',
    apellidos: '',
    telefono: '',
    email: '',
    whatsapp: '',
    comoLlego: '',
    fechaPrimerContacto: '',
    estado: 'nuevo' as const,
    prioridad: 'media' as const,
    proximoPaso: '',
    etiquetas: [] as string[],
    intereses: {
      vehiculoPrincipal: '',
      modelosAlternativos: [] as string[],
      precioMaximo: 0,
      kilometrajeMaximo: 0,
      añoMinimo: 0,
      combustiblePreferido: 'cualquiera' as const,
      cambioPreferido: 'cualquiera' as const,
      coloresDeseados: [] as string[],
      necesidadesEspeciales: [] as string[],
      formaPagoPreferida: 'cualquiera' as const
    }
  })
  
  const [notaData, setNotaData] = useState({
    tipo: 'llamada' as const,
    titulo: '',
    contenido: '',
    recordatorio: ''
  })

  const clienteId = params.id as string

  const fetchCliente = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/clientes/${clienteId}`)
      if (!response.ok) throw new Error('Cliente no encontrado')
      const data = await response.json()
      setCliente(data)
      setEditData({
        nombre: data.nombre,
        apellidos: data.apellidos,
        telefono: data.telefono,
        email: data.email || '',
        whatsapp: data.whatsapp || '',
        comoLlego: data.comoLlego,
        fechaPrimerContacto: data.fechaPrimerContacto,
        estado: data.estado,
        prioridad: data.prioridad,
        proximoPaso: data.proximoPaso || '',
        etiquetas: data.etiquetas || [],
        intereses: data.intereses
      })
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar cliente', 'error')
      router.push('/clientes')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchNotas = async () => {
    try {
      const response = await fetch(`/api/clientes/${clienteId}/notas`)
      if (response.ok) {
        const data = await response.json()
        setNotas(data)
      }
    } catch (error) {
      console.error('Error al cargar notas:', error)
    }
  }

  useEffect(() => {
    fetchCliente()
    fetchNotas()
  }, [clienteId])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    if (name.startsWith('intereses.')) {
      const field = name.split('.')[1]
      setEditData(prev => ({
        ...prev,
        intereses: {
          ...prev.intereses,
          [field]: value
        }
      }))
    } else {
      setEditData(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      const response = await fetch(`/api/clientes/${clienteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editData)
      })

      if (response.ok) {
        await fetchCliente()
        setIsEditing(false)
        showToast('Cliente actualizado correctamente', 'success')
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al actualizar cliente', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al actualizar cliente', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddNota = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setIsAddingNota(true)
      const response = await fetch(`/api/clientes/${clienteId}/notas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notaData)
      })

      if (response.ok) {
        await fetchNotas()
        setNotaData({
          tipo: 'llamada',
          titulo: '',
          contenido: '',
          recordatorio: ''
        })
        setShowNotaForm(false)
        showToast('Nota agregada correctamente', 'success')
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al agregar nota', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al agregar nota', 'error')
    } finally {
      setIsAddingNota(false)
    }
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'nuevo': return 'bg-blue-100 text-blue-800'
      case 'en_seguimiento': return 'bg-yellow-100 text-yellow-800'
      case 'cita_agendada': return 'bg-purple-100 text-purple-800'
      case 'cerrado': return 'bg-green-100 text-green-800'
      case 'descartado': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPrioridadColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta': return 'bg-red-100 text-red-800'
      case 'media': return 'bg-yellow-100 text-yellow-800'
      case 'baja': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTipoNotaColor = (tipo: string) => {
    switch (tipo) {
      case 'llamada': return 'bg-blue-100 text-blue-800'
      case 'visita': return 'bg-green-100 text-green-800'
      case 'mensaje': return 'bg-purple-100 text-purple-800'
      case 'presupuesto': return 'bg-orange-100 text-orange-800'
      case 'otro': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSkeleton />
        </main>
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Cliente no encontrado</h1>
            <button
              onClick={() => router.push('/clientes')}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              Volver a Clientes
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <button
                onClick={() => router.push('/clientes')}
                className="text-gray-500 hover:text-gray-700 mb-2 flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Volver a Clientes
              </button>
              <h1 className="text-3xl font-bold text-slate-800 mb-2">
                {cliente.nombre} {cliente.apellidos}
              </h1>
              <div className="flex items-center space-x-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getEstadoColor(cliente.estado)}`}>
                  {cliente.estado.replace('_', ' ')}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPrioridadColor(cliente.prioridad)}`}>
                  Prioridad {cliente.prioridad}
                </span>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                {isEditing ? 'Cancelar' : 'Editar'}
              </button>
              <button
                onClick={() => setShowNotaForm(!showNotaForm)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Agregar Nota
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Información del Cliente */}
          <div className="lg:col-span-2 space-y-6">
            {/* Datos Básicos */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Información Personal</h2>
              
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                      <input
                        type="text"
                        name="nombre"
                        value={editData.nombre}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Apellidos</label>
                      <input
                        type="text"
                        name="apellidos"
                        value={editData.apellidos}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                      <input
                        type="tel"
                        name="telefono"
                        value={editData.telefono}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        name="email"
                        value={editData.email}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                      <input
                        type="tel"
                        name="whatsapp"
                        value={editData.whatsapp}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cómo llegó</label>
                      <select
                        name="comoLlego"
                        value={editData.comoLlego}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="Google">Google</option>
                        <option value="Recomendado">Recomendado</option>
                        <option value="Visita directa">Visita directa</option>
                        <option value="Redes sociales">Redes sociales</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                      <select
                        name="estado"
                        value={editData.estado}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="nuevo">Nuevo</option>
                        <option value="en_seguimiento">En Seguimiento</option>
                        <option value="cita_agendada">Cita Agendada</option>
                        <option value="cerrado">Cerrado</option>
                        <option value="descartado">Descartado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
                      <select
                        name="prioridad"
                        value={editData.prioridad}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="alta">Alta</option>
                        <option value="media">Media</option>
                        <option value="baja">Baja</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Teléfono</p>
                    <p className="font-medium text-gray-900">{cliente.telefono}</p>
                  </div>
                  {cliente.email && (
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-medium text-gray-900">{cliente.email}</p>
                    </div>
                  )}
                  {cliente.whatsapp && (
                    <div>
                      <p className="text-sm text-gray-500">WhatsApp</p>
                      <p className="font-medium text-gray-900">{cliente.whatsapp}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Cómo llegó</p>
                    <p className="font-medium text-gray-900">{cliente.comoLlego}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Primer contacto</p>
                    <p className="font-medium text-gray-900">
                      {new Date(cliente.fechaPrimerContacto).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Intereses */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Intereses del Cliente</h2>
              
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vehículo principal</label>
                      <input
                        type="text"
                        name="intereses.vehiculoPrincipal"
                        value={editData.intereses.vehiculoPrincipal}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Precio máximo (€)</label>
                      <input
                        type="number"
                        name="intereses.precioMaximo"
                        value={editData.intereses.precioMaximo}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Kilometraje máximo</label>
                      <input
                        type="number"
                        name="intereses.kilometrajeMaximo"
                        value={editData.intereses.kilometrajeMaximo}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Año mínimo</label>
                      <input
                        type="number"
                        name="intereses.añoMinimo"
                        value={editData.intereses.añoMinimo}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Combustible</label>
                      <select
                        name="intereses.combustiblePreferido"
                        value={editData.intereses.combustiblePreferido}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="cualquiera">Cualquiera</option>
                        <option value="diesel">Diésel</option>
                        <option value="gasolina">Gasolina</option>
                        <option value="hibrido">Híbrido</option>
                        <option value="electrico">Eléctrico</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cambio</label>
                      <select
                        name="intereses.cambioPreferido"
                        value={editData.intereses.cambioPreferido}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="cualquiera">Cualquiera</option>
                        <option value="manual">Manual</option>
                        <option value="automatico">Automático</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Vehículos de interés</p>
                    <div className="font-medium text-gray-900">
                      {cliente.intereses.vehiculoPrincipal && (
                        <div className="mb-1">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                            Principal: {cliente.intereses.vehiculoPrincipal}
                          </span>
                        </div>
                      )}
                      {cliente.intereses.modelosAlternativos && cliente.intereses.modelosAlternativos.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {cliente.intereses.modelosAlternativos.map((modelo, index) => (
                            <span key={index} className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs">
                              {modelo}
                            </span>
                          ))}
                        </div>
                      )}
                      {!cliente.intereses.vehiculoPrincipal && (!cliente.intereses.modelosAlternativos || cliente.intereses.modelosAlternativos.length === 0) && (
                        <span className="text-gray-500">No especificado</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Precio máximo</p>
                    <p className="font-medium text-gray-900">€{cliente.intereses.precioMaximo.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Kilometraje máximo</p>
                    <p className="font-medium text-gray-900">{cliente.intereses.kilometrajeMaximo.toLocaleString()} km</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Año mínimo</p>
                    <p className="font-medium text-gray-900">{cliente.intereses.añoMinimo || 'No especificado'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Combustible preferido</p>
                    <p className="font-medium text-gray-900 capitalize">{cliente.intereses.combustiblePreferido}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Cambio preferido</p>
                    <p className="font-medium text-gray-900 capitalize">{cliente.intereses.cambioPreferido}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Próximo Paso */}
            {cliente.proximoPaso && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Próximo Paso</h3>
                <p className="text-blue-800">{cliente.proximoPaso}</p>
              </div>
            )}

            {/* Timeline de Notas */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Historial de Interacciones</h2>
                <button
                  onClick={() => setShowNotaForm(!showNotaForm)}
                  className="px-3 py-1 bg-green-500 text-white text-sm rounded-md hover:bg-green-600 transition-colors"
                >
                  {showNotaForm ? 'Cancelar' : 'Agregar Nota'}
                </button>
              </div>

              {/* Formulario de Nota */}
              {showNotaForm && (
                <form onSubmit={handleAddNota} className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                      <select
                        name="tipo"
                        value={notaData.tipo}
                        onChange={(e) => setNotaData(prev => ({ ...prev, tipo: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="llamada">Llamada</option>
                        <option value="visita">Visita</option>
                        <option value="mensaje">Mensaje</option>
                        <option value="presupuesto">Presupuesto</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                      <input
                        type="text"
                        name="titulo"
                        value={notaData.titulo}
                        onChange={(e) => setNotaData(prev => ({ ...prev, titulo: e.target.value }))}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Ej: Llamada de seguimiento"
                      />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contenido</label>
                    <textarea
                      name="contenido"
                      value={notaData.contenido}
                      onChange={(e) => setNotaData(prev => ({ ...prev, contenido: e.target.value }))}
                      required
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Detalles de la interacción..."
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recordatorio (opcional)</label>
                    <input
                      type="text"
                      name="recordatorio"
                      value={notaData.recordatorio}
                      onChange={(e) => setNotaData(prev => ({ ...prev, recordatorio: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Ej: Llamar el viernes"
                    />
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowNotaForm(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isAddingNota}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {isAddingNota ? 'Agregando...' : 'Agregar Nota'}
                    </button>
                  </div>
                </form>
              )}

              {/* Lista de Notas */}
              <div className="space-y-4">
                {notas.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No hay notas registradas</p>
                ) : (
                  notas.map((nota) => (
                    <div key={nota.id} className="border-l-4 border-gray-200 pl-4 py-2">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTipoNotaColor(nota.tipo)}`}>
                            {nota.tipo}
                          </span>
                          <span className="text-sm text-gray-500">{formatDate(nota.fecha)}</span>
                        </div>
                      </div>
                      <h4 className="font-medium text-gray-900 mb-1">{nota.titulo}</h4>
                      <p className="text-gray-700 text-sm mb-2">{nota.contenido}</p>
                      {nota.recordatorio && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                          <p className="text-yellow-800 text-sm">
                            <strong>Recordatorio:</strong> {nota.recordatorio}
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Resumen */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resumen</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Cliente desde</p>
                  <p className="font-medium text-gray-900">
                    {new Date(cliente.createdAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Última actualización</p>
                  <p className="font-medium text-gray-900">
                    {new Date(cliente.updatedAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total de interacciones</p>
                  <p className="font-medium text-gray-900">{notas.length}</p>
                </div>
              </div>
            </div>

            {/* Etiquetas */}
            {cliente.etiquetas && cliente.etiquetas.length > 0 && (
              <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Etiquetas</h3>
                <div className="flex flex-wrap gap-2">
                  {cliente.etiquetas.map((etiqueta, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-gray-100 text-gray-800 text-sm rounded-full"
                    >
                      {etiqueta}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <ToastContainer />
    </div>
  )
}
