'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useToast } from '@/hooks/useToast'
import FacturaTypeModal from '@/components/FacturaTypeModal'
import { capitalizeText } from '@/lib/utils'

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

interface FacturaData {
  importeTotal: number
  importeSena: number
  formaPagoSena: string
}

export default function GeneradorFacturas() {
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

  const [factura, setFactura] = useState<FacturaData>({
    importeTotal: 0,
    importeSena: 0,
    formaPagoSena: 'efectivo',
  })

  // Estados para el modal y generación
  const [showFacturaModal, setShowFacturaModal] = useState(false)
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

  const handleFacturaChange = (
    field: keyof FacturaData,
    value: string | number
  ) => {
    setFactura((prev) => ({ ...prev, [field]: value }))
  }

  const validateForm = () => {
    const camposFaltantes: string[] = []

    // Validar datos del cliente
    if (!cliente.nombre.trim()) camposFaltantes.push('Nombre del cliente')
    if (!cliente.apellidos.trim()) camposFaltantes.push('Apellidos del cliente')
    if (!cliente.dni.trim()) camposFaltantes.push('DNI del cliente')

    // Validar datos del vehículo
    if (!vehiculo.marca.trim()) camposFaltantes.push('Marca del vehículo')
    if (!vehiculo.modelo.trim()) camposFaltantes.push('Modelo del vehículo')
    if (!vehiculo.matricula.trim())
      camposFaltantes.push('Matrícula del vehículo')

    // Validar importe
    if (factura.importeTotal <= 0)
      camposFaltantes.push('Importe total mayor a 0')

    if (camposFaltantes.length > 0) {
      showToast(
        `Faltan campos obligatorios: ${camposFaltantes.join(', ')}`,
        'error'
      )
      return false
    }

    return true
  }

  const handleGenerarFactura = () => {
    if (!validateForm()) return
    setShowFacturaModal(true)
  }

  const handleConfirmFactura = async (
    tipoFactura: 'IVA' | 'REBU',
    numeroFactura?: string
  ) => {
    try {
      setIsGenerating(true)

      // Si no se proporciona número personalizado, obtener el siguiente número secuencial
      let numeroFacturaFinal = numeroFactura
      if (!numeroFactura) {
        try {
          const response = await fetch('/api/facturas/next-number')
          if (response.ok) {
            const data = await response.json()
            numeroFacturaFinal = data.nextNumber
          } else {
            // Fallback si falla la API
            numeroFacturaFinal = `F-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
          }
        } catch (error) {
          console.error('Error obteniendo número de factura:', error)
          // Fallback si falla la API
          numeroFacturaFinal = `F-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
        }
      }

      console.log('🔍 [GENERADOR FACTURAS] Generando factura con parámetros:', {
        tipoFactura,
        numeroFactura: numeroFacturaFinal,
        cliente,
        vehiculo,
        factura,
      })

      // Crear datos del deal para la API
      const dealData = {
        numero: numeroFacturaFinal,
        fechaCreacion: new Date(),
        cliente: {
          nombre: capitalizeText(cliente.nombre),
          apellidos: capitalizeText(cliente.apellidos),
          dni: cliente.dni,
          telefono: cliente.telefono,
          email: cliente.email,
          direccion: cliente.direccion,
          ciudad: cliente.ciudad,
          provincia: cliente.provincia,
          codPostal: cliente.codPostal,
        },
        vehiculo: {
          marca: capitalizeText(vehiculo.marca),
          modelo: capitalizeText(vehiculo.modelo),
          matricula: vehiculo.matricula,
          bastidor: vehiculo.bastidor,
          kms: vehiculo.kms,
          color: vehiculo.color,
          fechaMatriculacion: vehiculo.fechaMatriculacion,
          año: vehiculo.año,
        },
        importeTotal: factura.importeTotal,
        importeSena: factura.importeSena,
        formaPagoSena: factura.formaPagoSena,
        fechaReservaDesde: new Date(),
        fechaReservaExpira: new Date(),
      }

      // Generar la factura
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dealId: 0, // ID ficticio para facturas independientes
          documentType: 'factura',
          dealNumber: dealData.numero,
          dealData,
          tipoFactura,
          numeroFactura: numeroFacturaFinal,
        }),
      })

      // Detectar si la respuesta es PDF directo o JSON
      const contentType = response.headers.get('content-type')

      if (contentType?.includes('application/pdf')) {
        // Respuesta directa de PDF (Vercel/producción)
        console.log('📄 [GENERADOR FACTURAS] Recibiendo PDF directo')

        const pdfBlob = await response.blob()
        const url = window.URL.createObjectURL(pdfBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = `factura-${numeroFacturaFinal}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)

        showToast(`Factura ${tipoFactura} generada exitosamente`, 'success')
      } else if (response.ok) {
        // Respuesta JSON (desarrollo local)
        const result = await response.json()
        showToast(`Factura ${tipoFactura} generada exitosamente`, 'success')
        window.open(result.url, '_blank')
      } else {
        const error = await response.json()
        showToast(error.error || 'Error generando factura', 'error')
      }
    } catch (error) {
      console.error('Error generando factura:', error)
      showToast('Error al generar la factura', 'error')
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
              Generador de Facturas
            </h1>
            <p className="mt-2 text-gray-600">
              Genera facturas independientes sin necesidad de crear un deal
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

            {/* Datos de la Factura */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Datos de la Factura
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Importe Total *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={factura.importeTotal}
                    onChange={(e) =>
                      handleFacturaChange(
                        'importeTotal',
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Importe Seña
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={factura.importeSena}
                    onChange={(e) =>
                      handleFacturaChange(
                        'importeSena',
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Forma de Pago Seña
                  </label>
                  <select
                    value={factura.formaPagoSena}
                    onChange={(e) =>
                      handleFacturaChange('formaPagoSena', e.target.value)
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
              onClick={handleGenerarFactura}
              disabled={isGenerating}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? 'Generando...' : 'Generar Factura'}
            </button>
          </div>

          {/* Modal de tipo de factura */}
          <FacturaTypeModal
            isOpen={showFacturaModal}
            onClose={() => setShowFacturaModal(false)}
            onConfirm={handleConfirmFactura}
          />
        </div>
      </div>
    </ProtectedRoute>
  )
}
