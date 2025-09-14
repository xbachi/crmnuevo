'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import Link from 'next/link'

interface Cliente {
  id: number
  nombre: string
  apellidos: string
  email?: string
  telefono?: string
  dni?: string
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

export default function NuevoDealPage() {
  const router = useRouter()
  const { showToast, ToastContainer } = useToast()
  
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    clienteId: '',
    vehiculoId: '',
    importeTotal: '',
    importeSena: '300',
    formaPagoSena: '',
    restoAPagar: '',
    financiacion: false,
    entidadFinanciera: '',
    fechaReservaDesde: '',
    fechaReservaExpira: '',
    observaciones: '',
    responsableComercial: ''
  })

  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [selectedVehiculo, setSelectedVehiculo] = useState<Vehiculo | null>(null)
  
  // Estados para los buscadores
  const [clienteSearchTerm, setClienteSearchTerm] = useState('')
  const [vehiculoSearchTerm, setVehiculoSearchTerm] = useState('')
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false)

  useEffect(() => {
    fetchClientes()
    fetchVehiculos()
  }, [])

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

  const fetchClientes = async () => {
    try {
      const response = await fetch('/api/clientes')
      if (response.ok) {
        const data = await response.json()
        setClientes(data)
      }
    } catch (error) {
      console.error('Error cargando clientes:', error)
    }
  }

  const fetchVehiculos = async () => {
    try {
      const response = await fetch('/api/vehiculos?limit=1000') // Traer más vehículos
      if (response.ok) {
        const data = await response.json()
        // Traer todos los vehículos (no filtrar por estado)
        setVehiculos(data.vehiculos || [])
        console.log(`🚗 Vehículos cargados: ${data.vehiculos?.length || 0}`)
      }
    } catch (error) {
      console.error('Error cargando vehículos:', error)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleClienteSelect = (clienteId: string) => {
    const cliente = clientes.find(c => c.id.toString() === clienteId)
    setSelectedCliente(cliente || null)
    setFormData(prev => ({ ...prev, clienteId }))
  }

  const handleVehiculoSelect = (vehiculoId: string) => {
    const vehiculo = vehiculos.find(v => v.id.toString() === vehiculoId)
    setSelectedVehiculo(vehiculo || null)
    setFormData(prev => ({ 
      ...prev, 
      vehiculoId,
      importeTotal: vehiculo?.precioPublicacion?.toString() || ''
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.clienteId || !formData.vehiculoId) {
      showToast('Por favor selecciona un cliente y un vehículo', 'error')
      return
    }

    setIsLoading(true)
    
    try {
      const response = await fetch('/api/deals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          clienteId: parseInt(formData.clienteId),
          vehiculoId: parseInt(formData.vehiculoId),
          importeTotal: formData.importeTotal ? parseFloat(formData.importeTotal) : undefined,
          importeSena: formData.importeSena ? parseFloat(formData.importeSena) : undefined,
          restoAPagar: formData.restoAPagar ? parseFloat(formData.restoAPagar) : undefined,
          fechaReservaDesde: formData.fechaReservaDesde ? new Date(formData.fechaReservaDesde) : undefined,
          fechaReservaExpira: formData.fechaReservaExpira ? new Date(formData.fechaReservaExpira) : undefined
        })
      })

      if (response.ok) {
        const deal = await response.json()
        showToast(`Deal ${deal.numero} creado correctamente`, 'success')
        router.push(`/deals/${deal.id}`)
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al crear el deal', 'error')
      }
    } catch (error) {
      console.error('Error creando deal:', error)
      showToast('Error al crear el deal', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const calcularRestoAPagar = () => {
    const total = parseFloat(formData.importeTotal) || 0
    const sena = parseFloat(formData.importeSena) || 0
    return total - sena
  }

  // Filtrar clientes basado en el término de búsqueda
  const filteredClientes = clientes.filter(cliente => {
    if (!clienteSearchTerm) return true
    const searchLower = clienteSearchTerm.toLowerCase()
    return (
      cliente.nombre.toLowerCase().includes(searchLower) ||
      cliente.apellidos.toLowerCase().includes(searchLower) ||
      cliente.telefono?.includes(searchLower) ||
      cliente.email?.toLowerCase().includes(searchLower) ||
      cliente.dni?.includes(searchLower)
    )
  })

  // Filtrar vehículos basado en el término de búsqueda
  const filteredVehiculos = vehiculos.filter(vehiculo => {
    if (!vehiculoSearchTerm) return true
    const searchLower = vehiculoSearchTerm.toLowerCase().trim()
    
    // Buscar en múltiples campos
    const searchFields = [
      vehiculo.marca?.toLowerCase() || '',
      vehiculo.modelo?.toLowerCase() || '',
      vehiculo.referencia?.toLowerCase() || '',
      vehiculo.matricula?.toLowerCase() || '',
      vehiculo.bastidor?.toLowerCase() || '',
      vehiculo.tipo?.toLowerCase() || '',
      vehiculo.estado?.toLowerCase() || '',
      vehiculo.color?.toLowerCase() || '',
      vehiculo.año?.toString() || ''
    ]
    
    // Buscar en cada campo
    return searchFields.some(field => field.includes(searchLower))
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <ToastContainer />
      
      {/* Header */}
      <div className="bg-slate-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                href="/deals"
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold">Nuevo Deal</h1>
                <p className="text-slate-300 mt-1">
                  Crear una nueva reserva o venta de vehículo
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Selección de Cliente y Vehículo */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Información Principal</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Buscador de Cliente */}
              <div className="relative dropdown-container">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cliente *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={clienteSearchTerm}
                    onChange={(e) => {
                      setClienteSearchTerm(e.target.value)
                      setShowClienteDropdown(true)
                    }}
                    onFocus={() => setShowClienteDropdown(true)}
                    placeholder="Buscar cliente por nombre, apellidos, teléfono, email o DNI..."
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                  />
                  <svg className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                
                {/* Dropdown de clientes */}
                {showClienteDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredClientes.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        {clienteSearchTerm ? 'No se encontraron clientes' : 'Escribe para buscar clientes'}
                      </div>
                    ) : (
                      filteredClientes.map(cliente => (
                        <button
                          key={cliente.id}
                          type="button"
                          onClick={() => {
                            handleClienteSelect(cliente.id.toString())
                            setClienteSearchTerm(`${cliente.nombre} ${cliente.apellidos}`)
                            setShowClienteDropdown(false)
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                        >
                          <div className="font-medium text-gray-900">
                            {cliente.nombre} {cliente.apellidos}
                          </div>
                          <div className="text-gray-500">
                            {cliente.telefono} {cliente.email && `• ${cliente.email}`}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
                
                {selectedCliente && (
                  <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-sm">
                      <p className="font-medium text-green-800">
                        {selectedCliente.nombre} {selectedCliente.apellidos}
                      </p>
                      <p className="text-green-600">{selectedCliente.telefono}</p>
                      {selectedCliente.email && (
                        <p className="text-green-600">{selectedCliente.email}</p>
                      )}
                      {selectedCliente.dni && (
                        <p className="text-green-600">DNI: {selectedCliente.dni}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Buscador de Vehículo */}
              <div className="relative dropdown-container">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vehículo *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={vehiculoSearchTerm}
                    onChange={(e) => {
                      setVehiculoSearchTerm(e.target.value)
                      setShowVehiculoDropdown(true)
                    }}
                    onFocus={() => setShowVehiculoDropdown(true)}
                    placeholder="Buscar por marca, modelo, referencia, matrícula, bastidor, tipo, estado, color, año..."
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                  />
                  <svg className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                
                {/* Dropdown de vehículos */}
                {showVehiculoDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredVehiculos.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        {vehiculoSearchTerm ? 'No se encontraron vehículos' : 'Escribe para buscar vehículos'}
                      </div>
                    ) : (
                      filteredVehiculos.map(vehiculo => (
                        <button
                          key={vehiculo.id}
                          type="button"
                          onClick={() => {
                            handleVehiculoSelect(vehiculo.id.toString())
                            setVehiculoSearchTerm(`${vehiculo.marca} ${vehiculo.modelo} - ${vehiculo.referencia}`)
                            setShowVehiculoDropdown(false)
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-gray-900">
                              {vehiculo.marca} {vehiculo.modelo}
                            </div>
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                              vehiculo.estado === 'disponible' ? 'bg-green-100 text-green-700' :
                              vehiculo.estado === 'reservado' ? 'bg-yellow-100 text-yellow-700' :
                              vehiculo.estado === 'vendido' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {vehiculo.estado || 'Sin estado'}
                            </div>
                          </div>
                          <div className="text-gray-500 text-xs">
                            Ref: {vehiculo.referencia} • Mat: {vehiculo.matricula}
                          </div>
                          <div className="text-gray-500 text-xs">
                            {vehiculo.tipo} {vehiculo.año && `• ${vehiculo.año}`}
                          </div>
                          {vehiculo.precioPublicacion && (
                            <div className="text-green-600 font-medium text-xs">
                              €{vehiculo.precioPublicacion.toLocaleString()}
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
                
                {selectedVehiculo && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-sm">
                      <p className="font-medium text-blue-800">
                        {selectedVehiculo.marca} {selectedVehiculo.modelo}
                      </p>
                      <p className="text-blue-600">Ref: {selectedVehiculo.referencia}</p>
                      <p className="text-blue-600">Matrícula: {selectedVehiculo.matricula}</p>
                      {selectedVehiculo.precioPublicacion && (
                        <p className="text-blue-600">
                          Precio: €{selectedVehiculo.precioPublicacion.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Información Financiera */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Información Financiera</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Importe Total (€)
                </label>
                <input
                  type="number"
                  name="importeTotal"
                  value={formData.importeTotal}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Importe Seña (€)
                </label>
                <input
                  type="number"
                  name="importeSena"
                  value={formData.importeSena}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resto a Pagar (€)
                </label>
                <input
                  type="number"
                  name="restoAPagar"
                  value={formData.restoAPagar || calcularRestoAPagar().toString()}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50"
                  placeholder="0.00"
                  step="0.01"
                  readOnly
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Forma de Pago Seña
                </label>
                <select
                  name="formaPagoSena"
                  value={formData.formaPagoSena}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Seleccionar...</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="bizum">Bizum</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Responsable Comercial
                </label>
                <input
                  type="text"
                  name="responsableComercial"
                  value={formData.responsableComercial}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Nombre del comercial"
                />
              </div>
            </div>

            <div className="mt-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="financiacion"
                  checked={formData.financiacion}
                  onChange={handleInputChange}
                  className="rounded border-gray-300 text-green-600 shadow-sm focus:border-green-300 focus:ring focus:ring-green-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Incluye financiación
                </span>
              </label>
            </div>

            {formData.financiacion && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Entidad Financiera
                </label>
                <input
                  type="text"
                  name="entidadFinanciera"
                  value={formData.entidadFinanciera}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Nombre de la entidad financiera"
                />
              </div>
            )}
          </div>

          {/* Fechas de Reserva */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Fechas de Reserva</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha Inicio Reserva
                </label>
                <input
                  type="date"
                  name="fechaReservaDesde"
                  value={formData.fechaReservaDesde}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha Expiración Reserva
                </label>
                <input
                  type="date"
                  name="fechaReservaExpira"
                  value={formData.fechaReservaExpira}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Observaciones</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notas Adicionales
              </label>
              <textarea
                name="observaciones"
                value={formData.observaciones}
                onChange={handleInputChange}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Observaciones sobre el deal, condiciones especiales, etc."
              />
            </div>
          </div>

          {/* Botones */}
          <div className="flex items-center justify-end space-x-4">
            <Link
              href="/deals"
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg font-medium transition-all shadow-lg flex items-center space-x-2"
            >
              {isLoading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Creando...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>Crear Deal</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
