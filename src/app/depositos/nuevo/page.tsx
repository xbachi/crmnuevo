'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast, ToastContainer } from '@/hooks/useToast'
import VehicleForm from '@/components/VehicleForm'

interface Cliente {
  id: number
  nombre: string
  apellidos: string
  email: string
  telefono: string
  dni: string
}

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  tipo: string
}

export default function NuevoDepositoPage() {
  const router = useRouter()
  const { showToast, ToastContainer } = useToast()
  
  const [isLoading, setIsLoading] = useState(false)
  
  // Búsquedas (igual que en deals)
  const [clienteSearch, setClienteSearch] = useState('')
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [selectedVehiculo, setSelectedVehiculo] = useState<Vehiculo | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  
  // Datos del depósito
  const [precioVenta, setPrecioVenta] = useState('')
  const [comisionPorcentaje, setComisionPorcentaje] = useState('5.0')
  const [notas, setNotas] = useState('')
  
  // Formularios de creación
  const [showClienteForm, setShowClienteForm] = useState(false)
  const [showVehiculoForm, setShowVehiculoForm] = useState(false)
  const [newCliente, setNewCliente] = useState({
    nombre: '',
    apellidos: '',
    email: '',
    telefono: '',
    dni: '',
    direccion: '',
    ciudad: '',
    provincia: '',
    codPostal: '',
    comoLlego: 'No especificado',
    fechaPrimerContacto: new Date().toISOString().split('T')[0],
    estado: 'nuevo',
    prioridad: 'media',
    proximoPaso: '',
    notas: ''
  })
  const [newVehiculo, setNewVehiculo] = useState({
    referencia: '',
    marca: '',
    modelo: '',
    matricula: '',
    bastidor: '',
    kms: '',
    precio_compra: '',
    precio_publicacion: '',
    color: '',
    fechaMatriculacion: '',
    año: '',
    itv: false,
    seguro: false,
    segundaLlave: false,
    carpeta: false,
    master: false,
    hojasA: false,
    documentacion: false
  })

  // Cargar datos iniciales (igual que en deals)
  useEffect(() => {
    fetchClientes()
    fetchVehiculos()
  }, [])

  const fetchClientes = async () => {
    try {
      const response = await fetch('/api/clientes')
      if (response.ok) {
        const data = await response.json()
        setClientes(data)
      }
    } catch (error) {
      console.error('Error fetching clientes:', error)
    }
  }

  const fetchVehiculos = async () => {
    try {
      // Obtener vehículos de tipo D (Depósito)
      const response = await fetch('/api/vehiculos?tipo=D')
      if (response.ok) {
        const data = await response.json()
        setVehiculos(data.vehiculos || data)
      }
    } catch (error) {
      console.error('Error fetching vehiculos:', error)
    }
  }

  const createCliente = async () => {
    try {
      const response = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCliente)
      })
      
      if (response.ok) {
        const cliente = await response.json()
        setSelectedCliente(cliente)
        setShowClienteForm(false)
        setClienteSearch('')
        setNewCliente({
          nombre: '',
          apellidos: '',
          email: '',
          telefono: '',
          dni: '',
          direccion: '',
          ciudad: '',
          provincia: '',
          codPostal: '',
          comoLlego: 'No especificado',
          fechaPrimerContacto: new Date().toISOString().split('T')[0],
          estado: 'nuevo',
          prioridad: 'media',
          proximoPaso: '',
          notas: ''
        })
        showToast('Cliente creado exitosamente', 'success')
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error al crear cliente', 'error')
    }
  }

  const createVehiculo = async () => {
    try {
      const vehiculoData = {
        ...newVehiculo,
        tipo: 'D', // Tipo Depósito
        kms: parseInt(newVehiculo.kms) || 0,
        precio_compra: parseFloat(newVehiculo.precio_compra) || 0,
        precio_publicacion: parseFloat(newVehiculo.precio_publicacion) || 0,
        año: parseInt(newVehiculo.año) || new Date().getFullYear()
      }
      
      const response = await fetch('/api/vehiculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehiculoData)
      })
      
      if (response.ok) {
        const vehiculo = await response.json()
        setSelectedVehiculo(vehiculo)
        setShowVehiculoForm(false)
        setVehiculoSearch('')
        setNewVehiculo({
          referencia: '',
          marca: '',
          modelo: '',
          matricula: '',
          bastidor: '',
          kms: '',
          precio_compra: '',
          precio_publicacion: '',
          color: '',
          fechaMatriculacion: '',
          año: '',
          itv: false,
          seguro: false,
          segundaLlave: false,
          carpeta: false,
          master: false,
          hojasA: false,
          documentacion: false
        })
        showToast('Vehículo creado exitosamente', 'success')
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error al crear vehículo', 'error')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      // Validaciones (igual que en deals)
      if (!selectedCliente) {
        showToast('Debes seleccionar un cliente', 'error')
        return
      }
      
      if (!selectedVehiculo) {
        showToast('Debes seleccionar un vehículo', 'error')
        return
      }

      // Preparar datos para enviar
      const depositoData = {
        cliente_id: selectedCliente.id,
        vehiculo_id: selectedVehiculo.id,
        precio_venta: precioVenta ? parseFloat(precioVenta) : null,
        comision_porcentaje: parseFloat(comisionPorcentaje),
        notas: notas,
        fecha_inicio: new Date().toISOString().split('T')[0]
      }

             console.log('📤 Enviando depósito:', depositoData)
             console.log('🔍 Debug: selectedCliente.id =', selectedCliente.id, 'selectedVehiculo.id =', selectedVehiculo.id)
             console.log('🔍 Debug: selectedVehiculo completo =', selectedVehiculo)

             // Enviar a la API
      const response = await fetch('/api/depositos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(depositoData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al crear el depósito')
      }

      const newDeposito = await response.json()
      console.log('✅ Depósito creado:', newDeposito)

      showToast('Depósito creado exitosamente', 'success')
      router.push(`/depositos/${newDeposito.id}`)
    } catch (error) {
      console.error('❌ Error creando depósito:', error)
      showToast(`Error al crear el depósito: ${error.message}`, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-lg">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-900">Crear Nuevo Depósito</h1>
              <button
                onClick={() => router.push('/depositos')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Form */}
          <div className="p-6 space-y-6">
            {/* Cliente */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Cliente *
              </label>
              <input
                type="text"
                placeholder="Escribir nombre del cliente..."
                value={selectedCliente ? `${selectedCliente.nombre} ${selectedCliente.apellidos}` : clienteSearch}
                onChange={(e) => {
                  setClienteSearch(e.target.value)
                  if (selectedCliente) {
                    setSelectedCliente(null)
                  }
                }}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {clienteSearch && !selectedCliente && (
                <div className="mt-2 border border-slate-200 rounded-lg bg-white">
                  {clientes
                    .filter(cliente => 
                      `${cliente.nombre} ${cliente.apellidos}`.toLowerCase().includes(clienteSearch.toLowerCase())
                    )
                    .slice(0, 3)
                    .map(cliente => (
                      <div
                        key={cliente.id}
                        onClick={() => {
                          setSelectedCliente(cliente)
                          setClienteSearch('')
                        }}
                        className="px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                      >
                        {cliente.nombre} {cliente.apellidos}
                      </div>
                    ))
                  }
                </div>
              )}
              
              {/* Botón crear cliente - siempre visible */}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowClienteForm(!showClienteForm)}
                  className="w-full px-4 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Crear nuevo cliente</span>
                  <svg className={`w-4 h-4 transition-transform ${showClienteForm ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Acordeón para crear cliente - dentro del campo */}
              {showClienteForm && (
                <div className="mt-4 bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">Crear Nuevo Cliente</h3>
                    <button
                      onClick={() => setShowClienteForm(false)}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Información Personal */}
                    <div className="bg-white rounded-lg p-4">
                      <h4 className="font-medium text-slate-900 mb-3">Información Personal</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                          <input
                            type="text"
                            value={newCliente.nombre}
                            onChange={(e) => setNewCliente(prev => ({ ...prev, nombre: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Apellidos *</label>
                          <input
                            type="text"
                            value={newCliente.apellidos}
                            onChange={(e) => setNewCliente(prev => ({ ...prev, apellidos: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono *</label>
                          <input
                            type="tel"
                            value={newCliente.telefono}
                            onChange={(e) => setNewCliente(prev => ({ ...prev, telefono: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                          <input
                            type="email"
                            value={newCliente.email}
                            onChange={(e) => setNewCliente(prev => ({ ...prev, email: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">DNI</label>
                          <input
                            type="text"
                            value={newCliente.dni}
                            onChange={(e) => setNewCliente(prev => ({ ...prev, dni: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowClienteForm(false)}
                        className="px-4 py-2 text-slate-600 hover:text-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={createCliente}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Crear Cliente
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Vehículo */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Vehículo *
              </label>
              <input
                type="text"
                placeholder="Escribir marca, modelo, matrícula o referencia..."
                value={selectedVehiculo ? `${selectedVehiculo.marca || ''} ${selectedVehiculo.modelo || ''} - ${selectedVehiculo.matricula || ''}` : vehiculoSearch}
                onChange={(e) => {
                  setVehiculoSearch(e.target.value)
                  if (selectedVehiculo) {
                    setSelectedVehiculo(null)
                  }
                }}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {vehiculoSearch && !selectedVehiculo && (
                <div className="mt-2 border border-slate-200 rounded-lg bg-white">
                  {vehiculos
                    .filter(vehiculo => {
                      const searchLower = vehiculoSearch.toLowerCase()
                      return (
                        vehiculo.marca?.toLowerCase().includes(searchLower) ||
                        vehiculo.modelo?.toLowerCase().includes(searchLower) ||
                        vehiculo.matricula?.toLowerCase().includes(searchLower) ||
                        vehiculo.referencia?.toLowerCase().includes(searchLower)
                      )
                    })
                    .slice(0, 3)
                    .map(vehiculo => (
                      <div
                        key={vehiculo.id}
                        onClick={() => {
                          setSelectedVehiculo(vehiculo)
                          setVehiculoSearch('')
                        }}
                        className="px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                      >
                        {vehiculo.marca} {vehiculo.modelo} - {vehiculo.matricula}
                      </div>
                    ))
                  }
                </div>
              )}
              
              {/* Botón crear vehículo - siempre visible */}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowVehiculoForm(!showVehiculoForm)}
                  className="w-full px-4 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Crear nuevo vehículo</span>
                  <svg className={`w-4 h-4 transition-transform ${showVehiculoForm ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Acordeón para crear vehículo - dentro del campo */}
              {showVehiculoForm && (
                <div className="mt-4 bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">Crear Nuevo Vehículo</h3>
                    <button
                      onClick={() => setShowVehiculoForm(false)}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <VehicleForm
                    asForm={true}
                    initialData={{
                      ...newVehiculo,
                      tipo: 'Deposito Venta' // Fijar el tipo para depósitos
                    }}
                    onSubmit={async (data) => {
                      const vehiculoData = {
                        referencia: data.referencia,
                        marca: data.marca,
                        modelo: data.modelo,
                        matricula: data.matricula,
                        bastidor: data.bastidor,
                        kms: parseInt(data.kms) || 0,
                        tipo: 'D', // Tipo Depósito
                        color: data.color,
                        fechaMatriculacion: data.fechaMatriculacion,
                        esCocheInversor: false,
                        inversorId: null,
                        fechaCompra: null,
                        precioCompra: null,
                        gastosTransporte: null,
                        gastosTasas: null,
                        gastosMecanica: null,
                        gastosPintura: null,
                        gastosLimpieza: null,
                        gastosOtros: null,
                        precioPublicacion: null,
                        precioVenta: null,
                        beneficioNeto: null,
                        notasInversor: null,
                        fotoInversor: null
                      }

                      console.log('🚗 Enviando datos de vehículo:', vehiculoData)
                      const response = await fetch('/api/vehiculos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(vehiculoData)
                      })

                      console.log('📡 Respuesta de creación de vehículo:', response.status, response.ok)
                      
                      if (response.ok) {
                        const responseData = await response.json()
                        console.log('📦 Respuesta completa de la API:', responseData)
                        
                        // La API devuelve { success: true, vehiculo: {...} }
                        const vehiculo = responseData.vehiculo || responseData
                        console.log('🚗 Vehículo extraído:', vehiculo)
                        console.log('🆔 ID del vehículo:', vehiculo.id)
                        
                        // Actualizar la lista de vehículos
                        await fetchVehiculos()
                        
                        // Seleccionar automáticamente el vehículo creado
                        setSelectedVehiculo(vehiculo)
                        console.log('✅ Vehículo seleccionado:', vehiculo)
                        
                        // Verificar que el estado se actualizó
                        setTimeout(() => {
                          console.log('🔍 Estado actualizado - selectedVehiculo:', vehiculo)
                        }, 100)
                        setShowVehiculoForm(false)
                        setVehiculoSearch('')
                        setNewVehiculo({
                          referencia: '',
                          marca: '',
                          modelo: '',
                          matricula: '',
                          bastidor: '',
                          kms: '',
                          precio_compra: '',
                          precio_publicacion: '',
                          color: '',
                          fechaMatriculacion: '',
                          año: '',
                          itv: false,
                          seguro: false,
                          segundaLlave: false,
                          carpeta: false,
                          master: false,
                          hojasA: false,
                          documentacion: false
                        })
                        showToast('Vehículo creado y seleccionado exitosamente', 'success')
                      } else {
                        const error = await response.json()
                        console.error('❌ Error creando vehículo:', error)
                        showToast(`Error: ${error.error}`, 'error')
                      }
                    }}
                    onCancel={() => setShowVehiculoForm(false)}
                    showInversorSection={false}
                    fixedTipo="Deposito Venta"
                    submitText="Crear Vehículo"
                  />
                </div>
              )}
            </div>

            {/* Datos del Depósito */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Precio de Venta Sugerido</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Opcional"
                  value={precioVenta}
                  onChange={(e) => setPrecioVenta(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Comisión (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={comisionPorcentaje}
                  onChange={(e) => setComisionPorcentaje(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Notas</label>
              <textarea
                placeholder="Notas adicionales sobre el depósito..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>


            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={!selectedCliente || !selectedVehiculo || isLoading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Creando...' : 'Crear Depósito'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}