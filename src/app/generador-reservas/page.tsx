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
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const clearError = (field: string) => {
    if (errors[field]) {
      const newErrors = { ...errors }
      delete newErrors[field]
      setErrors(newErrors)
    }
  }

  const getPlaceholder = (field: string, defaultPlaceholder: string) => {
    return errors[field] ? 'Campo obligatorio' : defaultPlaceholder
  }

  const handleGenerarContrato = async () => {
    const camposFaltantes: string[] = []
    const newErrors: Record<string, boolean> = {}

    // Validar campos obligatorios
    if (!cliente.nombre.trim()) {
      camposFaltantes.push('Nombre del cliente')
      newErrors['cliente.nombre'] = true
    }
    if (!cliente.apellidos.trim()) {
      camposFaltantes.push('Apellidos del cliente')
      newErrors['cliente.apellidos'] = true
    }
    if (!cliente.dni.trim()) {
      camposFaltantes.push('DNI del cliente')
      newErrors['cliente.dni'] = true
    }
    if (!cliente.telefono.trim()) {
      camposFaltantes.push('Teléfono del cliente')
      newErrors['cliente.telefono'] = true
    }
    if (!cliente.calle.trim()) {
      camposFaltantes.push('Calle del cliente')
      newErrors['cliente.calle'] = true
    }
    if (!cliente.ciudad.trim()) {
      camposFaltantes.push('Ciudad del cliente')
      newErrors['cliente.ciudad'] = true
    }
    if (!cliente.provincia.trim()) {
      camposFaltantes.push('Provincia del cliente')
      newErrors['cliente.provincia'] = true
    }

    if (!vehiculo.marca.trim()) {
      camposFaltantes.push('Marca del vehículo')
      newErrors['vehiculo.marca'] = true
    }
    if (!vehiculo.modelo.trim()) {
      camposFaltantes.push('Modelo del vehículo')
      newErrors['vehiculo.modelo'] = true
    }
    if (!vehiculo.matricula.trim()) {
      camposFaltantes.push('Matrícula del vehículo')
      newErrors['vehiculo.matricula'] = true
    }
    if (!vehiculo.bastidor.trim()) {
      camposFaltantes.push('Bastidor del vehículo')
      newErrors['vehiculo.bastidor'] = true
    }

    if (!reserva.precioVehiculo || reserva.precioVehiculo <= 0) {
      camposFaltantes.push('Precio del vehículo')
      newErrors['reserva.precioVehiculo'] = true
    }

    if (!reserva.montoReserva || reserva.montoReserva <= 0) {
      camposFaltantes.push('Monto de reserva')
      newErrors['reserva.montoReserva'] = true
    }

    if (camposFaltantes.length > 0) {
      setErrors(newErrors)
      setErrorMessage(camposFaltantes.join(', '))
      setShowErrorModal(true)
      return
    }

    setErrors({})

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

      // Detectar si la respuesta es PDF directo o JSON
      const contentType = response.headers.get('content-type')

      if (contentType?.includes('application/pdf')) {
        // Respuesta directa de PDF (Vercel/producción)
        console.log('📄 [GENERADOR RESERVAS] Recibiendo PDF directo')

        const pdfBlob = await response.blob()
        const url = window.URL.createObjectURL(pdfBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = `contrato-reserva-${dealData.numero}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)

        showToast('Contrato de reserva generado exitosamente', 'success')

        // Limpiar formulario
        limpiarFormulario()
      } else if (response.ok) {
        // Respuesta JSON (desarrollo local)
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
                      onChange={(e) => {
                        setCliente({ ...cliente, nombre: e.target.value })
                        clearError('cliente.nombre')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.nombre']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder('cliente.nombre', 'Ej: Juan')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Apellidos *
                    </label>
                    <input
                      type="text"
                      value={cliente.apellidos}
                      onChange={(e) => {
                        setCliente({ ...cliente, apellidos: e.target.value })
                        clearError('cliente.apellidos')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.apellidos']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'cliente.apellidos',
                        'Ej: Pérez García'
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      DNI/NIE *
                    </label>
                    <input
                      type="text"
                      value={cliente.dni}
                      onChange={(e) => {
                        setCliente({ ...cliente, dni: e.target.value })
                        clearError('cliente.dni')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.dni']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'cliente.dni',
                        'Ej: 12345678A'
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono *
                    </label>
                    <input
                      type="tel"
                      value={cliente.telefono}
                      onChange={(e) => {
                        setCliente({ ...cliente, telefono: e.target.value })
                        clearError('cliente.telefono')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.telefono']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'cliente.telefono',
                        'Ej: 600123456'
                      )}
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
                      onChange={(e) => {
                        setCliente({ ...cliente, calle: e.target.value })
                        clearError('cliente.calle')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.calle']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'cliente.calle',
                        'Ej: Calle Mayor 123'
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ciudad *
                    </label>
                    <input
                      type="text"
                      value={cliente.ciudad}
                      onChange={(e) => {
                        setCliente({ ...cliente, ciudad: e.target.value })
                        clearError('cliente.ciudad')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.ciudad']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'cliente.ciudad',
                        'Ej: Madrid'
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provincia *
                    </label>
                    <input
                      type="text"
                      value={cliente.provincia}
                      onChange={(e) => {
                        setCliente({ ...cliente, provincia: e.target.value })
                        clearError('cliente.provincia')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.provincia']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'cliente.provincia',
                        'Ej: Madrid'
                      )}
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
                      onChange={(e) => {
                        setVehiculo({ ...vehiculo, marca: e.target.value })
                        clearError('vehiculo.marca')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['vehiculo.marca']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'vehiculo.marca',
                        'Ej: Volkswagen'
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Modelo *
                    </label>
                    <input
                      type="text"
                      value={vehiculo.modelo}
                      onChange={(e) => {
                        setVehiculo({ ...vehiculo, modelo: e.target.value })
                        clearError('vehiculo.modelo')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['vehiculo.modelo']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'vehiculo.modelo',
                        'Ej: Golf VIII'
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Matrícula *
                    </label>
                    <input
                      type="text"
                      value={vehiculo.matricula}
                      onChange={(e) => {
                        setVehiculo({ ...vehiculo, matricula: e.target.value })
                        clearError('vehiculo.matricula')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['vehiculo.matricula']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'vehiculo.matricula',
                        'Ej: 1234ABC'
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bastidor *
                    </label>
                    <input
                      type="text"
                      value={vehiculo.bastidor}
                      onChange={(e) => {
                        setVehiculo({ ...vehiculo, bastidor: e.target.value })
                        clearError('vehiculo.bastidor')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['vehiculo.bastidor']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'vehiculo.bastidor',
                        'Ej: WVWZZZCDZMW088838'
                      )}
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
                      onChange={(e) => {
                        setReserva({
                          ...reserva,
                          precioVehiculo: parseFloat(e.target.value) || 0,
                        })
                        clearError('reserva.precioVehiculo')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['reserva.precioVehiculo']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'reserva.precioVehiculo',
                        'Ej: 15000.00'
                      )}
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
                      onChange={(e) => {
                        setReserva({
                          ...reserva,
                          montoReserva: parseFloat(e.target.value) || 0,
                        })
                        clearError('reserva.montoReserva')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['reserva.montoReserva']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'reserva.montoReserva',
                        'Ej: 1000.00'
                      )}
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

      {/* Modal de error */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-red-100">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="ml-3 text-lg font-semibold text-gray-900">
                Campos faltantes
              </h3>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Por favor, completa los siguientes campos obligatorios:
              </p>
              <p className="mt-2 text-sm font-medium text-red-600">
                {errorMessage}
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowErrorModal(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  )
}
