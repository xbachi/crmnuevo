'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { useCache } from '@/contexts/CacheContext'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function CrearDeal() {
  const [clienteSearch, setClienteSearch] = useState('')
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<any>(null)
  const [selectedVehiculo, setSelectedVehiculo] = useState<any>(null)
  const [showVehiculoList, setShowVehiculoList] = useState(false)
  const [showClienteList, setShowClienteList] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { clientes, vehiculos, isLoading, refreshClientes, refreshVehiculos } =
    useCache()
  const [debouncedClienteSearch, setDebouncedClienteSearch] = useState('')
  const [debouncedVehiculoSearch, setDebouncedVehiculoSearch] = useState('')
  const [montoReserva, setMontoReserva] = useState('')
  const [senna, setSenna] = useState('300')
  const [formaPago, setFormaPago] = useState('')
  const [notas, setNotas] = useState('')

  // Estados para creación en el momento
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
    color: '',
    fechaMatriculacion: '',
  })

  const router = useRouter()
  const { showToast } = useToast()

  // Debounce para la búsqueda de clientes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedClienteSearch(clienteSearch)
    }, 150) // 150ms de delay

    return () => clearTimeout(timer)
  }, [clienteSearch])

  // Debounce para la búsqueda de vehículos
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedVehiculoSearch(vehiculoSearch)
    }, 150) // 150ms de delay

    return () => clearTimeout(timer)
  }, [vehiculoSearch])

  // Ocultar lista de vehículos cuando se hace clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-vehiculo-search]')) {
        setShowVehiculoList(false)
      }
      if (!target.closest('[data-cliente-search]')) {
        setShowClienteList(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Filtrado optimizado de clientes
  const filteredClientes = useMemo(() => {
    if (!Array.isArray(clientes)) return []

    if (!debouncedClienteSearch.trim()) {
      // Mostrar los últimos 5 clientes cuando no hay búsqueda
      return clientes
        .sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
        )
        .slice(0, 5)
    }

    const searchTerm = debouncedClienteSearch.toLowerCase().trim()
    return clientes
      .filter((cliente) => {
        const fullName = `${cliente.nombre} ${cliente.apellidos}`.toLowerCase()
        return fullName.includes(searchTerm)
      })
      .slice(0, 5) // Mostrar hasta 5 resultados
  }, [clientes, debouncedClienteSearch])

  // Los datos se cargan automáticamente desde el caché global

  // Estado para deals activos (para filtrar vehículos reservados)
  const [dealsActivos, setDealsActivos] = useState<any[]>([])

  // Cargar deals activos para filtrar vehículos
  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const response = await fetch('/api/deals')
        if (response.ok) {
          const data = await response.json()
          setDealsActivos(data)
        }
      } catch (error) {
        console.error('Error fetching deals:', error)
      }
    }
    fetchDeals()
  }, [])

  // Filtrar vehículos disponibles (no reservados/vendidos)
  const vehiculosDisponibles = useMemo(() => {
    if (!Array.isArray(vehiculos)) return []
    return vehiculos.filter((vehiculo) => {
      const estaReservadoOVendido = dealsActivos.some(
        (deal) =>
          deal.vehiculoId === vehiculo.id &&
          (deal.estado === 'reservado' ||
            deal.estado === 'vendido' ||
            deal.estado === 'facturado')
      )
      return !estaReservadoOVendido
    })
  }, [vehiculos, dealsActivos])

  // Filtrado optimizado de vehículos
  const filteredVehiculos = useMemo(() => {
    if (!Array.isArray(vehiculosDisponibles)) return []

    // Si no hay búsqueda, mostrar los últimos 5 vehículos publicados
    if (!debouncedVehiculoSearch.trim()) {
      return vehiculosDisponibles
        .filter((vehiculo) => vehiculo.estado === 'PUBLICADO')
        .sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
        )
        .slice(0, 5)
    }

    const searchTerm = debouncedVehiculoSearch.toLowerCase().trim()
    return vehiculosDisponibles
      .filter((vehiculo) => {
        const fullName = `${vehiculo.marca} ${vehiculo.modelo}`.toLowerCase()
        const referencia = vehiculo.referencia?.toLowerCase() || ''
        return fullName.includes(searchTerm) || referencia.includes(searchTerm)
      })
      .slice(0, 5) // Mostrar hasta 5 resultados
  }, [vehiculosDisponibles, debouncedVehiculoSearch])

  const createCliente = async () => {
    // Validación para campos obligatorios (incluyendo DNI y dirección para deals)
    if (
      !newCliente.nombre.trim() ||
      !newCliente.apellidos.trim() ||
      !newCliente.telefono.trim() ||
      !newCliente.dni.trim() ||
      !newCliente.calle.trim() ||
      !newCliente.codPostal.trim() ||
      !newCliente.ciudad.trim()
    ) {
      showToast(
        'Por favor completa todos los campos obligatorios (nombre, apellidos, teléfono, DNI, calle, código postal, ciudad)',
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
    // Validación para campos obligatorios
    if (
      !newVehiculo.referencia.trim() ||
      !newVehiculo.marca.trim() ||
      !newVehiculo.modelo.trim() ||
      !newVehiculo.matricula.trim() ||
      !newVehiculo.bastidor.trim() ||
      !newVehiculo.kms.trim()
    ) {
      showToast(
        'Por favor completa todos los campos obligatorios (referencia, marca, modelo, matrícula, bastidor, kms)',
        'error'
      )
      return
    }

    try {
      const vehiculoData = {
        referencia: newVehiculo.referencia,
        marca: newVehiculo.marca,
        modelo: newVehiculo.modelo,
        matricula: newVehiculo.matricula,
        bastidor: newVehiculo.bastidor,
        kms: parseInt(newVehiculo.kms) || 0,
        tipo: 'Compra', // Por defecto es compra para deals
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
          color: '',
          fechaMatriculacion: '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Validaciones
      if (!selectedCliente) {
        showToast('Debes seleccionar un cliente', 'error')
        return
      }

      if (!selectedVehiculo) {
        showToast('Debes seleccionar un vehículo', 'error')
        return
      }

      if (!montoReserva) {
        showToast('Debes ingresar el monto de reserva', 'error')
        return
      }

      if (!formaPago) {
        showToast('Debes seleccionar una forma de pago', 'error')
        return
      }

      // Preparar datos para enviar
      const dealData = {
        clienteId: selectedCliente.id,
        vehiculoId: selectedVehiculo.id,
        importeTotal: parseFloat(montoReserva),
        importeSena: parseFloat(senna),
        formaPagoSena: formaPago,
        observaciones: notas,
        responsableComercial: 'Usuario', // Por ahora hardcodeado
      }

      console.log('📤 Enviando deal:', dealData)

      // Enviar a la API
      const response = await fetch('/api/deals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dealData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al crear el deal')
      }

      const newDeal = await response.json()
      console.log('✅ Deal creado:', newDeal)

      showToast('Deal creado exitosamente', 'success')
      router.push('/deals')
    } catch (error) {
      console.error('❌ Error creando deal:', error)
      showToast(`Error al crear el deal: ${error.message}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-xl shadow-lg">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-slate-900">
                  Crear Nuevo Deal
                </h1>
                <button
                  onClick={() => router.push('/deals')}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
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
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Cliente */}
              <div data-cliente-search>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Cliente *
                </label>
                <input
                  type="text"
                  placeholder="Escribir nombre del cliente..."
                  value={
                    selectedCliente
                      ? `${selectedCliente.nombre} ${selectedCliente.apellidos}`
                      : clienteSearch
                  }
                  onFocus={() => setShowClienteList(true)}
                  onChange={(e) => {
                    setClienteSearch(e.target.value)
                    if (selectedCliente) {
                      setSelectedCliente(null)
                    }
                  }}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {!selectedCliente && showClienteList && (
                  <div className="mt-2 border border-slate-200 rounded-lg bg-white max-h-48 overflow-y-auto">
                    {filteredClientes.length > 0 ? (
                      filteredClientes.map((cliente) => (
                        <div
                          key={cliente.id}
                          onClick={() => {
                            setSelectedCliente(cliente)
                            setClienteSearch('')
                            setShowClienteList(false)
                          }}
                          className={`px-4 py-2 cursor-pointer border-b border-slate-100 last:border-b-0 ${
                            selectedCliente?.id === cliente.id
                              ? 'bg-blue-50 border-blue-200 text-blue-900 font-medium'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          {cliente.nombre} {cliente.apellidos}
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-gray-500 text-sm">
                        No se encontraron clientes
                      </div>
                    )}
                  </div>
                )}

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

                        {/* Campos de dirección obligatorios para deals */}
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
                                  placeholder="Ej: 28001"
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
                                  placeholder="Ej: Madrid"
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

              {/* Vehículo */}
              <div data-vehiculo-search>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Vehículo *
                </label>
                <input
                  type="text"
                  placeholder="Escribir marca, modelo, matrícula o referencia..."
                  value={
                    selectedVehiculo
                      ? `${selectedVehiculo.marca} ${selectedVehiculo.modelo} - ${selectedVehiculo.matricula}`
                      : vehiculoSearch
                  }
                  onFocus={() => setShowVehiculoList(true)}
                  onChange={(e) => {
                    setVehiculoSearch(e.target.value)
                    if (selectedVehiculo) {
                      setSelectedVehiculo(null)
                    }
                  }}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {!selectedVehiculo && showVehiculoList && (
                  <div className="mt-2 border border-slate-200 rounded-lg bg-white max-h-48 overflow-y-auto">
                    {filteredVehiculos.length > 0 ? (
                      filteredVehiculos.map((vehiculo) => (
                        <div
                          key={vehiculo.id}
                          onClick={() => {
                            setSelectedVehiculo(vehiculo)
                            setVehiculoSearch('')
                            setShowVehiculoList(false)
                          }}
                          className="px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                        >
                          {vehiculo.marca} {vehiculo.modelo} -{' '}
                          {vehiculo.matricula}
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-gray-500 text-sm">
                        No se encontraron vehículos
                      </div>
                    )}
                  </div>
                )}

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

                    <div className="space-y-4">
                      <div className="bg-white rounded-lg p-4">
                        <h4 className="font-medium text-slate-900 mb-3">
                          Información del Vehículo
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Referencia *
                            </label>
                            <input
                              type="text"
                              value={newVehiculo.referencia}
                              onChange={(e) =>
                                setNewVehiculo((prev) => ({
                                  ...prev,
                                  referencia: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Ej: #12345"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Marca *
                            </label>
                            <input
                              type="text"
                              value={newVehiculo.marca}
                              onChange={(e) =>
                                setNewVehiculo((prev) => ({
                                  ...prev,
                                  marca: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Ej: Toyota"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Modelo *
                            </label>
                            <input
                              type="text"
                              value={newVehiculo.modelo}
                              onChange={(e) =>
                                setNewVehiculo((prev) => ({
                                  ...prev,
                                  modelo: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Ej: Corolla"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Matrícula *
                            </label>
                            <input
                              type="text"
                              value={newVehiculo.matricula}
                              onChange={(e) =>
                                setNewVehiculo((prev) => ({
                                  ...prev,
                                  matricula: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Ej: 1234ABC"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Bastidor *
                            </label>
                            <input
                              type="text"
                              value={newVehiculo.bastidor}
                              onChange={(e) =>
                                setNewVehiculo((prev) => ({
                                  ...prev,
                                  bastidor: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Ej: 1HGBH41JXMN109186"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Kilómetros *
                            </label>
                            <input
                              type="number"
                              value={newVehiculo.kms}
                              onChange={(e) =>
                                setNewVehiculo((prev) => ({
                                  ...prev,
                                  kms: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Ej: 50000"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Color
                            </label>
                            <input
                              type="text"
                              value={newVehiculo.color}
                              onChange={(e) =>
                                setNewVehiculo((prev) => ({
                                  ...prev,
                                  color: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Ej: Blanco"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Fecha Matriculación
                            </label>
                            <input
                              type="date"
                              value={newVehiculo.fechaMatriculacion}
                              onChange={(e) =>
                                setNewVehiculo((prev) => ({
                                  ...prev,
                                  fechaMatriculacion: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => setShowVehiculoForm(false)}
                          className="px-4 py-2 text-slate-600 hover:text-slate-800"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={createVehiculo}
                          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Crear Vehículo
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Importes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Monto Reserva
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={montoReserva}
                    onChange={(e) => setMontoReserva(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Seña
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={senna}
                    onChange={(e) => setSenna(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Forma de Pago */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Forma de Pago *
                </label>
                <select
                  value={formaPago}
                  onChange={(e) => setFormaPago(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Seleccionar forma de pago...</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="bizum">Bizum</option>
                </select>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Notas
                </label>
                <textarea
                  rows={3}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Notas adicionales del deal..."
                />
              </div>

              {/* Botones */}
              <div className="flex items-center justify-end space-x-4 pt-6 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => router.push('/deals')}
                  className="px-6 py-3 text-slate-600 hover:text-slate-800 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  {isLoading ? 'Creando...' : 'Crear Deal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
