'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/useToast'
import { useCache } from '@/contexts/CacheContext'

interface Cliente {
  id: number
  nombre: string
  apellidos: string
  email?: string
  telefono?: string
  dni?: string
  calle?: string
  ciudad?: string
  provincia?: string
  codPostal?: string
}

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  precioPublicacion?: number
  estado: string
}

export default function GeneradorReservasPage() {
  const router = useRouter()
  const { showToast, ToastContainer } = useToast()
  const { clientes, vehiculos, refreshClientes, refreshVehiculos } = useCache()

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

  // Datos del contrato
  const [precioVehiculo, setPrecioVehiculo] = useState('')
  const [montoReserva, setMontoReserva] = useState('')
  const [formaPagoReserva, setFormaPagoReserva] = useState('efectivo')

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

  // Filtrar clientes
  const filteredClientes = clientes.filter((cliente) => {
    const searchTerm = clienteSearch.toLowerCase()
    return (
      cliente.nombre.toLowerCase().includes(searchTerm) ||
      cliente.apellidos.toLowerCase().includes(searchTerm) ||
      cliente.email?.toLowerCase().includes(searchTerm) ||
      cliente.telefono?.includes(searchTerm) ||
      cliente.dni?.toLowerCase().includes(searchTerm)
    )
  })

  // Filtrar vehículos (solo los disponibles)
  const vehiculosDisponibles = vehiculos.filter(
    (vehiculo) =>
      vehiculo.estado === 'PUBLICADO' || vehiculo.estado === 'disponible'
  )

  const filteredVehiculos = vehiculosDisponibles.filter((vehiculo) => {
    const searchTerm = vehiculoSearch.toLowerCase()
    return (
      vehiculo.marca.toLowerCase().includes(searchTerm) ||
      vehiculo.modelo.toLowerCase().includes(searchTerm) ||
      vehiculo.matricula.toLowerCase().includes(searchTerm) ||
      vehiculo.bastidor.toLowerCase().includes(searchTerm) ||
      vehiculo.referencia.toLowerCase().includes(searchTerm)
    )
  })

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.dropdown-container')) {
        setShowClienteDropdown(false)
        setShowVehiculoDropdown(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // Crear cliente
  const createCliente = async () => {
    if (
      !newCliente.nombre.trim() ||
      !newCliente.apellidos.trim() ||
      !newCliente.telefono.trim() ||
      !newCliente.calle.trim() ||
      !newCliente.ciudad.trim() ||
      !newCliente.provincia.trim()
    ) {
      showToast('Por favor, completa todos los campos obligatorios', 'error')
      return
    }

    try {
      setIsLoading(true)
      const response = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCliente),
      })

      if (response.ok) {
        const cliente = await response.json()
        setSelectedCliente(cliente)
        setShowClienteForm(false)
        setNewCliente({
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
        showToast('Cliente creado y seleccionado exitosamente', 'success')
        await refreshClientes()
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      console.error('Error creando cliente:', error)
      showToast('Error al crear el cliente', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Generar contrato de reserva
  const handleGenerarContrato = async () => {
    if (!selectedCliente || !selectedVehiculo) {
      showToast('Por favor, selecciona un cliente y un vehículo', 'error')
      return
    }

    if (!precioVehiculo || !montoReserva) {
      showToast(
        'Por favor, completa el precio del vehículo y el monto de la reserva',
        'error'
      )
      return
    }

    try {
      setIsLoading(true)

      // Preparar datos para el contrato de reserva
      const dealData = {
        numero: `RES-${new Date().getFullYear()}-${Math.floor(
          Math.random() * 1000000
        )
          .toString()
          .padStart(6, '0')}`,
        fechaCreacion: new Date(),
        cliente: {
          nombre: selectedCliente.nombre,
          apellidos: selectedCliente.apellidos,
          dni: selectedCliente.dni || '',
          telefono: selectedCliente.telefono || '',
          email: selectedCliente.email || '',
          calle: selectedCliente.calle || '',
          ciudad: selectedCliente.ciudad || '',
          provincia: selectedCliente.provincia || '',
          codPostal: selectedCliente.codPostal || '',
        },
        vehiculo: {
          marca: selectedVehiculo.marca,
          modelo: selectedVehiculo.modelo,
          matricula: selectedVehiculo.matricula,
          bastidor: selectedVehiculo.bastidor,
          kms: selectedVehiculo.kms,
          precioPublicacion: parseFloat(precioVehiculo),
          fechaMatriculacion: '',
          año: 0,
        },
        importeTotal: parseFloat(precioVehiculo),
        importeSena: parseFloat(montoReserva),
        formaPagoSena: formaPagoReserva,
        fechaReservaDesde: new Date(),
        fechaReservaExpira: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      }

      // Generar el contrato
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dealId: 0, // Contrato independiente
          documentType: 'contrato-reserva',
          dealNumber: dealData.numero,
          dealData,
        }),
      })

      if (response.ok) {
        const result = await response.json()

        // Descargar el documento
        window.open(result.url, '_blank')

        showToast('Contrato de reserva generado exitosamente', 'success')

        // Limpiar formulario
        setSelectedCliente(null)
        setSelectedVehiculo(null)
        setClienteSearch('')
        setVehiculoSearch('')
        setPrecioVehiculo('')
        setMontoReserva('')
        setFormaPagoReserva('efectivo')
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      console.error('Error generando contrato:', error)
      showToast('Error al generar el contrato de reserva', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">
              Generador de Contratos de Reserva
            </h1>
            <p className="text-gray-600 mt-1">
              Genera contratos de reserva de vehículos independientes
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Selección de Cliente */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  placeholder="Buscar cliente por nombre, email, teléfono o DNI..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />

                {selectedCliente && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-green-900">
                          {selectedCliente.nombre} {selectedCliente.apellidos}
                        </p>
                        <p className="text-sm text-green-700">
                          {selectedCliente.telefono} • {selectedCliente.email}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedCliente(null)
                          setClienteSearch('')
                        }}
                        className="text-green-600 hover:text-green-800"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {showClienteDropdown && !selectedCliente && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredClientes.slice(0, 10).map((cliente) => (
                      <div
                        key={cliente.id}
                        onClick={() => {
                          setSelectedCliente(cliente)
                          setClienteSearch(
                            `${cliente.nombre} ${cliente.apellidos}`
                          )
                          setShowClienteDropdown(false)
                        }}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <p className="font-medium text-gray-900">
                          {cliente.nombre} {cliente.apellidos}
                        </p>
                        <p className="text-sm text-gray-500">
                          {cliente.telefono} • {cliente.email}
                        </p>
                      </div>
                    ))}
                    {filteredClientes.length === 0 && (
                      <div className="px-4 py-3 text-gray-500 text-center">
                        No se encontraron clientes
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!selectedCliente && (
                <button
                  onClick={() => setShowClienteForm(true)}
                  className="mt-2 px-4 py-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  + Crear nuevo cliente
                </button>
              )}

              {/* Formulario de creación de cliente */}
              {showClienteForm && (
                <div className="mt-4 bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Crear Nuevo Cliente
                    </h3>
                    <button
                      onClick={() => setShowClienteForm(false)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre *
                      </label>
                      <input
                        type="text"
                        value={newCliente.nombre}
                        onChange={(e) =>
                          setNewCliente({
                            ...newCliente,
                            nombre: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Apellidos *
                      </label>
                      <input
                        type="text"
                        value={newCliente.apellidos}
                        onChange={(e) =>
                          setNewCliente({
                            ...newCliente,
                            apellidos: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Teléfono *
                      </label>
                      <input
                        type="tel"
                        value={newCliente.telefono}
                        onChange={(e) =>
                          setNewCliente({
                            ...newCliente,
                            telefono: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={newCliente.email}
                        onChange={(e) =>
                          setNewCliente({
                            ...newCliente,
                            email: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        DNI
                      </label>
                      <input
                        type="text"
                        value={newCliente.dni}
                        onChange={(e) =>
                          setNewCliente({ ...newCliente, dni: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Calle *
                      </label>
                      <input
                        type="text"
                        value={newCliente.calle}
                        onChange={(e) =>
                          setNewCliente({
                            ...newCliente,
                            calle: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ciudad *
                      </label>
                      <input
                        type="text"
                        value={newCliente.ciudad}
                        onChange={(e) =>
                          setNewCliente({
                            ...newCliente,
                            ciudad: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Provincia *
                      </label>
                      <input
                        type="text"
                        value={newCliente.provincia}
                        onChange={(e) =>
                          setNewCliente({
                            ...newCliente,
                            provincia: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Código Postal
                      </label>
                      <input
                        type="text"
                        value={newCliente.codPostal}
                        onChange={(e) =>
                          setNewCliente({
                            ...newCliente,
                            codPostal: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2 mt-4">
                    <button
                      onClick={() => setShowClienteForm(false)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={createCliente}
                      disabled={isLoading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isLoading ? 'Creando...' : 'Crear Cliente'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Selección de Vehículo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  placeholder="Buscar vehículo por marca, modelo, matrícula o bastidor..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />

                {selectedVehiculo && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-green-900">
                          {selectedVehiculo.marca} {selectedVehiculo.modelo}
                        </p>
                        <p className="text-sm text-green-700">
                          {selectedVehiculo.matricula} •{' '}
                          {selectedVehiculo.kms?.toLocaleString()} km
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedVehiculo(null)
                          setVehiculoSearch('')
                          setPrecioVehiculo('')
                        }}
                        className="text-green-600 hover:text-green-800"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {showVehiculoDropdown && !selectedVehiculo && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredVehiculos.slice(0, 10).map((vehiculo) => (
                      <div
                        key={vehiculo.id}
                        onClick={() => {
                          setSelectedVehiculo(vehiculo)
                          setVehiculoSearch(
                            `${vehiculo.marca} ${vehiculo.modelo}`
                          )
                          setPrecioVehiculo(
                            vehiculo.precioPublicacion?.toString() || ''
                          )
                          setShowVehiculoDropdown(false)
                        }}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <p className="font-medium text-gray-900">
                          {vehiculo.marca} {vehiculo.modelo}
                        </p>
                        <p className="text-sm text-gray-500">
                          {vehiculo.matricula} •{' '}
                          {vehiculo.kms?.toLocaleString()} km •{' '}
                          {vehiculo.precioPublicacion
                            ? `${vehiculo.precioPublicacion.toLocaleString()}€`
                            : 'Sin precio'}
                        </p>
                      </div>
                    ))}
                    {filteredVehiculos.length === 0 && (
                      <div className="px-4 py-3 text-gray-500 text-center">
                        No se encontraron vehículos disponibles
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Datos del Contrato */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio del Vehículo (€) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={precioVehiculo}
                  onChange={(e) => setPrecioVehiculo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ej: 15000.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto de la Reserva (€) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={montoReserva}
                  onChange={(e) => setMontoReserva(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ej: 1000.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Forma de Pago de la Reserva *
                </label>
                <select
                  value={formaPagoReserva}
                  onChange={(e) => setFormaPagoReserva(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </div>
            </div>

            {/* Botón de Generar */}
            <div className="flex justify-center pt-6">
              <button
                onClick={handleGenerarContrato}
                disabled={
                  isLoading ||
                  !selectedCliente ||
                  !selectedVehiculo ||
                  !precioVehiculo ||
                  !montoReserva
                }
                className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                  isLoading ||
                  !selectedCliente ||
                  !selectedVehiculo ||
                  !precioVehiculo ||
                  !montoReserva
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isLoading
                  ? 'Generando Contrato...'
                  : 'Generar Contrato de Reserva'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}
