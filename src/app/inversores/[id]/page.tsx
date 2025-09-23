'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Inversor, Vehiculo } from '@/lib/direct-database'
import { InvestorMetrics } from '@/components/InvestorMetrics'
import { InvestorVehicleCard } from '@/components/InvestorVehicleCard'
import { useSimpleToast } from '@/hooks/useSimpleToast'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { formatDateTime } from '@/lib/utils'
import NotasSection from '@/components/NotasSection'
import InversorReminders from '@/components/InversorReminders'
import { useInversorAuth } from '@/contexts/InversorAuthContext'

interface InvestorMetrics {
  beneficioAcumulado: number
  capitalInvertido: number
  capitalAportado: number
  capitalDisponible: number
  roi: number
  totalVendidos: number
  totalEnStock: number
  diasPromedioEnStock: number
}

export default function InvestorDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const { showToast, ToastContainer } = useSimpleToast()
  const { inversor, isLoading: authLoading } = useInversorAuth()

  const [inversorData, setInversorData] = useState<Inversor | null>(null)
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [metrics, setMetrics] = useState<InvestorMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('')
  const [periodo, setPeriodo] = useState('all')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editData, setEditData] = useState({
    nombre: '',
    email: '',
    capitalAportado: '',
    fechaAporte: '',
    capitalInvertido: '',
    capitalDisponible: '',
    notasInternas: '',
  })
  const [editingVehiculo, setEditingVehiculo] = useState<Vehiculo | null>(null)
  const [isEditingVehiculo, setIsEditingVehiculo] = useState(false)
  const [notas, setNotas] = useState<any[]>([])

  const inversorId = (params.id as string).split('-')[0] // Extraer solo el ID del slug

  const calculateAnnualizedROI = () => {
    if (!inversorData?.fechaAporte || !metrics?.roi) return 0

    const fechaInversion = new Date(inversorData.fechaAporte)
    const ahora = new Date()
    const diasTranscurridos = Math.floor(
      (ahora.getTime() - fechaInversion.getTime()) / (1000 * 60 * 60 * 24)
    )
    const añosTranscurridos = diasTranscurridos / 365

    if (añosTranscurridos <= 0) return metrics.roi

    return (Math.pow(1 + metrics.roi / 100, 1 / añosTranscurridos) - 1) * 100
  }

  const fetchData = async () => {
    try {
      setIsLoading(true)

      // Obtener datos del inversor
      const inversorResponse = await fetch(`/api/inversores/${inversorId}`)
      if (!inversorResponse.ok) throw new Error('Inversor no encontrado')
      const inversorData = await inversorResponse.json()
      setInversorData(inversorData)

      // Obtener vehículos del inversor
      const vehiculosResponse = await fetch(
        `/api/inversores/${inversorId}/vehiculos`
      )
      if (!vehiculosResponse.ok) throw new Error('Error al cargar vehículos')
      const vehiculosData = await vehiculosResponse.json()
      setVehiculos(vehiculosData)

      // Obtener métricas
      const metricsResponse = await fetch(
        `/api/inversores/${inversorId}/metrics`
      )
      if (!metricsResponse.ok) throw new Error('Error al cargar métricas')
      const metricsData = await metricsResponse.json()
      setMetrics(metricsData)
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar datos del inversor', 'error')
      router.push('/inversores')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (inversorId) {
      fetchData()
    }
  }, [inversorId])

  const handleViewVehicle = (id: number) => {
    // Por ahora redirigir a la página de vehículos con filtro
    router.push(`/vehiculos?inversor=${inversorId}&vehiculo=${id}`)
  }

  const handleEdit = () => {
    if (inversorData) {
      setEditData({
        nombre: inversorData.nombre,
        email: inversorData.email || '',
        capitalAportado: inversorData.capitalAportado?.toString() || '0',
        fechaAporte: inversorData.fechaAporte || '',
        capitalInvertido: inversorData.capitalInvertido?.toString() || '',
        capitalDisponible: inversorData.capitalDisponible?.toString() || '',
        notasInternas: inversorData.notasInternas || '',
      })
      setIsEditing(true)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditData({
      nombre: '',
      email: '',
      capitalAportado: '',
      fechaAporte: '',
      capitalInvertido: '',
      capitalDisponible: '',
      notasInternas: '',
    })
  }

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setEditData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)

      const response = await fetch(`/api/inversores/${inversorId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...editData,
          capitalAportado: parseFloat(editData.capitalAportado) || 0,
          capitalInvertido: editData.capitalInvertido
            ? parseFloat(editData.capitalInvertido)
            : undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al actualizar inversor')
      }

      showToast('Inversor actualizado correctamente', 'success')
      setIsEditing(false)
      await fetchData() // Recargar datos
    } catch (error) {
      console.error('Error:', error)
      showToast(
        error instanceof Error ? error.message : 'Error al actualizar inversor',
        'error'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditVehiculo = (vehiculo: Vehiculo) => {
    setEditingVehiculo(vehiculo)
    setIsEditingVehiculo(true)
  }

  const handleSaveVehiculo = async (vehiculoData: Partial<Vehiculo>) => {
    if (!editingVehiculo) return

    try {
      const response = await fetch(`/api/vehiculos/${editingVehiculo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vehiculoData),
      })

      if (response.ok) {
        await fetchData()
        setIsEditingVehiculo(false)
        setEditingVehiculo(null)
        showToast('Vehículo actualizado correctamente', 'success')
      } else {
        console.error('Error al actualizar vehículo')
        showToast('Error al actualizar vehículo', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al actualizar vehículo', 'error')
    }
  }

  const handleCancelEditVehiculo = () => {
    setIsEditingVehiculo(false)
    setEditingVehiculo(null)
  }

  const handlePhotoUpload = async (vehiculoId: number, photoUrl: string) => {
    try {
      const response = await fetch(`/api/vehiculos/${vehiculoId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fotoInversor: photoUrl }),
      })

      if (response.ok) {
        await fetchData()
        showToast('Foto cargada correctamente', 'success')
      } else {
        showToast('Error al cargar la foto', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar la foto', 'error')
    }
  }

  const getPeriodoText = () => {
    const periodos = {
      '30d': 'Últimos 30 días',
      '90d': 'Últimos 90 días',
      '1y': 'Último año',
      ytd: 'Año actual',
      all: 'Desde el inicio',
    }
    return periodos[periodo as keyof typeof periodos] || 'Desde el inicio'
  }

  const filteredVehiculos = vehiculos.filter((vehiculo) => {
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch =
      vehiculo.marca?.toLowerCase().includes(searchLower) ||
      vehiculo.modelo?.toLowerCase().includes(searchLower) ||
      vehiculo.referencia?.toLowerCase().includes(searchLower) ||
      vehiculo.matricula?.toLowerCase().includes(searchLower) ||
      vehiculo.bastidor?.toLowerCase().includes(searchLower)

    const matchesEstado = !estadoFilter || vehiculo.estado === estadoFilter

    return matchesSearch && matchesEstado
  })

  const estados = [
    { value: '', label: 'Todos los estados' },
    { value: 'REVI_INIC', label: 'Revisión Inicial' },
    { value: 'MECAUTO', label: 'Mecánica' },
    { value: 'REVI_PINTURA', label: 'Revisión Pintura' },
    { value: 'PINTURA', label: 'Pintura' },
    { value: 'LIMPIEZA', label: 'Limpieza' },
    { value: 'FOTOS', label: 'Fotos' },
    { value: 'PUBLICADO', label: 'Publicado' },
    { value: 'vendido', label: 'Vendido' },
  ]

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSkeleton />
        </main>
      </div>
    )
  }

  if (!inversorData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Inversor no encontrado
            </h1>
            <button
              onClick={() => router.push('/inversores')}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              Volver a Inversores
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <main className="w-[90%] mx-auto px-6 py-4">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center space-x-4 mb-4">
            <button
              onClick={() => router.push('/inversores')}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-800">
                {inversorData?.nombre}
              </h1>
              <p className="text-slate-600">Dashboard del inversor</p>
            </div>
          </div>

          {/* Información del inversor */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Información del Inversor
              </h2>
              {!isEditing && (
                <button
                  onClick={handleEdit}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  <span>Editar</span>
                </button>
              )}
            </div>

            {isEditing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSave()
                }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label
                      htmlFor="nombre"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Nombre completo *
                    </label>
                    <input
                      type="text"
                      id="nombre"
                      name="nombre"
                      value={editData.nombre}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                      value={editData.email}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="capitalAportado"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Capital aportado (€) *
                    </label>
                    <input
                      type="number"
                      id="capitalAportado"
                      name="capitalAportado"
                      value={editData.capitalAportado}
                      onChange={handleInputChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="fechaAporte"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Fecha de aporte
                    </label>
                    <input
                      type="date"
                      id="fechaAporte"
                      name="fechaAporte"
                      value={editData.fechaAporte}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="capitalInvertido"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Capital invertido (€)
                    </label>
                    <input
                      type="number"
                      id="capitalInvertido"
                      name="capitalInvertido"
                      value={editData.capitalInvertido}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Capital disponible (€) - Calculado automáticamente
                    </label>
                    <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-gray-600">
                      €
                      {(
                        (parseFloat(editData.capitalAportado) || 0) -
                        (parseFloat(editData.capitalInvertido) || 0)
                      ).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="notasInternas"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Notas internas
                  </label>
                  <textarea
                    id="notasInternas"
                    name="notasInternas"
                    value={editData.notasInternas}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {isSaving ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        <span>Guardando...</span>
                      </>
                    ) : (
                      'Guardar Cambios'
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                {/* Información de contacto - Izquierda (20%) */}
                <div className="w-full lg:w-1/5 mb-6 lg:mb-0 lg:mr-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">
                    Información de contacto
                  </h3>
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                    <div className="space-y-3">
                      {inversorData?.email && (
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <svg
                              className="w-4 h-4 text-blue-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-600">
                              Email
                            </p>
                            <p className="text-sm text-gray-900">
                              {inversorData.email}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-purple-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">
                            ID
                          </p>
                          <p className="text-sm text-gray-900">
                            {inversorData?.id}
                          </p>
                        </div>
                      </div>
                      {inversorData?.fechaAporte && (
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                            <svg
                              className="w-4 h-4 text-green-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-600">
                              Fecha aporte
                            </p>
                            <p className="text-sm text-gray-900">
                              {new Date(
                                inversorData.fechaAporte
                              ).toLocaleDateString('es-ES')}
                            </p>
                          </div>
                        </div>
                      )}
                      {inversorData?.notasInternas && (
                        <div className="mt-4 pt-3 border-t border-gray-200">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">
                            Notas internas
                          </h4>
                          <p className="text-sm text-gray-600 bg-white rounded-lg p-3 border border-gray-200">
                            {inversorData.notasInternas}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Resumen de Capital - Centro (60%) */}
                {metrics && (
                  <div className="w-full lg:w-3/5 mb-6 lg:mb-0 lg:mr-6">
                    <h3 className="text-xl font-semibold text-gray-700 mb-6 text-center">
                      Resumen de Capital
                    </h3>
                    <div className="grid grid-cols-3 gap-6">
                      <div className="text-center bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
                        <div className="w-16 h-16 bg-orange-200 rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg
                            className="w-8 h-8 text-orange-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                            />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-gray-600 mb-2">
                          Capital Aportado
                        </p>
                        <p className="text-xl font-bold text-orange-700">
                          €{metrics.capitalAportado.toLocaleString()}
                        </p>
                      </div>

                      <div className="text-center bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                        <div className="w-16 h-16 bg-blue-200 rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg
                            className="w-8 h-8 text-blue-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                            />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-gray-600 mb-2">
                          Capital Invertido
                        </p>
                        <p className="text-xl font-bold text-blue-700">
                          €{metrics.capitalInvertido.toLocaleString()}
                        </p>
                      </div>

                      <div className="text-center bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
                        <div className="w-16 h-16 bg-emerald-200 rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg
                            className="w-8 h-8 text-emerald-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                            />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-gray-600 mb-2">
                          Capital Disponible
                        </p>
                        <p
                          className={`text-xl font-bold ${metrics.capitalDisponible >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
                        >
                          €{metrics.capitalDisponible.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Rendimiento - Derecha (20%) */}
                {metrics && (
                  <div className="w-full lg:w-1/5">
                    <h3 className="text-lg font-semibold text-gray-700 mb-4 text-center">
                      Rendimiento
                    </h3>
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-green-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2"
                                />
                              </svg>
                            </div>
                            <span className="text-gray-700 font-medium text-sm">
                              Beneficio:
                            </span>
                          </div>
                          <span className="font-bold text-green-700 text-lg">
                            €
                            {(metrics.beneficioAcumulado || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-blue-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                                />
                              </svg>
                            </div>
                            <span className="text-gray-700 font-medium text-sm">
                              ROI:
                            </span>
                          </div>
                          <span className="font-bold text-blue-700 text-lg">
                            {(metrics.roi || 0).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-purple-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                                />
                              </svg>
                            </div>
                            <span className="text-gray-700 font-medium text-sm">
                              ROI Anual:
                            </span>
                          </div>
                          <span className="font-bold text-purple-700 text-lg">
                            {calculateAnnualizedROI().toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Layout principal con dos columnas */}
        <div className="flex gap-6">
          {/* Contenido principal - 70% del ancho */}
          <div className="w-[70%]">
            {/* Filtros y controles */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-8">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                  <input
                    type="text"
                    placeholder="Buscar vehículos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <div className="flex items-center space-x-2">
                    <select
                      value={estadoFilter}
                      onChange={(e) => setEstadoFilter(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      {estados.map((estado) => (
                        <option key={estado.value} value={estado.value}>
                          {estado.label}
                        </option>
                      ))}
                    </select>

                    {/* Controles de Vista */}
                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setViewMode('cards')}
                        className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center space-x-1 ${
                          viewMode === 'cards'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                          />
                        </svg>
                        <span>Cards</span>
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center space-x-1 ${
                          viewMode === 'list'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 6h16M4 10h16M4 14h16M4 18h16"
                          />
                        </svg>
                        <span>Lista</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  {/* Indicadores de Stock */}
                  {metrics && (
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2 bg-blue-50 px-3 py-2 rounded-lg">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-sm font-medium text-blue-700">
                          En Stock: {metrics.totalEnStock}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 bg-green-50 px-3 py-2 rounded-lg">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-sm font-medium text-green-700">
                          Vendidos: {metrics.totalVendidos}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Lista de vehículos */}
            {filteredVehiculos.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm || estadoFilter
                    ? 'No se encontraron vehículos'
                    : 'Sin vehículos asignados'}
                </h3>
                <p className="text-gray-500">
                  {searchTerm || estadoFilter
                    ? 'Intenta con otros filtros de búsqueda'
                    : 'Este inversor aún no tiene vehículos asignados'}
                </p>
              </div>
            ) : (
              <div
                className={
                  viewMode === 'cards'
                    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                    : 'space-y-4'
                }
              >
                {filteredVehiculos.map((vehiculo) => (
                  <InvestorVehicleCard
                    key={vehiculo.id}
                    vehiculo={vehiculo}
                    inversor={inversor}
                    onView={handleViewVehicle}
                    onEdit={handleEditVehiculo}
                    onEditVehiculo={handleEditVehiculo}
                    onPhotoUpload={handlePhotoUpload}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar derecho - 30% del ancho */}
          <div className="w-[30%]">
            {/* Bloque de Notas */}
            {inversorData?.id ? (
              <NotasSection
                notas={notas}
                onNotasChange={setNotas}
                entityId={inversorData.id}
                entityType="inversores"
              />
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Notas
                </h2>
                <p className="text-gray-500 text-center py-4">Cargando...</p>
              </div>
            )}

            {/* Bloque de Recordatorios */}
            {inversorData?.id ? (
              <InversorReminders
                inversorId={inversorData.id}
                inversorNombre={inversorData.nombre}
              />
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Recordatorios
                </h2>
                <p className="text-gray-500 text-center py-4">Cargando...</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal de edición de vehículo */}
      {isEditingVehiculo && editingVehiculo && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCancelEditVehiculo()
            }
          }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Editar Vehículo - {editingVehiculo.marca} {editingVehiculo.modelo}
            </h2>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                const fileInput = formData.get('fotoInversor') as File

                // Si hay un archivo, convertirlo a base64
                let fotoInversor = editingVehiculo.fotoInversor
                if (fileInput && fileInput.size > 0) {
                  const reader = new FileReader()
                  reader.onload = (event) => {
                    const photoUrl = event.target?.result as string
                    const vehiculoData = {
                      precioCompra: formData.get('precioCompra')
                        ? parseFloat(formData.get('precioCompra') as string)
                        : undefined,
                      gastosTransporte: formData.get('gastosTransporte')
                        ? parseFloat(formData.get('gastosTransporte') as string)
                        : undefined,
                      gastosTasas: formData.get('gastosTasas')
                        ? parseFloat(formData.get('gastosTasas') as string)
                        : undefined,
                      gastosMecanica: formData.get('gastosMecanica')
                        ? parseFloat(formData.get('gastosMecanica') as string)
                        : undefined,
                      gastosPintura: formData.get('gastosPintura')
                        ? parseFloat(formData.get('gastosPintura') as string)
                        : undefined,
                      gastosLimpieza: formData.get('gastosLimpieza')
                        ? parseFloat(formData.get('gastosLimpieza') as string)
                        : undefined,
                      gastosOtros: formData.get('gastosOtros')
                        ? parseFloat(formData.get('gastosOtros') as string)
                        : undefined,
                      precioVenta: formData.get('precioVenta')
                        ? parseFloat(formData.get('precioVenta') as string)
                        : undefined,
                      notasInversor:
                        (formData.get('notasInversor') as string) || undefined,
                      fotoInversor: photoUrl,
                    }
                    handleSaveVehiculo(vehiculoData)
                  }
                  reader.readAsDataURL(fileInput)
                } else {
                  // Si no hay archivo, usar la foto actual o undefined si se borró
                  const vehiculoData = {
                    precioCompra: formData.get('precioCompra')
                      ? parseFloat(formData.get('precioCompra') as string)
                      : undefined,
                    gastosTransporte: formData.get('gastosTransporte')
                      ? parseFloat(formData.get('gastosTransporte') as string)
                      : undefined,
                    gastosTasas: formData.get('gastosTasas')
                      ? parseFloat(formData.get('gastosTasas') as string)
                      : undefined,
                    gastosMecanica: formData.get('gastosMecanica')
                      ? parseFloat(formData.get('gastosMecanica') as string)
                      : undefined,
                    gastosPintura: formData.get('gastosPintura')
                      ? parseFloat(formData.get('gastosPintura') as string)
                      : undefined,
                    gastosLimpieza: formData.get('gastosLimpieza')
                      ? parseFloat(formData.get('gastosLimpieza') as string)
                      : undefined,
                    gastosOtros: formData.get('gastosOtros')
                      ? parseFloat(formData.get('gastosOtros') as string)
                      : undefined,
                    precioVenta: formData.get('precioVenta')
                      ? parseFloat(formData.get('precioVenta') as string)
                      : undefined,
                    notasInversor:
                      (formData.get('notasInversor') as string) || undefined,
                    fotoInversor: fotoInversor,
                  }
                  handleSaveVehiculo(vehiculoData)
                }
              }}
            >
              {/* Precio de Compra */}
              <div className="mb-6">
                <label className="block text-base font-medium text-gray-700 mb-2">
                  💰 Precio de Compra (€)
                </label>
                <input
                  type="number"
                  name="precioCompra"
                  defaultValue={editingVehiculo.precioCompra || ''}
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>

              {/* Gastos Extras - Más pequeños */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  💸 Gastos Extras
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      🚛 Transporte (€)
                    </label>
                    <input
                      type="number"
                      name="gastosTransporte"
                      defaultValue={editingVehiculo.gastosTransporte || ''}
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      📋 Tasas/Gestoría (€)
                    </label>
                    <input
                      type="number"
                      name="gastosTasas"
                      defaultValue={editingVehiculo.gastosTasas || ''}
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      🔧 Mecánica (€)
                    </label>
                    <input
                      type="number"
                      name="gastosMecanica"
                      defaultValue={editingVehiculo.gastosMecanica || ''}
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      🎨 Pintura (€)
                    </label>
                    <input
                      type="number"
                      name="gastosPintura"
                      defaultValue={editingVehiculo.gastosPintura || ''}
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      🧽 Limpieza (€)
                    </label>
                    <input
                      type="number"
                      name="gastosLimpieza"
                      defaultValue={editingVehiculo.gastosLimpieza || ''}
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      📄 Otros Gastos (€)
                    </label>
                    <input
                      type="number"
                      name="gastosOtros"
                      defaultValue={editingVehiculo.gastosOtros || ''}
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Precio de Venta */}
              <div className="mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ✅ Precio de Venta (€)
                  </label>
                  <input
                    type="number"
                    name="precioVenta"
                    defaultValue={editingVehiculo.precioVenta || ''}
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                {/* Beneficio calculado automáticamente */}
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <svg
                      className="w-4 h-4 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-xs font-medium text-green-800">
                      💡 El beneficio se calculará automáticamente: Precio de
                      Venta - (Precio de Compra + Gastos)
                    </span>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Foto del Vehículo
                </label>

                {/* Foto actual */}
                {editingVehiculo.fotoInversor && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-2">Foto actual:</p>
                    <div className="relative inline-block">
                      <img
                        src={editingVehiculo.fotoInversor}
                        alt="Foto actual"
                        className="w-32 h-24 object-cover rounded-lg border border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditingVehiculo((prev) =>
                            prev ? { ...prev, fotoInversor: undefined } : null
                          )
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}

                {/* Input para nueva foto */}
                <input
                  type="file"
                  name="fotoInversor"
                  accept="image/*"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onload = (event) => {
                        const photoUrl = event.target?.result as string
                        setEditingVehiculo((prev) =>
                          prev ? { ...prev, fotoInversor: photoUrl } : null
                        )
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {editingVehiculo.fotoInversor
                    ? 'Selecciona una nueva foto para reemplazar la actual'
                    : 'Selecciona una foto para este vehículo'}
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas del Inversor
                </label>
                <textarea
                  name="notasInversor"
                  defaultValue={editingVehiculo.notasInversor || ''}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Notas adicionales sobre este vehículo..."
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCancelEditVehiculo}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-green-500 border border-transparent rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  )
}
