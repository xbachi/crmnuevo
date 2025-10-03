'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useToast } from '@/hooks/useToast'

interface ClienteData {
  nombre: string
  apellidos: string
  dni: string
  telefono: string
  email: string
  direccion: string
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
  color: string
  fechaMatriculacion: string
  año: number
}

interface ContratoData {
  precioCompra: number
  fechaCompra: string
  formaPago: string
}

export default function GeneradorContratos() {
  const router = useRouter()
  const { showToast } = useToast()

  // Estados para los formularios
  const [cliente, setCliente] = useState<ClienteData>({
    nombre: '',
    apellidos: '',
    dni: '',
    telefono: '',
    email: '',
    direccion: '',
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
    color: '',
    fechaMatriculacion: '',
    año: new Date().getFullYear(),
  })

  const [contrato, setContrato] = useState<ContratoData>({
    precioCompra: 0,
    fechaCompra: new Date().toISOString().split('T')[0],
    formaPago: 'efectivo',
  })

  // Estados para generación
  const [isGenerating, setIsGenerating] = useState(false)

  const handleClienteChange = (field: keyof ClienteData, value: string) => {
    setCliente((prev) => ({ ...prev, [field]: value }))
  }

  const handleVehiculoChange = (
    field: keyof VehiculoData,
    value: string | number
  ) => {
    setVehiculo((prev) => ({ ...prev, [field]: value }))
  }

  const handleContratoChange = (
    field: keyof ContratoData,
    value: string | number
  ) => {
    setContrato((prev) => ({ ...prev, [field]: value }))
  }

  const validateForm = () => {
    // Validar datos del cliente
    if (
      !cliente.nombre.trim() ||
      !cliente.apellidos.trim() ||
      !cliente.dni.trim()
    ) {
      showToast(
        'Por favor completa los datos obligatorios del cliente',
        'error'
      )
      return false
    }

    // Validar datos del vehículo
    if (
      !vehiculo.marca.trim() ||
      !vehiculo.modelo.trim() ||
      !vehiculo.matricula.trim()
    ) {
      showToast(
        'Por favor completa los datos obligatorios del vehículo',
        'error'
      )
      return false
    }

    // Validar precio
    if (contrato.precioCompra <= 0) {
      showToast('El precio de compra debe ser mayor a 0', 'error')
      return false
    }

    return true
  }

  const handleGenerarContrato = async () => {
    if (!validateForm()) return

    try {
      setIsGenerating(true)

      // Generar número de contrato único
      const year = new Date().getFullYear()
      const timestamp = Date.now().toString().slice(-6)
      const numeroContrato = `CCV-${year}-${timestamp}`

      console.log(
        '🔍 [GENERADOR CONTRATOS] Generando contrato con parámetros:',
        {
          numeroContrato,
          cliente,
          vehiculo,
          contrato,
        }
      )

      // Generar el contrato de compraventa usando la función simplificada
      const { generarContratoCompraventaSimple } = await import(
        '@/lib/contractGenerator'
      )

      // Generar el contrato con datos simples
      const pdfBuffer = await generarContratoCompraventaSimple(
        cliente,
        vehiculo,
        contrato.precioCompra
      )

      // Crear y descargar el PDF
      const pdfBlob = new Blob([pdfBuffer.buffer], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `contrato-compraventa-${numeroContrato}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      showToast('Contrato de compraventa generado exitosamente', 'success')
    } catch (error) {
      console.error('Error generando contrato:', error)
      showToast('Error al generar el contrato', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Generador de Contratos de Compra
            </h1>
            <p className="mt-2 text-gray-600">
              Genera contratos de compra independientes para vehículos de
              particulares
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Datos del Cliente */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Datos del Cliente
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      value={cliente.nombre}
                      onChange={(e) =>
                        handleClienteChange('nombre', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Nombre del cliente"
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
                        handleClienteChange('apellidos', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Apellidos del cliente"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      DNI *
                    </label>
                    <input
                      type="text"
                      value={cliente.dni}
                      onChange={(e) =>
                        handleClienteChange('dni', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="DNI del cliente"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono
                    </label>
                    <input
                      type="text"
                      value={cliente.telefono}
                      onChange={(e) =>
                        handleClienteChange('telefono', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Teléfono del cliente"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={cliente.email}
                    onChange={(e) =>
                      handleClienteChange('email', e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Email del cliente"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={cliente.direccion}
                    onChange={(e) =>
                      handleClienteChange('direccion', e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Dirección del cliente"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ciudad
                    </label>
                    <input
                      type="text"
                      value={cliente.ciudad}
                      onChange={(e) =>
                        handleClienteChange('ciudad', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ciudad"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provincia
                    </label>
                    <input
                      type="text"
                      value={cliente.provincia}
                      onChange={(e) =>
                        handleClienteChange('provincia', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Provincia"
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
                        handleClienteChange('codPostal', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="CP"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Datos del Vehículo */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Datos del Vehículo
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Marca *
                    </label>
                    <input
                      type="text"
                      value={vehiculo.marca}
                      onChange={(e) =>
                        handleVehiculoChange('marca', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Marca del vehículo"
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
                        handleVehiculoChange('modelo', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Modelo del vehículo"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Matrícula *
                    </label>
                    <input
                      type="text"
                      value={vehiculo.matricula}
                      onChange={(e) =>
                        handleVehiculoChange('matricula', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Matrícula del vehículo"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bastidor
                    </label>
                    <input
                      type="text"
                      value={vehiculo.bastidor}
                      onChange={(e) =>
                        handleVehiculoChange('bastidor', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Número de bastidor"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kilómetros
                    </label>
                    <input
                      type="number"
                      value={vehiculo.kms}
                      onChange={(e) =>
                        handleVehiculoChange(
                          'kms',
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Color
                    </label>
                    <input
                      type="text"
                      value={vehiculo.color}
                      onChange={(e) =>
                        handleVehiculoChange('color', e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Color del vehículo"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Año
                    </label>
                    <input
                      type="number"
                      value={vehiculo.año}
                      onChange={(e) =>
                        handleVehiculoChange(
                          'año',
                          parseInt(e.target.value) || new Date().getFullYear()
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={new Date().getFullYear().toString()}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"></div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Matriculación
                  </label>
                  <input
                    type="date"
                    value={vehiculo.fechaMatriculacion}
                    onChange={(e) =>
                      handleVehiculoChange('fechaMatriculacion', e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Datos del Contrato */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Datos del Contrato de Compra
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Precio de Compra *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={contrato.precioCompra}
                    onChange={(e) =>
                      handleContratoChange(
                        'precioCompra',
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Compra
                  </label>
                  <input
                    type="date"
                    value={contrato.fechaCompra}
                    onChange={(e) =>
                      handleContratoChange('fechaCompra', e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Forma de Pago
                  </label>
                  <select
                    value={contrato.formaPago}
                    onChange={(e) =>
                      handleContratoChange('formaPago', e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Botón Generar */}
          <div className="mt-8 flex justify-center">
            <button
              onClick={handleGenerarContrato}
              disabled={isGenerating}
              className="px-8 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? 'Generando...' : 'Generar Contrato de Compra'}
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
