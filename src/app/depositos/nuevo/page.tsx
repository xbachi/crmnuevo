'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast, ToastContainer } from '@/hooks/useToast'

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
  
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  
  // Datos del depósito
  const [depositoData, setDepositoData] = useState({
    cliente_id: null as number | null,
    vehiculo_id: null as number | null,
    precio_venta: '',
    comision_porcentaje: '5.0',
    notas: ''
  })
  
  // Búsquedas
  const [searchCliente, setSearchCliente] = useState('')
  const [searchVehiculo, setSearchVehiculo] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [selectedVehiculo, setSelectedVehiculo] = useState<Vehiculo | null>(null)
  
  // Formularios de creación
  const [showClienteForm, setShowClienteForm] = useState(false)
  const [showVehiculoForm, setShowVehiculoForm] = useState(false)
  const [newCliente, setNewCliente] = useState({
    nombre: '',
    apellidos: '',
    email: '',
    telefono: '',
    dni: ''
  })
  const [newVehiculo, setNewVehiculo] = useState({
    referencia: '',
    marca: '',
    modelo: '',
    matricula: '',
    bastidor: '',
    kms: '',
    precio_compra: '',
    precio_publicacion: ''
  })

  // Debounce para búsqueda de clientes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchCliente.length >= 2) {
        searchClientes()
      } else {
        setClientes([])
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchCliente])

  // Debounce para búsqueda de vehículos
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchVehiculo.length >= 2) {
        searchVehiculos()
      } else {
        setVehiculos([])
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchVehiculo])

  const searchClientes = async () => {
    try {
      const response = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(searchCliente)}`)
      if (response.ok) {
        const data = await response.json()
        setClientes(data)
      }
    } catch (error) {
      console.error('Error searching clientes:', error)
    }
  }

  const searchVehiculos = async () => {
    try {
      const response = await fetch(`/api/vehiculos?search=${encodeURIComponent(searchVehiculo)}&tipo=D`)
      if (response.ok) {
        const data = await response.json()
        setVehiculos(data)
      }
    } catch (error) {
      console.error('Error searching vehiculos:', error)
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
        setDepositoData(prev => ({ ...prev, cliente_id: cliente.id }))
        setShowClienteForm(false)
        setSearchCliente('') // Limpiar búsqueda
        setClientes([]) // Limpiar resultados
        setNewCliente({ nombre: '', apellidos: '', email: '', telefono: '', dni: '' })
        showToast('Cliente creado exitosamente', 'success')
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error al crear cliente', 'error')
    }
  }

  const selectCliente = (cliente: Cliente) => {
    setSelectedCliente(cliente)
    setDepositoData(prev => ({ ...prev, cliente_id: cliente.id }))
    setSearchCliente('')
    setClientes([])
  }

  const selectVehiculo = (vehiculo: Vehiculo) => {
    setSelectedVehiculo(vehiculo)
    setDepositoData(prev => ({ ...prev, vehiculo_id: vehiculo.id }))
    setSearchVehiculo('')
    setVehiculos([])
  }

  const createVehiculo = async () => {
    try {
      const vehiculoData = {
        ...newVehiculo,
        tipo: 'D', // Tipo Depósito
        kms: parseInt(newVehiculo.kms) || 0,
        precio_compra: parseFloat(newVehiculo.precio_compra) || 0,
        precio_publicacion: parseFloat(newVehiculo.precio_publicacion) || 0
      }
      
      const response = await fetch('/api/vehiculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehiculoData)
      })
      
      if (response.ok) {
        const vehiculo = await response.json()
        setSelectedVehiculo(vehiculo)
        setDepositoData(prev => ({ ...prev, vehiculo_id: vehiculo.id }))
        setShowVehiculoForm(false)
        setSearchVehiculo('') // Limpiar búsqueda
        setVehiculos([]) // Limpiar resultados
        setNewVehiculo({ referencia: '', marca: '', modelo: '', matricula: '', bastidor: '', kms: '', precio_compra: '', precio_publicacion: '' })
        showToast('Vehículo creado exitosamente', 'success')
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error al crear vehículo', 'error')
    }
  }

  const handleSubmit = async () => {
    if (!depositoData.cliente_id || !depositoData.vehiculo_id) {
      showToast('Debe seleccionar un cliente y un vehículo', 'error')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/depositos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...depositoData,
          precio_venta: depositoData.precio_venta ? parseFloat(depositoData.precio_venta) : null,
          comision_porcentaje: parseFloat(depositoData.comision_porcentaje),
          fecha_inicio: new Date().toISOString().split('T')[0]
        })
      })

      if (response.ok) {
        const deposito = await response.json()
        showToast('Depósito creado exitosamente', 'success')
        router.push(`/depositos/${deposito.id}`)
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error al crear depósito', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <Link href="/depositos" className="text-slate-600 hover:text-slate-900">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-3xl font-bold text-slate-900">Nuevo Depósito de Venta</h1>
          </div>
          
          {/* Progress Steps */}
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 ${currentStep >= 1 ? 'text-green-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 1 ? 'bg-green-600 text-white' : 'bg-slate-200'}`}>
                1
              </div>
              <span className="font-medium">Datos del Cliente</span>
            </div>
            <div className="w-8 h-0.5 bg-slate-200"></div>
            <div className={`flex items-center space-x-2 ${currentStep >= 2 ? 'text-green-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 2 ? 'bg-green-600 text-white' : 'bg-slate-200'}`}>
                2
              </div>
              <span className="font-medium">Datos del Vehículo</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
          {/* Paso 1: Datos del Cliente */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-900">Seleccionar Cliente</h2>
              
              {/* Búsqueda de cliente */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Buscar cliente existente
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar por nombre, email, teléfono o DNI..."
                    value={searchCliente}
                    onChange={(e) => setSearchCliente(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                
                {/* Lista de clientes encontrados */}
                {clientes.length > 0 && (
                  <div className="mt-2 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                    {clientes.map((cliente) => (
                      <button
                        key={cliente.id}
                        onClick={() => selectCliente(cliente)}
                        className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                      >
                        <div className="font-medium text-slate-900">{cliente.nombre} {cliente.apellidos}</div>
                        <div className="text-sm text-slate-500">{cliente.email} • {cliente.telefono}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cliente seleccionado */}
              {selectedCliente && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-green-900">{selectedCliente.nombre} {selectedCliente.apellidos}</div>
                      <div className="text-sm text-green-700">{selectedCliente.email} • {selectedCliente.telefono}</div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCliente(null)
                        setDepositoData(prev => ({ ...prev, cliente_id: null }))
                      }}
                      className="text-green-600 hover:text-green-800"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Crear nuevo cliente */}
              <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-slate-900">O crear nuevo cliente</h3>
                  <button
                    onClick={() => setShowClienteForm(!showClienteForm)}
                    className="text-green-600 hover:text-green-800 font-medium"
                  >
                    {showClienteForm ? 'Cancelar' : 'Crear cliente'}
                  </button>
                </div>

                {showClienteForm && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                      <input
                        type="text"
                        value={newCliente.nombre}
                        onChange={(e) => setNewCliente(prev => ({ ...prev, nombre: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Apellidos</label>
                      <input
                        type="text"
                        value={newCliente.apellidos}
                        onChange={(e) => setNewCliente(prev => ({ ...prev, apellidos: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={newCliente.email}
                        onChange={(e) => setNewCliente(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                      <input
                        type="tel"
                        value={newCliente.telefono}
                        onChange={(e) => setNewCliente(prev => ({ ...prev, telefono: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">DNI</label>
                      <input
                        type="text"
                        value={newCliente.dni}
                        onChange={(e) => setNewCliente(prev => ({ ...prev, dni: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        onClick={createCliente}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Crear Cliente
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Botón siguiente */}
              <div className="flex justify-end">
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={!selectedCliente}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {/* Paso 2: Datos del Vehículo */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-900">Seleccionar Vehículo</h2>
              
              {/* Búsqueda de vehículo */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Buscar vehículo existente
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar por marca, modelo, matrícula o bastidor..."
                    value={searchVehiculo}
                    onChange={(e) => setSearchVehiculo(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                
                {/* Lista de vehículos encontrados */}
                {vehiculos.length > 0 && (
                  <div className="mt-2 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                    {vehiculos.map((vehiculo) => (
                      <button
                        key={vehiculo.id}
                        onClick={() => selectVehiculo(vehiculo)}
                        className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                      >
                        <div className="font-medium text-slate-900">{vehiculo.marca} {vehiculo.modelo}</div>
                        <div className="text-sm text-slate-500">{vehiculo.matricula} • {vehiculo.bastidor}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Vehículo seleccionado */}
              {selectedVehiculo && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-green-900">{selectedVehiculo.marca} {selectedVehiculo.modelo}</div>
                      <div className="text-sm text-green-700">{selectedVehiculo.matricula} • {selectedVehiculo.bastidor}</div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedVehiculo(null)
                        setDepositoData(prev => ({ ...prev, vehiculo_id: null }))
                      }}
                      className="text-green-600 hover:text-green-800"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Crear nuevo vehículo */}
              <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-slate-900">O crear nuevo vehículo</h3>
                  <button
                    onClick={() => setShowVehiculoForm(!showVehiculoForm)}
                    className="text-green-600 hover:text-green-800 font-medium"
                  >
                    {showVehiculoForm ? 'Cancelar' : 'Crear vehículo'}
                  </button>
                </div>

                {showVehiculoForm && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Referencia</label>
                      <input
                        type="text"
                        value={newVehiculo.referencia}
                        onChange={(e) => setNewVehiculo(prev => ({ ...prev, referencia: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Marca</label>
                      <input
                        type="text"
                        value={newVehiculo.marca}
                        onChange={(e) => setNewVehiculo(prev => ({ ...prev, marca: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Modelo</label>
                      <input
                        type="text"
                        value={newVehiculo.modelo}
                        onChange={(e) => setNewVehiculo(prev => ({ ...prev, modelo: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Matrícula</label>
                      <input
                        type="text"
                        value={newVehiculo.matricula}
                        onChange={(e) => setNewVehiculo(prev => ({ ...prev, matricula: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Bastidor</label>
                      <input
                        type="text"
                        value={newVehiculo.bastidor}
                        onChange={(e) => setNewVehiculo(prev => ({ ...prev, bastidor: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">KMs</label>
                      <input
                        type="number"
                        value={newVehiculo.kms}
                        onChange={(e) => setNewVehiculo(prev => ({ ...prev, kms: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Precio Compra</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newVehiculo.precio_compra}
                        onChange={(e) => setNewVehiculo(prev => ({ ...prev, precio_compra: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Precio Publicación</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newVehiculo.precio_publicacion}
                        onChange={(e) => setNewVehiculo(prev => ({ ...prev, precio_publicacion: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        onClick={createVehiculo}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Crear Vehículo
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Datos adicionales del depósito */}
              {selectedVehiculo && (
                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-lg font-medium text-slate-900 mb-4">Datos del Depósito</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Precio de Venta Sugerido</label>
                      <input
                        type="number"
                        step="0.01"
                        value={depositoData.precio_venta}
                        onChange={(e) => setDepositoData(prev => ({ ...prev, precio_venta: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Opcional"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Comisión (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={depositoData.comision_porcentaje}
                        onChange={(e) => setDepositoData(prev => ({ ...prev, comision_porcentaje: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                      <textarea
                        value={depositoData.notas}
                        onChange={(e) => setDepositoData(prev => ({ ...prev, notas: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Notas adicionales sobre el depósito..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Botones */}
              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="bg-slate-200 text-slate-800 px-6 py-2 rounded-lg hover:bg-slate-300 transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!selectedVehiculo || isLoading}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Creando...' : 'Crear Depósito'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
