'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useToast } from '@/hooks/useToast'
import { capitalizeText } from '@/lib/utils'

interface ClienteData {
  nombre: string
  apellidos: string
  dni: string
  telefono: string
  email: string
  calle: string
  ciudad: string
  provincia: string
  codPostal: string
}

interface VehiculoData {
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  fechaMatriculacion: string
}

interface ReservaData {
  precioVehiculo: number
  montoReserva: number
  formaPagoReserva: string
}

export default function GeneradorReservasPage() {
  const router = useRouter()
  const { showToast } = useToast()

  // Estados para los formularios
  const [cliente, setCliente] = useState<ClienteData>({
    nombre: '',
    apellidos: '',
    dni: '',
    telefono: '',
    email: '',
    calle: '',
    ciudad: '',
    provincia: '',
    codPostal: '',
  })

  const [vehiculo, setVehiculo] = useState<VehiculoData>({
    marca: '',
    modelo: '',
    matricula: '',
    bastidor: '',
    kms: 0,
    fechaMatriculacion: '',
  })

  const [reserva, setReserva] = useState<ReservaData>({
    precioVehiculo: 0,
    montoReserva: 0,
    formaPagoReserva: 'efectivo',
  })

  const [isLoading, setIsLoading] = useState(false)

  const handleGenerarContrato = async () => {
    // Validar campos obligatorios
    if (
      !cliente.nombre.trim() ||
      !cliente.apellidos.trim() ||
      !cliente.dni.trim() ||
      !cliente.telefono.trim() ||
      !cliente.calle.trim() ||
      !cliente.ciudad.trim() ||
      !cliente.provincia.trim()
    ) {
      showToast(
        'Por favor, completa todos los campos obligatorios del cliente',
        'error'
      )
      return
    }

    if (
      !vehiculo.marca.trim() ||
      !vehiculo.modelo.trim() ||
      !vehiculo.matricula.trim() ||
      !vehiculo.bastidor.trim()
    ) {
      showToast(
        'Por favor, completa todos los campos obligatorios del vehículo',
        'error'
      )
      return
    }

    if (!reserva.precioVehiculo || reserva.precioVehiculo <= 0) {
      showToast('Por favor, introduce un precio de vehículo válido', 'error')
      return
    }

    if (!reserva.montoReserva || reserva.montoReserva <= 0) {
      showToast('Por favor, introduce un monto de reserva válido', 'error')
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
          nombre: capitalizeText(cliente.nombre),
          apellidos: capitalizeText(cliente.apellidos),
          dni: cliente.dni.toUpperCase(),
          telefono: cliente.telefono,
          email: cliente.email,
          calle: capitalizeText(cliente.calle),
          ciudad: capitalizeText(cliente.ciudad),
          provincia: capitalizeText(cliente.provincia),
          codPostal: cliente.codPostal,
        },
        vehiculo: {
          marca: capitalizeText(vehiculo.marca),
          modelo: capitalizeText(vehiculo.modelo),
          matricula: vehiculo.matricula.toUpperCase(),
          bastidor: vehiculo.bastidor.toUpperCase(),
          kms: vehiculo.kms,
          precioPublicacion: reserva.precioVehiculo,
          fechaMatriculacion: vehiculo.fechaMatriculacion,
        },
        importeTotal: reserva.precioVehiculo,
        importeSena: reserva.montoReserva,
        formaPagoSena: reserva.formaPagoReserva,
        fechaReservaDesde: new Date(),
        fechaReservaExpira: new Date(
          new Date().getTime() + 7 * 24 * 60 * 60 * 1000
        ), // 7 días desde ahora
      }

      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dealId: 0, // 0 para indicar que es un generador independiente
          documentType: 'contrato-reserva',
          dealData: dealData,
          dealNumber: dealData.numero,
        }),
      })

      if (response.ok) {
        const result = await response.json()

        // Descargar el documento
        window.open(result.url, '_blank')

        showToast('Contrato de reserva generado exitosamente', 'success')

        // Limpiar formulario
        limpiarFormulario()
      } else {
        const errorData = await response.json()
        console.error('Error al generar contrato:', errorData)
        showToast(
          `Error al generar contrato: ${errorData.details || errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error('Error de red al generar contrato:', error)
      showToast('Error de red al generar contrato', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const limpiarFormulario = () => {
    setCliente({
      nombre: '',
      apellidos: '',
      dni: '',
      telefono: '',
      email: '',
      calle: '',
      ciudad: '',
      provincia: '',
      codPostal: '',
    })
    setVehiculo({
      marca: '',
      modelo: '',
      matricula: '',
      bastidor: '',
      kms: 0,
      fechaMatriculacion: '',
    })
    setReserva({
      precioVehiculo: 0,
      montoReserva: 0,
      formaPagoReserva: 'efectivo',
    })
    showToast('Formulario limpiado', 'info')
  }

  return (
    <ProtectedRoute>
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

            <div className="p-6 space-y-8">
              {/* Datos del Cliente */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Datos del Cliente
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      value={cliente.nombre}
                      onChange={(e) =>
                        setCliente({ ...cliente, nombre: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Juan"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Apellidos *
                    </label>
                    <input
                      type="text"
                      value={cliente.apellidos}
                      onChange={(e) =>
                        setCliente({ ...cliente, apellidos: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Pérez García"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      DNI/NIE *
                    </label>
                    <input
                      type="text"
                      value={cliente.dni}
                      onChange={(e) =>
                        setCliente({ ...cliente, dni: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: 12345678A"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono *
                    </label>
                    <input
                      type="tel"
                      value={cliente.telefono}
                      onChange={(e) =>
                        setCliente({ ...cliente, telefono: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: 600123456"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={cliente.email}
                      onChange={(e) =>
                        setCliente({ ...cliente, email: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: juan.perez@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Calle *
                    </label>
                    <input
                      type="text"
                      value={cliente.calle}
                      onChange={(e) =>
                        setCliente({ ...cliente, calle: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Calle Mayor 123"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ciudad *
                    </label>
                    <input
                      type="text"
                      value={cliente.ciudad}
                      onChange={(e) =>
                        setCliente({ ...cliente, ciudad: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Madrid"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provincia *
                    </label>
                    <input
                      type="text"
                      value={cliente.provincia}
                      onChange={(e) =>
                        setCliente({ ...cliente, provincia: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Madrid"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Código Postal
                    </label>
                    <input
                      type="text"
                      value={cliente.codPostal}
                      onChange={(e) =>
                        setCliente({ ...cliente, codPostal: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: 28001"
                    />
                  </div>
                </div>
              </div>

              {/* Datos del Vehículo */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Datos del Vehículo
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Marca *
                    </label>
                    <input
                      type="text"
                      value={vehiculo.marca}
                      onChange={(e) =>
                        setVehiculo({ ...vehiculo, marca: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Volkswagen"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Modelo *
                    </label>
                    <input
                      type="text"
                      value={vehiculo.modelo}
                      onChange={(e) =>
                        setVehiculo({ ...vehiculo, modelo: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Golf VIII"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Matrícula *
                    </label>
                    <input
                      type="text"
                      value={vehiculo.matricula}
                      onChange={(e) =>
                        setVehiculo({ ...vehiculo, matricula: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: 1234ABC"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bastidor *
                    </label>
                    <input
                      type="text"
                      value={vehiculo.bastidor}
                      onChange={(e) =>
                        setVehiculo({ ...vehiculo, bastidor: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: WVWZZZCDZMW088838"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kilómetros
                    </label>
                    <input
                      type="number"
                      value={vehiculo.kms || ''}
                      onChange={(e) =>
                        setVehiculo({
                          ...vehiculo,
                          kms: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: 50000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha de Matriculación
                    </label>
                    <input
                      type="date"
                      value={vehiculo.fechaMatriculacion}
                      onChange={(e) =>
                        setVehiculo({
                          ...vehiculo,
                          fechaMatriculacion: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Datos de la Reserva */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Datos de la Reserva
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Precio del Vehículo (€) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={reserva.precioVehiculo || ''}
                      onChange={(e) =>
                        setReserva({
                          ...reserva,
                          precioVehiculo: parseFloat(e.target.value) || 0,
                        })
                      }
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
                      value={reserva.montoReserva || ''}
                      onChange={(e) =>
                        setReserva({
                          ...reserva,
                          montoReserva: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: 1000.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Forma de Pago de la Reserva *
                    </label>
                    <select
                      value={reserva.formaPagoReserva}
                      onChange={(e) =>
                        setReserva({
                          ...reserva,
                          formaPagoReserva: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="tarjeta">Tarjeta</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Botones */}
              <div className="flex justify-center space-x-4 pt-6">
                <button
                  onClick={limpiarFormulario}
                  className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Limpiar Formulario
                </button>
                <button
                  onClick={handleGenerarContrato}
                  disabled={isLoading}
                  className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                    isLoading
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
      </div>
    </ProtectedRoute>
  )
}
