'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'

export default function CrearDeal() {
  const [clienteSearch, setClienteSearch] = useState('')
  const [vehiculoSearch, setVehiculoSearch] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<any>(null)
  const [selectedVehiculo, setSelectedVehiculo] = useState<any>(null)
  const [clientes, setClientes] = useState<any[]>([])
  const [vehiculos, setVehiculos] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [montoReserva, setMontoReserva] = useState('')
  const [senna, setSenna] = useState('300')
  const [notas, setNotas] = useState('')

  const router = useRouter()
  const { showToast } = useToast()

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
      // Obtener todos los vehículos
      const vehiculosResponse = await fetch('/api/vehiculos')
      if (!vehiculosResponse.ok) return
      
      const vehiculosData = await vehiculosResponse.json()
      const todosVehiculos = vehiculosData.vehiculos || vehiculosData
      
      // Obtener deals activos para filtrar vehículos reservados
      const dealsResponse = await fetch('/api/deals')
      if (!dealsResponse.ok) return
      
      const dealsData = await dealsResponse.json()
      
      // Filtrar vehículos que NO estén reservados o vendidos
      const vehiculosDisponibles = todosVehiculos.filter(vehiculo => {
        // Un vehículo está reservado/vendido si tiene un deal activo con esos estados
        const estaReservadoOVendido = dealsData.some(deal => 
          deal.vehiculoId === vehiculo.id && 
          (deal.estado === 'reservado' || deal.estado === 'vendido' || deal.estado === 'facturado')
        )
        return !estaReservadoOVendido
      })
      
      setVehiculos(vehiculosDisponibles)
      console.log(`🚗 Vehículos disponibles: ${vehiculosDisponibles.length} (filtrados vehículos reservados/vendidos)`)
    } catch (error) {
      console.error('Error fetching vehiculos:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
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

      // Preparar datos para enviar
      const dealData = {
        clienteId: selectedCliente.id,
        vehiculoId: selectedVehiculo.id,
        importeTotal: parseFloat(montoReserva),
        importeSena: parseFloat(senna),
        observaciones: notas,
        responsableComercial: 'Usuario' // Por ahora hardcodeado
      }

      console.log('📤 Enviando deal:', dealData)

      // Enviar a la API
      const response = await fetch('/api/deals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dealData)
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
              <h1 className="text-xl font-bold text-slate-900">Crear Nuevo Deal</h1>
              <button
                onClick={() => router.push('/deals')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
            </div>

            {/* Vehículo */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Vehículo *
              </label>
              <input
                type="text"
                placeholder="Escribir marca, modelo, matrícula o referencia..."
                value={selectedVehiculo ? `${selectedVehiculo.marca} ${selectedVehiculo.modelo} - ${selectedVehiculo.matricula}` : vehiculoSearch}
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
  )
}
