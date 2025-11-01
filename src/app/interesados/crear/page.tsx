'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function CrearInteresadoPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    nombre: '',
    apellidos: '',
    telefono: '',
    intereses: {
      vehiculosInteres: [''],
      precioMaximo: '',
      kilometrajeMaximo: '',
      añoMinimo: '',
      combustiblePreferido: 'cualquiera',
      cambioPreferido: 'cualquiera',
      formaPagoPreferida: 'cualquiera',
    },
  })
  const [vehiculoInput, setVehiculoInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handle = (e: any) => {
    const { name, value } = e.target
    if (name.startsWith('intereses.')) {
      const field = name.split('.')[1]
      setForm((p) => ({ ...p, intereses: { ...p.intereses, [field]: value } }))
    } else {
      setForm((p) => ({ ...p, [name]: value }))
    }
  }

  const submit = async (e: any) => {
    e.preventDefault()
    if (!form.nombre.trim() || !form.apellidos.trim() || !form.telefono.trim())
      return
    setSubmitting(true)
    try {
      const res = await fetch('/api/interesados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          telefono: form.telefono.trim(),
          vehiculosInteres: JSON.stringify(
            form.intereses.vehiculosInteres.filter((v) => v.trim() !== '')
          ),
          presupuestoMaximo: form.intereses.precioMaximo || null,
          kilometrajeMaximo: form.intereses.kilometrajeMaximo || null,
          añoMinimo: form.intereses.añoMinimo || null,
          combustiblePreferido: form.intereses.combustiblePreferido,
          cambioPreferido: form.intereses.cambioPreferido,
          formaPagoPreferida: form.intereses.formaPagoPreferida,
        }),
      })
      if (res.ok) router.push('/interesados')
    } finally {
      setSubmitting(false)
    }
  }

  const removeVeh = (idx: number) => {
    setForm((p) => ({
      ...p,
      intereses: {
        ...p.intereses,
        vehiculosInteres: p.intereses.vehiculosInteres.filter(
          (_, i) => i !== idx
        ),
      },
    }))
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
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
                  <h1 className="text-3xl font-bold text-gray-900">
                    Crear Interesado
                  </h1>
                  <p className="mt-1 text-gray-600">
                    Completa la información básica y sus intereses
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push('/interesados')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                ← Volver a Interesados
              </button>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-6">
            {/* Información básica */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre *
                  </label>
                  <input
                    name="nombre"
                    value={form.nombre}
                    onChange={handle}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Apellidos *
                  </label>
                  <input
                    name="apellidos"
                    value={form.apellidos}
                    onChange={handle}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono *
                  </label>
                  <input
                    name="telefono"
                    value={form.telefono}
                    onChange={handle}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Intereses */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
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
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Intereses
                  </h2>
                  <p className="text-sm text-gray-600">
                    Preferencias de vehículo y presupuesto (opcional)
                  </p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  🚗 Vehículos de interés
                </label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[40px] p-2 border border-gray-300 rounded-md bg-gray-50">
                  {form.intereses.vehiculosInteres
                    .filter((v) => v.trim())
                    .map((v, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-3 py-1.5 rounded-full text-sm bg-blue-100 text-blue-800 border border-blue-200 font-medium"
                      >
                        {v}
                        <button
                          type="button"
                          onClick={() => removeVeh(idx)}
                          className="ml-2 text-blue-600 hover:text-blue-800 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  <input
                    value={vehiculoInput}
                    onChange={(e) => setVehiculoInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const val = vehiculoInput.trim()
                        if (val) {
                          setForm((p) => ({
                            ...p,
                            intereses: {
                              ...p.intereses,
                              vehiculosInteres: [
                                ...p.intereses.vehiculosInteres.filter((x) =>
                                  x.trim()
                                ),
                                val,
                              ],
                            },
                          }))
                          setVehiculoInput('')
                        }
                      }
                    }}
                    className="flex-1 min-w-[200px] px-3 py-2 border-none outline-none bg-transparent text-sm placeholder-gray-500"
                    placeholder={
                      form.intereses.vehiculosInteres.length === 0
                        ? 'Escribe un vehículo y presiona Enter (ej: Fiat Punto)'
                        : 'Agregar otro vehículo...'
                    }
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Escribe un vehículo y presiona Enter para agregarlo. Puedes
                  agregar múltiples vehículos.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    💰 Precio máximo (€)
                  </label>
                  <input
                    name="intereses.precioMaximo"
                    value={form.intereses.precioMaximo}
                    onChange={handle}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    🛣️ Kilometraje máximo
                  </label>
                  <input
                    name="intereses.kilometrajeMaximo"
                    value={form.intereses.kilometrajeMaximo}
                    onChange={handle}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    📅 Año mínimo
                  </label>
                  <input
                    name="intereses.añoMinimo"
                    value={form.intereses.añoMinimo}
                    onChange={handle}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ⛽ Combustible
                  </label>
                  <select
                    name="intereses.combustiblePreferido"
                    value={form.intereses.combustiblePreferido}
                    onChange={handle}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    🔧 Cambio
                  </label>
                  <select
                    name="intereses.cambioPreferido"
                    value={form.intereses.cambioPreferido}
                    onChange={handle}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  >
                    <option value="cualquiera">Cualquiera</option>
                    <option value="manual">Manual</option>
                    <option value="automatico">Automático</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    💳 Forma de pago
                  </label>
                  <select
                    name="intereses.formaPagoPreferida"
                    value={form.intereses.formaPagoPreferida}
                    onChange={handle}
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

            {/* Acciones */}
            <div className="flex justify-end space-x-4 pt-2">
              <button
                type="button"
                onClick={() => router.push('/interesados')}
                className="px-6 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 text-sm font-medium text-white bg-green-600 border border-transparent rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Creando...' : 'Crear Interesado'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ProtectedRoute>
  )
}
