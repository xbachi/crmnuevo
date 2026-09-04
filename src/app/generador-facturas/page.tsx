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

  const handleClienteChange = (field: keyof ClienteData, value: string) => {
    setCliente((prev) => ({ ...prev, [field]: value }))
    clearError(`cliente.${field}`)
  }

  const handleVehiculoChange = (
    field: keyof VehiculoData,
    value: string | number
  ) => {
    setVehiculo((prev) => ({ ...prev, [field]: value }))
    clearError(`vehiculo.${field}`)
  }

  const handleFacturaChange = (
    field: keyof FacturaData,
    value: string | number
  ) => {
    setFactura((prev) => ({ ...prev, [field]: value }))
    clearError(`factura.${field}`)
  }

  const validateForm = () => {
    const camposFaltantes: string[] = []
    const newErrors: Record<string, boolean> = {}

    // Validar datos del cliente
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

    // Validar datos del vehículo
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

    // Validar importe
    if (factura.importeTotal <= 0) {
      camposFaltantes.push('Importe total mayor a 0')
      newErrors['factura.importeTotal'] = true
    }

    if (camposFaltantes.length > 0) {
      setErrors(newErrors)
      setErrorMessage(camposFaltantes.join(', '))
      setShowErrorModal(true)
      return false
    }

    setErrors({})
    return true
  }

  const handleGenerarFactura = () => {
    if (!validateForm()) return
    setShowFacturaModal(true)
  }

  const handleConfirmFactura = async (
    tipoFactura: 'IVA' | 'REBU',
    _numeroFactura?: string // ignored — fiscal numbering is now centralised
  ) => {
    try {
      setIsGenerating(true)

      // Use a UUIDv4 as Idempotency-Key so a double-click on "Generar"
      // never produces two fiscal numbers for the same form submission.
      const idempotencyKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? (crypto as { randomUUID: () => string }).randomUUID()
          : `gen-${Date.now()}-${Math.random().toString(16).slice(2)}`

      // Map the legacy IVA/REBU labels to the new module's VAT/REBU types.
      const invoiceType = tipoFactura === 'REBU' ? 'REBU' : 'VAT'

      const response = await fetch('/api/sales/manual-issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          invoiceType,
          cliente: {
            nombre: capitalizeText(cliente.nombre),
            apellidos: capitalizeText(cliente.apellidos),
            dni: cliente.dni,
            telefono: cliente.telefono || null,
            email: cliente.email || null,
            direccion: cliente.direccion || null,
            ciudad: cliente.ciudad || null,
            provincia: cliente.provincia || null,
            codPostal: cliente.codPostal || null,
          },
          vehiculo: {
            marca: capitalizeText(vehiculo.marca),
            modelo: capitalizeText(vehiculo.modelo),
            matricula: vehiculo.matricula,
            bastidor: vehiculo.bastidor || null,
            kms: vehiculo.kms || 0,
            color: vehiculo.color || null,
            fechaMatriculacion: vehiculo.fechaMatriculacion || null,
            año: vehiculo.año || null,
          },
          factura: {
            importeTotal: factura.importeTotal,
            importeSena: factura.importeSena || 0,
            formaPagoSena: factura.formaPagoSena || null,
          },
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        showToast(data?.error ?? 'Error al emitir factura.', 'error')
        return
      }

      const issued = data?.invoice
      if (!issued) {
        showToast('Respuesta inesperada del servidor.', 'error')
        return
      }

      if (data.alreadyExisted) {
        showToast(
          `Factura ya existente: ${issued.full_invoice_number}.`,
          'info'
        )
      } else {
        showToast(
          `Factura ${issued.full_invoice_number} emitida correctamente.`,
          'success'
        )
      }

      // Open the PDF in a new tab if available; otherwise route the user
      // to the detail page so they can regenerate if needed.
      if (issued.pdf_url) {
        window.open(`/api/invoices/${issued.id}/download`, '_blank')
      } else {
        window.open(`/facturacion/${issued.id}`, '_blank')
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
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              Generador de Facturas
            </h1>
            <p className="mt-2 text-gray-600">
              Emite una factura para una venta que no tiene Deal previo.
            </p>
          </div>

          {/* Warning: this NOW consumes a fiscal number */}
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-md p-4">
            <h3 className="text-sm font-semibold text-amber-900 mb-1">
              ⚠ Esta página emite facturas fiscales.
            </h3>
            <p className="text-xs text-amber-800">
              Al confirmar, se crea un cliente, un vehículo y un deal en
              background, y se asigna el siguiente número correlativo de la
              serie correspondiente (R-2026 para REBU, F-2026 para IVA). El
              campo "número personalizado" queda como informativo: el sistema
              SIEMPRE usa el siguiente número de la serie para evitar saltos.
            </p>
            <p className="text-xs text-amber-800 mt-2">
              Para ver, descargar o regenerar facturas emitidas, usa{' '}
              <a
                href="/facturacion/historial"
                className="font-medium underline hover:text-amber-900"
              >
                Facturación → Historial
              </a>
              .
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
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.nombre']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'cliente.nombre',
                        'Nombre del cliente'
                      )}
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
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.apellidos']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'cliente.apellidos',
                        'Apellidos del cliente'
                      )}
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
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['cliente.dni']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'cliente.dni',
                        'DNI del cliente'
                      )}
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
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['vehiculo.marca']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'vehiculo.marca',
                        'Marca del vehículo'
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
                      onChange={(e) =>
                        handleVehiculoChange('modelo', e.target.value)
                      }
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['vehiculo.modelo']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'vehiculo.modelo',
                        'Modelo del vehículo'
                      )}
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
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors['vehiculo.matricula']
                          ? 'border-red-500'
                          : 'border-gray-300'
                      }`}
                      placeholder={getPlaceholder(
                        'vehiculo.matricula',
                        'Matrícula del vehículo'
                      )}
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
                    className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors['factura.importeTotal']
                        ? 'border-red-500'
                        : 'border-gray-300'
                    }`}
                    placeholder={getPlaceholder('factura.importeTotal', '0.00')}
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

      {/* Modal de error */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-30 flex items-center justify-center z-50">
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
                Falta completar campos obligatorios
              </h3>
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
