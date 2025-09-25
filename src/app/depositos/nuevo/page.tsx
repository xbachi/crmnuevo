'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast, ToastContainer } from '@/hooks/useToast'
import { useCache } from '@/contexts/CacheContext'
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

  // Búsquedas
  const [clienteSearch, setClienteSearch] = useState('')
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [selectedVehiculo, setSelectedVehiculo] = useState<Vehiculo | null>(
    null
  )
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)
  const { clientes, vehiculos, refreshClientes, refreshVehiculos } = useCache()

  // Datos financieros
  const [montoRecibir, setMontoRecibir] = useState('')
  const [diasGestion, setDiasGestion] = useState('')
  const [multaRetiroAnticipado, setMultaRetiroAnticipado] = useState('')
  const [numeroCuenta, setNumeroCuenta] = useState('')

  // Estado del formulario
  const [currentStep, setCurrentStep] = useState(1) // 1: Cliente, 2: Vehículo, 3: Datos financieros

  // Formularios de creación
  const [showClienteForm, setShowClienteForm] = useState(false)
  const [showVehiculoForm, setShowVehiculoForm] = useState(false)
  const [newCliente, setNewCliente] = useState({
    nombre: '',
    apellidos: '',
    email: '',
    telefono: '',
    dni: '',
    calle: '',
    ciudad: '',
    provincia: '',
    codPostal: '',
    comoLlego: 'No especificado',
    fechaPrimerContacto: new Date().toISOString().split('T')[0],
    estado: 'nuevo',
    prioridad: 'media',
    proximoPaso: '',
    notas: '',
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
    documentacion: false,
  })

  // Los datos se cargan automáticamente desde el caché global

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.dropdown-container')) {
        setShowClienteDropdown(false)
        setShowVehiculoDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Filtrar vehículos de depósito
  const vehiculosDeposito = Array.isArray(vehiculos)
    ? vehiculos.filter((v) => v.tipo === 'Depósito')
    : []

  // Filtrar clientes basado en el término de búsqueda
  const filteredClientes = clientes
    .filter((cliente) => {
      if (!clienteSearch) return true
      const searchLower = clienteSearch.toLowerCase()
      return (
        cliente.nombre.toLowerCase().includes(searchLower) ||
        cliente.apellidos.toLowerCase().includes(searchLower) ||
        cliente.telefono?.includes(searchLower) ||
        cliente.email?.toLowerCase().includes(searchLower) ||
        cliente.dni?.includes(searchLower)
      )
    })
    .slice(0, 5) // Mostrar solo 5 resultados

  // Filtrar vehículos basado en el término de búsqueda
  const filteredVehiculos = vehiculosDeposito
    .filter((vehiculo) => {
      if (!vehiculoSearch) return true
      const searchLower = vehiculoSearch.toLowerCase().trim()
      return (
        vehiculo.marca?.toLowerCase().includes(searchLower) ||
        vehiculo.modelo?.toLowerCase().includes(searchLower) ||
        vehiculo.matricula?.toLowerCase().includes(searchLower) ||
        vehiculo.referencia?.toLowerCase().includes(searchLower) ||
        vehiculo.bastidor?.toLowerCase().includes(searchLower)
      )
    })
    .slice(0, 5) // Mostrar solo 5 resultados

  const createCliente = async () => {
    // Validación para campos obligatorios en depósitos (incluyendo DNI y dirección completa)
    if (
      !newCliente.nombre.trim() ||
      !newCliente.apellidos.trim() ||
      !newCliente.telefono.trim() ||
      !newCliente.dni.trim() ||
      !newCliente.calle.trim() ||
      !newCliente.ciudad.trim() ||
      !newCliente.provincia.trim() ||
      !newCliente.codPostal.trim()
    ) {
      showToast(
        'Por favor completa todos los campos obligatorios (incluyendo DNI y dirección completa)',
        'error'
      )
      return
    }

    try {
      const response = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCliente),
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
          notas: '',
        })
        // Refrescar caché de clientes
        await refreshClientes()
        showToast('Cliente creado y seleccionado exitosamente', 'success')
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
        referencia: newVehiculo.referencia,
        marca: newVehiculo.marca,
        modelo: newVehiculo.modelo,
        matricula: newVehiculo.matricula,
        bastidor: newVehiculo.bastidor,
        kms: parseInt(newVehiculo.kms) || 0,
        tipo: 'D',
        color: newVehiculo.color,
        fechaMatriculacion: newVehiculo.fechaMatriculacion,
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
        fotoInversor: null,
      }

      const response = await fetch('/api/vehiculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehiculoData),
      })

      if (response.ok) {
        const responseData = await response.json()
        const vehiculo = responseData.vehiculo || responseData

        // Refrescar caché de vehículos
        await refreshVehiculos()
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
          documentacion: false,
        })
        showToast('Vehículo creado y seleccionado exitosamente', 'success')
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error al crear vehículo', 'error')
    }
  }

  const nextStep = () => {
    if (currentStep === 1 && selectedCliente) {
      setCurrentStep(2)
    } else if (currentStep === 2 && selectedVehiculo) {
      setCurrentStep(3)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const canProceedToNext = () => {
    switch (currentStep) {
      case 1:
        return selectedCliente !== null
      case 2:
        return selectedVehiculo !== null
      case 3:
        return true // Los datos financieros son opcionales
      default:
        return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      if (!selectedCliente) {
        showToast('Debes seleccionar un cliente', 'error')
        return
      }

      if (!selectedVehiculo) {
        showToast('Debes seleccionar un vehículo', 'error')
        return
      }

      const depositoData = {
        cliente_id: selectedCliente.id,
        vehiculo_id: selectedVehiculo.id,
        precio_venta: null, // No se usa
        comision_porcentaje: 5.0, // Valor por defecto
        notas: '', // Vacío por defecto
        monto_recibir: montoRecibir ? parseFloat(montoRecibir) : null,
        dias_gestion: diasGestion ? parseInt(diasGestion) : null,
        multa_retiro_anticipado: multaRetiroAnticipado
          ? parseFloat(multaRetiroAnticipado)
          : null,
        numero_cuenta: numeroCuenta || null,
        fecha_inicio: new Date().toISOString().split('T')[0],
      }

      console.log('📤 Enviando depósito:', depositoData)

      const response = await fetch('/api/depositos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(depositoData),
      })

      if (response.ok) {
        const deposito = await response.json()
        console.log('✅ Depósito creado:', deposito)
        showToast('Depósito creado exitosamente', 'success')
        console.log('🔄 Redirigiendo a:', `/depositos/${deposito.id}`)
        router.push(`/depositos/${deposito.id}`)
      } else {
        const error = await response.json()
        console.error('❌ Error en respuesta:', error)
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      showToast('Error al crear depósito', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                Nuevo Depósito de Venta
              </h1>
              <p className="text-slate-600 mt-2">
                Crear un nuevo depósito de venta con datos financieros
              </p>
            </div>
            <Link
              href="/depositos"
              className="px-4 py-2 text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              ← Volver a Depósitos
            </Link>
          </div>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          {/* Progress Steps */}
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              {[
                { step: 1, label: 'Cliente', icon: '👤' },
                { step: 2, label: 'Vehículo', icon: '🚗' },
                { step: 3, label: 'Datos Financieros', icon: '💰' },
              ].map(({ step, label, icon }) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                      currentStep >= step
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {currentStep > step ? '✓' : icon}
                  </div>
                  <span
                    className={`ml-2 text-sm font-medium ${
                      currentStep >= step ? 'text-blue-600' : 'text-slate-500'
                    }`}
                  >
                    {label}
                  </span>
                  {step < 3 && (
                    <div
                      className={`w-8 h-0.5 mx-4 ${
                        currentStep > step ? 'bg-blue-600' : 'bg-slate-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Form Content */}
          <div className="p-6 space-y-6">
            {/* Paso 1: Cliente */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">
                    Seleccionar Cliente
                  </h3>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Cliente *
                  </label>
                  <div className="relative dropdown-container">
                    <input
                      type="text"
                      value={clienteSearch}
                      onChange={(e) => {
                        setClienteSearch(e.target.value)
                        setShowClienteDropdown(true)
                      }}
                      onFocus={() => setShowClienteDropdown(true)}
                      placeholder="Escribir nombre del cliente..."
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <svg
                      className="absolute right-3 top-3.5 h-5 w-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>

                    {/* Dropdown de clientes */}
                    {showClienteDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredClientes.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">
                            {clienteSearch
                              ? 'No se encontraron clientes'
                              : 'Escribe para buscar clientes'}
                          </div>
                        ) : (
                          filteredClientes.map((cliente) => (
                            <button
                              key={cliente.id}
                              type="button"
                              onClick={() => {
                                setSelectedCliente(cliente)
                                setClienteSearch(
                                  `${cliente.nombre} ${cliente.apellidos}`
                                )
                                setShowClienteDropdown(false)
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                            >
                              <div className="font-medium text-gray-900">
                                {cliente.nombre} {cliente.apellidos}
                              </div>
                              <div className="text-gray-500">
                                {cliente.telefono}{' '}
                                {cliente.email && `• ${cliente.email}`}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Botón crear cliente */}
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setShowClienteForm(!showClienteForm)}
                      className="w-full px-4 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2"
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      <span>Crear nuevo cliente</span>
                    </button>
                  </div>

                  {/* Acordeón para crear cliente */}
                  {showClienteForm && (
                    <div className="mt-4 bg-slate-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-slate-900">
                          Crear Nuevo Cliente
                        </h3>
                        <button
                          onClick={() => setShowClienteForm(false)}
                          className="text-slate-500 hover:text-slate-700"
                        >
                          <svg
                            className="w-5 h-5"
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
                        <div className="bg-white rounded-lg p-4">
                          <h4 className="font-medium text-slate-900 mb-3">
                            Información Personal
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">
                                Nombre *
                              </label>
                              <input
                                type="text"
                                value={newCliente.nombre}
                                onChange={(e) =>
                                  setNewCliente((prev) => ({
                                    ...prev,
                                    nombre: e.target.value,
                                  }))
                                }
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">
                                Apellidos *
                              </label>
                              <input
                                type="text"
                                value={newCliente.apellidos}
                                onChange={(e) =>
                                  setNewCliente((prev) => ({
                                    ...prev,
                                    apellidos: e.target.value,
                                  }))
                                }
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">
                                Teléfono *
                              </label>
                              <input
                                type="tel"
                                value={newCliente.telefono}
                                onChange={(e) =>
                                  setNewCliente((prev) => ({
                                    ...prev,
                                    telefono: e.target.value,
                                  }))
                                }
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">
                                Email
                              </label>
                              <input
                                type="email"
                                value={newCliente.email}
                                onChange={(e) =>
                                  setNewCliente((prev) => ({
                                    ...prev,
                                    email: e.target.value,
                                  }))
                                }
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">
                                DNI *
                              </label>
                              <input
                                type="text"
                                value={newCliente.dni}
                                onChange={(e) =>
                                  setNewCliente((prev) => ({
                                    ...prev,
                                    dni: e.target.value,
                                  }))
                                }
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Ej: 12345678A"
                              />
                            </div>
                          </div>

                          {/* Campos de dirección obligatorios para depósitos */}
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <h4 className="font-medium text-slate-900 mb-3">
                              Dirección *
                            </h4>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                  Calle *
                                </label>
                                <input
                                  type="text"
                                  value={newCliente.calle}
                                  onChange={(e) =>
                                    setNewCliente((prev) => ({
                                      ...prev,
                                      calle: e.target.value,
                                    }))
                                  }
                                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="Ej: Calle Mayor 123"
                                />
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Código Postal *
                                  </label>
                                  <input
                                    type="text"
                                    value={newCliente.codPostal}
                                    onChange={(e) =>
                                      setNewCliente((prev) => ({
                                        ...prev,
                                        codPostal: e.target.value,
                                      }))
                                    }
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Ej: 46001"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Ciudad *
                                  </label>
                                  <input
                                    type="text"
                                    value={newCliente.ciudad}
                                    onChange={(e) =>
                                      setNewCliente((prev) => ({
                                        ...prev,
                                        ciudad: e.target.value,
                                      }))
                                    }
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Ej: Valencia"
                                  />
                                </div>
                              </div>
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
              </div>
            )}

            {/* Paso 2: Vehículo */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">
                    Seleccionar Vehículo
                  </h3>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Vehículo *
                  </label>
                  <div className="relative dropdown-container">
                    <input
                      type="text"
                      value={vehiculoSearch}
                      onChange={(e) => {
                        setVehiculoSearch(e.target.value)
                        setShowVehiculoDropdown(true)
                      }}
                      onFocus={() => setShowVehiculoDropdown(true)}
                      placeholder="Escribir marca, modelo, matrícula o referencia..."
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <svg
                      className="absolute right-3 top-3.5 h-5 w-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>

                    {/* Dropdown de vehículos */}
                    {showVehiculoDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredVehiculos.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">
                            {vehiculoSearch
                              ? 'No se encontraron vehículos'
                              : 'No hay vehículos de depósito disponibles'}
                          </div>
                        ) : (
                          filteredVehiculos.map((vehiculo) => (
                            <button
                              key={vehiculo.id}
                              type="button"
                              onClick={() => {
                                setSelectedVehiculo(vehiculo)
                                setVehiculoSearch(
                                  `${vehiculo.marca} ${vehiculo.modelo} - ${vehiculo.matricula}`
                                )
                                setShowVehiculoDropdown(false)
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                            >
                              <div className="font-medium text-gray-900">
                                {vehiculo.marca} {vehiculo.modelo}
                              </div>
                              <div className="text-gray-500">
                                {vehiculo.matricula} • {vehiculo.referencia}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Botón crear vehículo */}
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setShowVehiculoForm(!showVehiculoForm)}
                      className="w-full px-4 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2"
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      <span>Crear nuevo vehículo</span>
                    </button>
                  </div>

                  {/* Acordeón para crear vehículo */}
                  {showVehiculoForm && (
                    <div className="mt-4 bg-slate-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-slate-900">
                          Crear Nuevo Vehículo
                        </h3>
                        <button
                          onClick={() => setShowVehiculoForm(false)}
                          className="text-slate-500 hover:text-slate-700"
                        >
                          <svg
                            className="w-5 h-5"
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

                      <VehicleForm
                        asForm={true}
                        initialData={{
                          ...newVehiculo,
                          tipo: 'Deposito Venta',
                        }}
                        onSubmit={async (data) => {
                          const vehiculoData = {
                            referencia: data.referencia,
                            marca: data.marca,
                            modelo: data.modelo,
                            matricula: data.matricula,
                            bastidor: data.bastidor,
                            kms: parseInt(data.kms) || 0,
                            tipo: 'D',
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
                            fotoInversor: null,
                          }

                          const response = await fetch('/api/vehiculos', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(vehiculoData),
                          })

                          if (response.ok) {
                            const responseData = await response.json()
                            const vehiculo =
                              responseData.vehiculo || responseData

                            // Refrescar caché de vehículos
                            await refreshVehiculos()
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
                              documentacion: false,
                            })
                            showToast(
                              'Vehículo creado y seleccionado exitosamente',
                              'success'
                            )
                          } else {
                            const error = await response.json()
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
              </div>
            )}

            {/* Paso 3: Datos Financieros */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">
                    Datos Financieros del Depósito
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Monto que va a recibir el propietario (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={montoRecibir}
                        onChange={(e) => setMontoRecibir(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Ej: 15000.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Días de gestión
                      </label>
                      <input
                        type="number"
                        value={diasGestion}
                        onChange={(e) => setDiasGestion(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Ej: 90"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Multa por retiro anticipado (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={multaRetiroAnticipado}
                        onChange={(e) =>
                          setMultaRetiroAnticipado(e.target.value)
                        }
                        className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Ej: 500.00"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Número de cuenta
                      </label>
                      <input
                        type="text"
                        value={numeroCuenta}
                        onChange={(e) => setNumeroCuenta(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                        placeholder="ES12 3456 7890 1234 5678 9012"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-6 border-t border-slate-200">
              <button
                type="button"
                onClick={prevStep}
                disabled={currentStep === 1}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                ← Anterior
              </button>

              <div className="flex space-x-2">
                {currentStep < 3 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    disabled={!canProceedToNext()}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Siguiente →
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={
                      !selectedCliente || !selectedVehiculo || isLoading
                    }
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? 'Creando...' : 'Crear Depósito'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}
