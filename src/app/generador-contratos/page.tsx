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
    color: '',
    fechaMatriculacion: '',
    año: 0,
  })

  const [contrato, setContrato] = useState<ContratoData>({
    precioCompra: 0,
    fechaCompra: new Date().toISOString().split('T')[0],
    formaPago: 'efectivo',
  })

  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  const clearError = (field: string) => {
    if (errors[field]) {
      const newErrors = { ...errors }
      delete newErrors[field]
      setErrors(newErrors)
    }
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

    if (!contrato.precioCompra || contrato.precioCompra <= 0) {
      camposFaltantes.push('Precio de compra válido')
      newErrors['contrato.precioCompra'] = true
    }

    if (camposFaltantes.length > 0) {
      setErrors(newErrors)
      showToast(
        `Faltan campos obligatorios: ${camposFaltantes.join(', ')}`,
        'error'
      )
      return
    }

    setErrors({})

    try {
      setIsLoading(true)

      // Preparar datos para el contrato de compraventa
      const depositoData = {
        id: 0, // Contrato independiente
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
          bastidor: vehiculo.bastidor.toUpperCase(),
          matricula: vehiculo.matricula.toUpperCase(),
          fechaMatriculacion: vehiculo.fechaMatriculacion,
          kms: vehiculo.kms,
          color: capitalizeText(vehiculo.color),
          año: vehiculo.año,
        },
        precioCompra: contrato.precioCompra,
        fechaCompra: contrato.fechaCompra,
        formaPago: contrato.formaPago,
      }

      // Importar la función de generación directamente
      const { generarContratoCompraventaSimple } = await import(
        '@/lib/contractGenerator'
      )

      // Generar el contrato
      const pdfBuffer = await generarContratoCompraventaSimple(
        depositoData.cliente,
        depositoData.vehiculo,
        depositoData.precioCompra
      )

      // Crear y descargar el PDF
      const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `contrato-compraventa-${cliente.nombre}-${cliente.apellidos}-${vehiculo.marca}-${vehiculo.modelo}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      showToast('Contrato de compraventa generado exitosamente', 'success')
    } catch (error) {
      console.error('Error generando contrato:', error)
      showToast('Error al generar el contrato', 'error')
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
      color: '',
      fechaMatriculacion: '',
      año: 0,
    })
    setContrato({
      precioCompra: 0,
      fechaCompra: new Date().toISOString().split('T')[0],
      formaPago: 'efectivo',
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
                Generador de Contratos de Compraventa
              </h1>
              <p className="text-gray-600 mt-1">
                Genera contratos de compraventa de vehículos independientes
              </p>
            </div>

            <div className="p-6 space-y-8">
              {/* Datos del Cliente */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Datos del Cliente (Vendedor)
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
                      onChange={(e) => {
                        setCliente({ ...cliente, apellidos: e.target.value })
                        clearError('cliente.apellidos')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.apellidos']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
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
                      onChange={(e) => {
                        setCliente({ ...cliente, dni: e.target.value })
                        clearError('cliente.dni')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.dni']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
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
                      onChange={(e) => {
                        setCliente({ ...cliente, telefono: e.target.value })
                        clearError('cliente.telefono')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.telefono']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
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
                      onChange={(e) => {
                        setCliente({ ...cliente, calle: e.target.value })
                        clearError('cliente.calle')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.calle']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
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
                      onChange={(e) => {
                        setCliente({ ...cliente, ciudad: e.target.value })
                        clearError('cliente.ciudad')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.ciudad']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
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
                      onChange={(e) => {
                        setCliente({ ...cliente, provincia: e.target.value })
                        clearError('cliente.provincia')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.provincia']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
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
                      onChange={(e) => {
                        setVehiculo({ ...vehiculo, marca: e.target.value })
                        clearError('vehiculo.marca')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['vehiculo.marca']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
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
                      onChange={(e) => {
                        setVehiculo({ ...vehiculo, modelo: e.target.value })
                        clearError('vehiculo.modelo')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['vehiculo.modelo']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
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
                      onChange={(e) => {
                        setVehiculo({ ...vehiculo, matricula: e.target.value })
                        clearError('vehiculo.matricula')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['vehiculo.matricula']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
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
                      onChange={(e) => {
                        setVehiculo({ ...vehiculo, bastidor: e.target.value })
                        clearError('vehiculo.bastidor')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['vehiculo.bastidor']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
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
                      Color
                    </label>
                    <input
                      type="text"
                      value={vehiculo.color}
                      onChange={(e) =>
                        setVehiculo({ ...vehiculo, color: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Blanco"
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Año
                    </label>
                    <input
                      type="number"
                      value={vehiculo.año || ''}
                      onChange={(e) =>
                        setVehiculo({
                          ...vehiculo,
                          año: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: 2020"
                    />
                  </div>
                </div>
              </div>

              {/* Datos del Contrato */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Datos del Contrato
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Precio de Compra (€) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={contrato.precioCompra || ''}
                      onChange={(e) => {
                        setContrato({
                          ...contrato,
                          precioCompra: parseFloat(e.target.value) || 0,
                        })
                        clearError('contrato.precioCompra')
                      }}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['contrato.precioCompra']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder="Ej: 15000.00"
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
                        setContrato({
                          ...contrato,
                          fechaCompra: e.target.value,
                        })
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
                        setContrato({ ...contrato, formaPago: e.target.value })
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
                    : 'Generar Contrato de Compraventa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
