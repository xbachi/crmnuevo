'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/useToast'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function CrearClientePage() {
  const router = useRouter()
  const { showToast } = useToast()

  // Estados para los acordeones
  const [showIntereses, setShowIntereses] = useState(false)

  // Form data
  const [formData, setFormData] = useState({
    nombre: '',
    apellidos: '',
    telefono: '',
    email: '',
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
    intereses: {
      vehiculosInteres: [''],
      precioMaximo: '',
      kilometrajeMaximo: '',
      añoMinimo: '',
      combustiblePreferido: 'cualquiera',
      cambioPreferido: 'cualquiera',
      formaPagoPreferida: 'cualquiera',
    },
    notas: '',
  })

  const [currentVehiculoInput, setCurrentVehiculoInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target

    if (name.startsWith('intereses.')) {
      const field = name.split('.')[1]
      setFormData((prev) => ({
        ...prev,
        intereses: {
          ...prev.intereses,
          [field]: value,
        },
      }))
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }))
    }
  }

  const removeVehiculoInteres = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      intereses: {
        ...prev.intereses,
        vehiculosInteres: prev.intereses.vehiculosInteres.filter(
          (_, i) => i !== index
        ),
      },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (
      !formData.nombre.trim() ||
      !formData.apellidos.trim() ||
      !formData.telefono.trim()
    ) {
      showToast('Por favor completa los campos obligatorios', 'error')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/clientes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          // Remover el campo intereses
          intereses: undefined,
        }),
      })

      if (response.ok) {
        showToast('Cliente creado exitosamente', 'success')
        router.push('/clientes')
      } else {
        const errorData = await response.json()
        showToast(errorData.error || 'Error al crear el cliente', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al crear el cliente', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    router.push('/clientes')
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Crear Nuevo Cliente
                </h1>
                <p className="mt-2 text-gray-600">
                  Completa la información del cliente para agregarlo al CRM
                </p>
              </div>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                ← Volver a Clientes
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Bloque 1: Información Personal */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Información Personal
                  </h2>
                  <p className="text-sm text-gray-600">
                    Datos básicos del cliente
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="nombre"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Nombre *
                  </label>
                  <input
                    type="text"
                    id="nombre"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: Juan"
                  />
                </div>

                <div>
                  <label
                    htmlFor="apellidos"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Apellidos *
                  </label>
                  <input
                    type="text"
                    id="apellidos"
                    name="apellidos"
                    value={formData.apellidos}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: García López"
                  />
                </div>

                <div>
                  <label
                    htmlFor="telefono"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Teléfono *
                  </label>
                  <input
                    type="tel"
                    id="telefono"
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: 612345678"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: juan@email.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="dni"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    DNI
                  </label>
                  <input
                    type="text"
                    id="dni"
                    name="dni"
                    value={formData.dni}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: 12345678A"
                  />
                </div>
              </div>

              {/* Campos de dirección */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  Dirección (opcional)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="direccion"
                      className="block text-xs font-medium text-gray-600 mb-1"
                    >
                      Dirección
                    </label>
                    <input
                      type="text"
                      id="direccion"
                      name="direccion"
                      value={formData.direccion}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                      placeholder="Ej: Calle Mayor 123"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ciudad"
                      className="block text-xs font-medium text-gray-600 mb-1"
                    >
                      Ciudad
                    </label>
                    <input
                      type="text"
                      id="ciudad"
                      name="ciudad"
                      value={formData.ciudad}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                      placeholder="Ej: Valencia"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="provincia"
                      className="block text-xs font-medium text-gray-600 mb-1"
                    >
                      Provincia
                    </label>
                    <input
                      type="text"
                      id="provincia"
                      name="provincia"
                      value={formData.provincia}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                      placeholder="Ej: Valencia"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="codPostal"
                      className="block text-xs font-medium text-gray-600 mb-1"
                    >
                      Código Postal
                    </label>
                    <input
                      type="text"
                      id="codPostal"
                      name="codPostal"
                      value={formData.codPostal}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                      placeholder="Ej: 46001"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bloque 2: Intereses del Cliente */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <button
                type="button"
                onClick={() => setShowIntereses(!showIntereses)}
                className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 rounded-xl border border-gray-200 transition-all duration-200 group mb-4"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center group-hover:from-blue-600 group-hover:to-indigo-700 transition-all duration-200">
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                      Intereses del Cliente
                    </h2>
                    <p className="text-sm text-gray-600 group-hover:text-gray-500 transition-colors">
                      Preferencias de vehículo y presupuesto (opcional)
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                    {showIntereses ? 'Ocultar' : 'Mostrar'}
                  </span>
                  <svg
                    className={`w-5 h-5 text-gray-600 transition-transform duration-200 ${showIntereses ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {showIntereses && (
                <div className="p-4 bg-white rounded-lg border border-gray-200">
                  {/* Vehículos de interés */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      🚗 Vehículos de interés
                    </label>
                    <div className="relative">
                      {/* Tags existentes */}
                      <div className="flex flex-wrap gap-2 mb-2 min-h-[40px] p-2 border border-gray-300 rounded-md bg-gray-50">
                        {formData.intereses.vehiculosInteres
                          .filter((v) => v.trim())
                          .map((vehiculo, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-3 py-1.5 rounded-full text-sm bg-blue-100 text-blue-800 border border-blue-200 font-medium"
                            >
                              {vehiculo}
                              <button
                                type="button"
                                onClick={() => removeVehiculoInteres(index)}
                                className="ml-2 text-blue-600 hover:text-blue-800 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                              >
                                <svg
                                  className="w-3 h-3"
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
                            </span>
                          ))}
                        {/* Input para agregar nuevos */}
                        <input
                          type="text"
                          value={currentVehiculoInput}
                          onChange={(e) =>
                            setCurrentVehiculoInput(e.target.value)
                          }
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const inputValue = currentVehiculoInput.trim()
                              if (inputValue) {
                                // Agregar el vehículo a la lista
                                setFormData((prev) => ({
                                  ...prev,
                                  intereses: {
                                    ...prev.intereses,
                                    vehiculosInteres: [
                                      ...prev.intereses.vehiculosInteres.filter(
                                        (v) => v.trim()
                                      ),
                                      inputValue,
                                    ],
                                  },
                                }))
                                // Limpiar el input
                                setCurrentVehiculoInput('')
                              }
                            }
                          }}
                          className="flex-1 min-w-[200px] px-3 py-2 border-none outline-none bg-transparent text-sm placeholder-gray-500"
                          placeholder={
                            formData.intereses.vehiculosInteres.length === 0
                              ? 'Escribe un vehículo y presiona Enter (ej: Fiat Punto)'
                              : 'Agregar otro vehículo...'
                          }
                        />
                      </div>
                      <p className="text-xs text-gray-500 flex items-center">
                        <svg
                          className="w-4 h-4 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Escribe un vehículo y presiona Enter para agregarlo.
                        Puedes agregar múltiples vehículos.
                      </p>
                    </div>
                  </div>

                  {/* Preferencias de vehículo */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label
                        htmlFor="intereses.precioMaximo"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        💰 Precio máximo (€)
                      </label>
                      <input
                        type="number"
                        id="intereses.precioMaximo"
                        name="intereses.precioMaximo"
                        value={formData.intereses.precioMaximo}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="15000"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="intereses.kilometrajeMaximo"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        🛣️ Kilometraje máximo
                      </label>
                      <input
                        type="number"
                        id="intereses.kilometrajeMaximo"
                        name="intereses.kilometrajeMaximo"
                        value={formData.intereses.kilometrajeMaximo}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="50000"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="intereses.añoMinimo"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        📅 Año mínimo
                      </label>
                      <input
                        type="number"
                        id="intereses.añoMinimo"
                        name="intereses.añoMinimo"
                        value={formData.intereses.añoMinimo}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="2020"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="intereses.combustiblePreferido"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        ⛽ Combustible preferido
                      </label>
                      <select
                        id="intereses.combustiblePreferido"
                        name="intereses.combustiblePreferido"
                        value={formData.intereses.combustiblePreferido}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      >
                        <option value="cualquiera">Cualquiera</option>
                        <option value="diesel">Diésel</option>
                        <option value="gasolina">Gasolina</option>
                        <option value="hibrido">Híbrido</option>
                        <option value="electrico">Eléctrico</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="intereses.cambioPreferido"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        🔧 Tipo de cambio
                      </label>
                      <select
                        id="intereses.cambioPreferido"
                        name="intereses.cambioPreferido"
                        value={formData.intereses.cambioPreferido}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      >
                        <option value="cualquiera">Cualquiera</option>
                        <option value="manual">Manual</option>
                        <option value="automatico">Automático</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="intereses.formaPagoPreferida"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        💳 Forma de pago
                      </label>
                      <select
                        id="intereses.formaPagoPreferida"
                        name="intereses.formaPagoPreferida"
                        value={formData.intereses.formaPagoPreferida}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      >
                        <option value="cualquiera">Cualquiera</option>
                        <option value="financiacion">Financiación</option>
                        <option value="contado">Contado</option>
                        <option value="entrega_usado">Entrega de usado</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bloque 3: Información de Contacto y Notas */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Información de Contacto
                  </h2>
                  <p className="text-sm text-gray-600">
                    Cómo llegó y notas adicionales (opcional)
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="comoLlego"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    📞 Cómo llegó a nosotros
                  </label>
                  <select
                    id="comoLlego"
                    name="comoLlego"
                    value={formData.comoLlego}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                  >
                    <option value="No especificado">No especificado</option>
                    <option value="Google">Google</option>
                    <option value="Recomendado">Recomendado</option>
                    <option value="Visita directa">Visita directa</option>
                    <option value="Redes sociales">Redes sociales</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="notas"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    📝 Notas del cliente
                  </label>
                  <textarea
                    id="notas"
                    name="notas"
                    value={formData.notas}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors resize-none"
                    placeholder="Agrega cualquier información adicional sobre el cliente..."
                  />
                </div>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex justify-end space-x-4 pt-6">
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 text-sm font-medium text-white bg-green-600 border border-transparent rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Creando...' : 'Crear Cliente'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ProtectedRoute>
  )
}
