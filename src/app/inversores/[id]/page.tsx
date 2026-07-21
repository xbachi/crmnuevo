'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Inversor, Vehiculo } from '@/lib/database'
import { InvestorMetrics } from '@/components/InvestorMetrics'
import { InvestorVehicleCard } from '@/components/InvestorVehicleCard'
import { useSimpleToast } from '@/hooks/useSimpleToast'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { formatDateTime, capitalizeText } from '@/lib/utils'
import NotasSection from '@/components/NotasSection'
import InversorReminders from '@/components/InversorReminders'
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal'
import { useInversorAuth } from '@/contexts/InversorAuthContext'
import InversorProtectedRoute from '@/components/InversorProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { isCrmUserAuthenticated } from '@/lib/auth-utils'

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

interface Nota {
  id: number
  contenido: string
  usuario_nombre: string
  fecha_creacion: string
}

export default function InvestorDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const { showToast, ToastContainer } = useSimpleToast()
  const { inversor, isLoading: authLoading } = useInversorAuth()
  const { isAdmin } = useAuth()
  const [isCrmUser, setIsCrmUser] = useState(false)

  // Verificar si es usuario CRM (admin)
  useEffect(() => {
    setIsCrmUser(isCrmUserAuthenticated())
  }, [])

  // Determinar si el usuario puede editar (solo admin puede editar)
  const canEdit = isAdmin || isCrmUser

  const [inversorData, setInversorData] = useState<Inversor | null>(null)
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [metrics, setMetrics] = useState<InvestorMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('')
  const [stockFilter, setStockFilter] = useState('activos') // Por defecto mostrar activos
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
  const [notas, setNotas] = useState<Nota[]>([])

  // Estados para asignar un activo existente al inversor
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignSearch, setAssignSearch] = useState('')
  const [assignVehiculos, setAssignVehiculos] = useState<
    Array<Vehiculo & { inversorNombre?: string }>
  >([])
  const [isLoadingAssign, setIsLoadingAssign] = useState(false)
  const [assigningId, setAssigningId] = useState<number | null>(null)

  // Estados para documentos
  const [documentos, setDocumentos] = useState<
    Array<{
      id: string
      name: string
      fileName: string
      size: number
      type: string
      uploadDate: string
      path: string
      tamañoFormateado: string
    }>
  >([])

  // Estados para modal de confirmación de eliminación
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<{
    id: string
    name: string
  } | null>(null)
  const [isDeletingFile, setIsDeletingFile] = useState(false)

  const inversorId = (params.id as string).split('-')[0] // Extraer solo el ID del slug

  // Verificar si el usuario actual es un inversor autenticado (NO admin)
  const isInvestorUser = Boolean(
    inversor && inversor.id === parseInt(inversorId) && !canEdit
  )

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

  useEffect(() => {
    if (inversorData?.id) {
      fetchDocumentos()
    }
  }, [inversorData?.id])

  const refreshVehiculosYMetrics = async () => {
    try {
      const [vehiculosResponse, metricsResponse] = await Promise.all([
        fetch(`/api/inversores/${inversorId}/vehiculos`),
        fetch(`/api/inversores/${inversorId}/metrics`),
      ])
      if (vehiculosResponse.ok) setVehiculos(await vehiculosResponse.json())
      if (metricsResponse.ok) setMetrics(await metricsResponse.json())
    } catch (error) {
      console.error('Error al refrescar vehículos/métricas:', error)
    }
  }

  const tipoLabel = (tipo?: string) => {
    switch (tipo) {
      case 'C':
      case 'Compra':
        return 'Compra'
      case 'I':
      case 'Inversor':
        return 'Inversor'
      case 'D':
      case 'Depósito':
      case 'Deposito Venta':
        return 'Depósito'
      case 'R':
        return 'Coche R'
      default:
        return tipo || '-'
    }
  }

  const openAssignModal = async () => {
    setShowAssignModal(true)
    setAssignSearch('')
    setIsLoadingAssign(true)
    try {
      const response = await fetch('/api/vehiculos?page=1&limit=1000')
      if (!response.ok) throw new Error('Error al cargar vehículos')
      const data = await response.json()
      setAssignVehiculos(data.vehiculos || [])
    } catch (error) {
      console.error('Error al cargar vehículos:', error)
      showToast('Error al cargar vehículos', 'error')
      setAssignVehiculos([])
    } finally {
      setIsLoadingAssign(false)
    }
  }

  const closeAssignModal = () => {
    setShowAssignModal(false)
    setAssignSearch('')
    setAssignVehiculos([])
  }

  const handleAssignVehiculo = async (
    vehiculo: Vehiculo & { inversorNombre?: string }
  ) => {
    if (
      vehiculo.inversorId &&
      vehiculo.inversorId !== parseInt(inversorId) &&
      !window.confirm(
        `Este vehículo ya está asignado a ${vehiculo.inversorNombre || 'otro inversor'}. ¿Reasignarlo a ${inversorData?.nombre}?`
      )
    ) {
      return
    }

    // Sin precio de compra el coche no descuenta capital del inversor:
    // pedirlo en el momento (opcional, se puede cargar después en la ficha).
    let precioCompra: number | null = null
    const sinPrecio = !vehiculo.precioCompra || vehiculo.precioCompra <= 0
    if (sinPrecio) {
      const input = window.prompt(
        `${vehiculo.marca} ${vehiculo.modelo} no tiene precio de compra cargado.\n` +
          `Sin precio, el capital invertido de ${inversorData?.nombre} no se descontará.\n\n` +
          `Ingresá el precio de compra en € (o dejá vacío para asignar sin precio):`
      )
      if (input === null) return
      const parsed = parseFloat(input.replace(/\./g, '').replace(',', '.'))
      if (input.trim() !== '' && (isNaN(parsed) || parsed <= 0)) {
        showToast('Precio de compra inválido', 'error')
        return
      }
      if (input.trim() !== '') precioCompra = parsed
    }

    try {
      setAssigningId(vehiculo.id)
      const response = await fetch(`/api/vehiculos/${vehiculo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'I',
          inversorId: parseInt(inversorId),
          ...(precioCompra !== null ? { precioCompra } : {}),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Error al asignar el vehículo')
      }

      if (sinPrecio && precioCompra === null) {
        showToast(
          'Asignado sin precio de compra: el capital no se descontará hasta cargarlo en la ficha del vehículo',
          'error'
        )
      } else {
        showToast('Vehículo asignado correctamente', 'success')
      }
      closeAssignModal()
      await refreshVehiculosYMetrics()
    } catch (error) {
      console.error('Error al asignar vehículo:', error)
      showToast(
        error instanceof Error ? error.message : 'Error al asignar el vehículo',
        'error'
      )
    } finally {
      setAssigningId(null)
    }
  }

  const assignVehiculosFiltrados = assignVehiculos.filter((vehiculo) => {
    if ((vehiculo.estado || '').toLowerCase().trim() === 'vendido') return false
    if (vehiculo.inversorId === parseInt(inversorId)) return false

    const searchLower = assignSearch.toLowerCase().trim()
    if (!searchLower) return true
    return (
      vehiculo.matricula?.toLowerCase().includes(searchLower) ||
      vehiculo.marca?.toLowerCase().includes(searchLower) ||
      vehiculo.modelo?.toLowerCase().includes(searchLower) ||
      vehiculo.referencia?.toLowerCase().includes(searchLower)
    )
  })

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

  // Función helper para parsear valores numéricos del formulario
  // Si el campo está vacío, devuelve 0 en lugar de undefined
  const parseNumericField = (value: FormDataEntryValue | null): number => {
    if (
      !value ||
      value === '' ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      return 0
    }
    const parsed = parseFloat(value as string)
    return isNaN(parsed) ? 0 : parsed
  }

  const handleSaveVehiculo = async (vehiculoData: Partial<Vehiculo>) => {
    if (!editingVehiculo) return

    // Log para debugging
    console.log('💾 [SAVE VEHICULO] Datos a guardar:', vehiculoData)
    console.log(
      '💾 [SAVE VEHICULO] garantiaPremium:',
      vehiculoData.garantiaPremium
    )
    console.log(
      '💾 [SAVE VEHICULO] Tipo de garantiaPremium:',
      typeof vehiculoData.garantiaPremium
    )

    try {
      const response = await fetch(`/api/vehiculos/${editingVehiculo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vehiculoData),
      })

      if (response.ok) {
        const updatedVehiculo = await response.json()
        console.log('✅ [SAVE VEHICULO] Vehículo actualizado:', updatedVehiculo)
        console.log(
          '✅ [SAVE VEHICULO] garantiaPremium guardado:',
          (updatedVehiculo as any).garantiaPremium
        )
        await fetchData()
        setIsEditingVehiculo(false)
        setEditingVehiculo(null)
        showToast('Vehículo actualizado correctamente', 'success')
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error(
          'Error al actualizar vehículo:',
          response.status,
          errorData
        )
        showToast(
          `Error al actualizar vehículo: ${errorData.error || 'Error desconocido'}`,
          'error'
        )
      }
    } catch (error) {
      console.error('Error:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido'
      showToast(`Error al actualizar vehículo: ${errorMessage}`, 'error')
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

  // Función para obtener documentos
  const fetchDocumentos = async () => {
    if (!inversorData?.id) return

    try {
      console.log(
        `📁 [INVERSOR PAGE] Obteniendo documentos para inversor ${inversorData.id}`
      )
      const response = await fetch(`/api/inversores/${inversorData.id}/files`)
      if (response.ok) {
        const data = await response.json()
        const documentosFormateados = data.map((doc: any) => ({
          ...doc,
          tamañoFormateado: formatFileSize(doc.size),
        }))
        setDocumentos(documentosFormateados)
        console.log(
          `✅ [INVERSOR PAGE] Archivos cargados:`,
          documentosFormateados.length
        )
      } else {
        console.error('Error al obtener documentos:', response.statusText)
      }
    } catch (error) {
      console.error('Error al obtener documentos:', error)
    }
  }

  // Funciones para manejar documentos
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files
    if (!files || files.length === 0 || !inversorData?.id) return

    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('inversorId', inversorData.id.toString())

      try {
        const response = await fetch(
          `/api/inversores/${inversorData.id}/upload-document`,
          {
            method: 'POST',
            body: formData,
          }
        )

        if (response.ok) {
          const responseData = await response.json()
          console.log('✅ [INVERSOR PAGE] Archivo subido:', responseData)
          showToast('Archivo subido exitosamente', 'success')
          // Si el archivo se subió correctamente, agregarlo inmediatamente a la lista
          if (responseData.file) {
            setDocumentos((prev) => {
              const updated = [
                ...prev,
                {
                  ...responseData.file,
                  tamañoFormateado: formatFileSize(responseData.file.size),
                },
              ]
              console.log(
                '📝 [INVERSOR PAGE] Documentos actualizados:',
                updated
              )
              return updated
            })
          }
          // Recargar archivos para asegurar sincronización
          await fetchDocumentos()
        } else {
          const errorData = await response.json().catch(() => ({}))
          console.error(
            '❌ [INVERSOR PAGE] Error al subir archivo:',
            response.status,
            errorData
          )
          showToast(
            `Error al subir archivo: ${errorData.error || errorData.details || 'Error desconocido'}`,
            'error'
          )
        }
      } catch (error) {
        console.error('Error al subir archivo:', error)
        showToast('Error al subir archivo', 'error')
      }
    }
  }

  const handleDownloadFile = (docId: string) => {
    const documento = documentos.find((doc) => doc.id === docId)
    if (documento) {
      // Crear un enlace temporal para descargar el archivo
      const link = document.createElement('a')
      link.href = documento.path
      link.download = documento.name
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      showToast(`Descargando ${documento.name}`, 'success')
    }
  }

  const handleDeleteFile = (docId: string) => {
    const documento = documentos.find((doc) => doc.id === docId)
    if (documento) {
      setFileToDelete({ id: docId, name: documento.name })
      setShowDeleteModal(true)
    }
  }

  const confirmDeleteFile = async () => {
    if (!fileToDelete || !inversorData?.id) return

    try {
      setIsDeletingFile(true)
      console.log(
        `🗑️ [INVERSOR DELETE] Eliminando archivo ${fileToDelete.id} del inversor ${inversorData.id}`
      )

      const response = await fetch(
        `/api/inversores/${inversorData.id}/files/${fileToDelete.id}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        console.error(
          '❌ [INVERSOR DELETE] Error eliminando archivo:',
          errorData
        )
        showToast(`Error eliminando archivo: ${errorData.error}`, 'error')
        return
      }

      const result = await response.json()
      console.log(
        '✅ [INVERSOR DELETE] Archivo eliminado exitosamente:',
        result
      )

      // Actualizar lista de documentos
      await fetchDocumentos()
      showToast('Archivo eliminado correctamente', 'success')

      // Cerrar modal
      setShowDeleteModal(false)
      setFileToDelete(null)
    } catch (error) {
      console.error('❌ [INVERSOR DELETE] Error eliminando archivo:', error)
      showToast('Error eliminando archivo', 'error')
    } finally {
      setIsDeletingFile(false)
    }
  }

  const cancelDeleteFile = () => {
    setShowDeleteModal(false)
    setFileToDelete(null)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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

    // Normalizar estado a minúsculas para comparación
    const estadoNormalized = vehiculo.estado?.toLowerCase().trim() || ''
    const matchesStock =
      (stockFilter === 'activos' && estadoNormalized !== 'vendido') ||
      (stockFilter === 'vendidos' && estadoNormalized === 'vendido')

    return matchesSearch && matchesEstado && matchesStock
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
        <main className="w-[90%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSkeleton />
        </main>
      </div>
    )
  }

  if (!inversorData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <main className="w-[90%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
    <InversorProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <main className="w-[90%] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3 sm:space-x-4">
                <button
                  onClick={() => router.push('/inversores')}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg
                    className="w-5 h-5 sm:w-6 sm:h-6"
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
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800">
                    {inversorData?.nombre}
                  </h1>
                  <p className="text-sm sm:text-base text-slate-600">
                    Dashboard del inversor
                  </p>
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={openAssignModal}
                  className="px-3 sm:px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors flex items-center space-x-2 text-sm sm:text-base whitespace-nowrap"
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
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  <span>Asignar activo</span>
                </button>
              )}
            </div>

            {/* Información del inversor */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 lg:p-8 mb-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  Información del Inversor
                </h2>
                {!isEditing && canEdit && (
                  <button
                    onClick={handleEdit}
                    className="px-3 sm:px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2 text-sm sm:text-base"
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
                      <h3 className="text-lg font-semibold text-gray-700 mb-3 text-center">
                        Resumen de Capital
                      </h3>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-2 border border-orange-200">
                          <div className="w-8 h-8 bg-orange-200 rounded-full flex items-center justify-center mx-auto mb-2">
                            <svg
                              className="w-4 h-4 text-orange-600"
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
                          <p className="text-xs font-semibold text-gray-600 mb-1">
                            Capital Aportado
                          </p>
                          <p className="text-sm font-bold text-orange-700">
                            €{metrics.capitalAportado.toLocaleString()}
                          </p>
                        </div>

                        <div className="text-center bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-2 border border-blue-200">
                          <div className="w-8 h-8 bg-blue-200 rounded-full flex items-center justify-center mx-auto mb-2">
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
                                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                              />
                            </svg>
                          </div>
                          <p className="text-xs font-semibold text-gray-600 mb-1">
                            Capital Invertido
                          </p>
                          <p className="text-sm font-bold text-blue-700">
                            €{metrics.capitalInvertido.toLocaleString()}
                          </p>
                        </div>

                        <div className="text-center bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-2 border border-emerald-200">
                          <div className="w-8 h-8 bg-emerald-200 rounded-full flex items-center justify-center mx-auto mb-2">
                            <svg
                              className="w-4 h-4 text-emerald-600"
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
                          <p className="text-xs font-semibold text-gray-600 mb-1">
                            Capital Disponible
                          </p>
                          <p
                            className={`text-sm font-bold ${metrics.capitalDisponible >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
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
                              {(
                                metrics.beneficioAcumulado || 0
                              ).toLocaleString()}
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

          {/* Layout principal */}
          <div className="flex flex-col xl:flex-row gap-6">
            {/* Contenido principal */}
            <div className="w-full xl:w-[76%]">
              {/* Filtros y controles */}
              <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-8">
                <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0">
                  {/* Search - 40% del espacio */}
                  <div className="lg:w-2/5">
                    <input
                      type="text"
                      placeholder="Buscar vehículos..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  {/* Botones de filtro y controles - 60% del espacio */}
                  <div className="lg:w-3/5 flex flex-row items-center justify-between space-x-2">
                    {/* Botones de filtro Todos/Activos/Vendidos */}
                    <div className="flex space-x-1 lg:space-x-2">
                      <button
                        onClick={() => setStockFilter('activos')}
                        className={`px-2 lg:px-4 py-1 lg:py-2 text-xs lg:text-sm rounded-lg transition-all duration-200 flex items-center space-x-1 lg:space-x-2 whitespace-nowrap ${
                          stockFilter === 'activos'
                            ? 'bg-green-100 text-green-700 border-2 border-green-300 shadow-md'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 border-2 border-transparent'
                        }`}
                      >
                        <svg
                          className="w-3 h-3 lg:w-4 lg:h-4 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="flex items-center">
                          Activos ({metrics?.totalEnStock || 0})
                        </span>
                      </button>
                      <button
                        onClick={() => setStockFilter('vendidos')}
                        className={`px-2 lg:px-4 py-1 lg:py-2 text-xs lg:text-sm rounded-lg transition-all duration-200 flex items-center space-x-1 lg:space-x-2 whitespace-nowrap ${
                          stockFilter === 'vendidos'
                            ? 'bg-red-100 text-red-700 border-2 border-red-300 shadow-md'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 border-2 border-transparent'
                        }`}
                      >
                        <svg
                          className="w-3 h-3 lg:w-4 lg:h-4 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="flex items-center">
                          Vendidos ({metrics?.totalVendidos || 0})
                        </span>
                      </button>
                    </div>

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
                        <span className="hidden 2xl:inline">Cards</span>
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
                        <span className="hidden 2xl:inline">Lista</span>
                      </button>
                    </div>
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
                      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 items-start'
                      : 'space-y-4'
                  }
                >
                  {filteredVehiculos.map((vehiculo) => (
                    <InvestorVehicleCard
                      key={vehiculo.id}
                      vehiculo={vehiculo}
                      inversor={inversor}
                      onView={handleViewVehicle}
                      onEdit={canEdit ? handleEditVehiculo : undefined}
                      onEditVehiculo={canEdit ? handleEditVehiculo : undefined}
                      onPhotoUpload={canEdit ? handlePhotoUpload : undefined}
                      onVehiculoUpdate={fetchData}
                      isReadOnly={!canEdit}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar derecho - Solo visible en desktop */}
            <div className="hidden xl:block w-[24%]">
              {/* Bloque de Notas */}
              {inversorData?.id ? (
                <NotasSection
                  notas={notas}
                  onNotasChange={setNotas}
                  entityId={inversorData.id}
                  entityType="inversor"
                  isReadOnly={!canEdit}
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
                <div className="mt-8">
                  <InversorReminders
                    inversorId={inversorData.id}
                    inversorNombre={inversorData.nombre}
                    isReadOnly={isInvestorUser}
                  />
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-8">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Recordatorios
                  </h2>
                  <p className="text-gray-500 text-center py-4">Cargando...</p>
                </div>
              )}

              {/* Bloque de Archivos */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Documentos
                    </h2>
                  </div>
                  {canEdit && (
                    <label className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors cursor-pointer">
                      <svg
                        className="w-4 h-4 inline mr-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                        />
                      </svg>
                      Subir Archivo
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  )}
                </div>

                {/* Lista de archivos - Estilo Google Drive */}
                <div className="space-y-2">
                  {documentos.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <svg
                        className="w-12 h-12 mx-auto mb-4 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <p>No hay documentos subidos</p>
                      <p className="text-sm">
                        Sube archivos para organizarlos aquí
                      </p>
                    </div>
                  ) : (
                    documentos.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
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
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-medium text-gray-900 truncate"
                              title={doc.name}
                            >
                              {doc.name.length > 30
                                ? `${doc.name.substring(0, 30)}...`
                                : doc.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {doc.tamañoFormateado} •{' '}
                              {new Date(doc.uploadDate).toLocaleDateString(
                                'es-ES'
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <button
                            onClick={() => handleDownloadFile(doc.id)}
                            className="px-3 py-1 bg-green-100 text-green-700 rounded-md text-sm font-medium hover:bg-green-200 transition-colors"
                            title="Descargar"
                          >
                            Descargar
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => handleDeleteFile(doc.id)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              title="Eliminar"
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
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Secciones móviles - Solo visible en mobile */}
          <div className="xl:hidden space-y-6 mt-6">
            {/* Acordeón de Notas */}
            {inversorData?.id && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <details className="group">
                  <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                        <svg
                          className="w-4 h-4 text-white"
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
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Notas
                      </h3>
                    </div>
                    <svg
                      className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform"
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
                  </summary>
                  <div className="p-4 pt-0">
                    <NotasSection
                      notas={notas}
                      onNotasChange={setNotas}
                      entityId={inversorData.id}
                      entityType="inversor"
                      isReadOnly={!canEdit}
                    />
                  </div>
                </details>
              </div>
            )}

            {/* Acordeón de Documentos */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <details className="group">
                <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Documentos
                    </h3>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform"
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
                </summary>
                <div className="p-4 pt-0">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        Documentos
                      </h2>
                    </div>
                    {canEdit && (
                      <label className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors cursor-pointer">
                        <svg
                          className="w-4 h-4 inline mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                          />
                        </svg>
                        Subir Archivo
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleFileUpload}
                        />
                      </label>
                    )}
                  </div>

                  {/* Lista de archivos */}
                  <div className="space-y-2">
                    {documentos.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <svg
                          className="w-12 h-12 mx-auto mb-4 text-gray-300"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <p>No hay documentos subidos</p>
                        <p className="text-sm">
                          Sube archivos para organizarlos aquí
                        </p>
                      </div>
                    ) : (
                      documentos.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
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
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="font-medium text-gray-900 truncate"
                                title={doc.name}
                              >
                                {doc.name.length > 30
                                  ? `${doc.name.substring(0, 30)}...`
                                  : doc.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {doc.tamañoFormateado} •{' '}
                                {new Date(doc.uploadDate).toLocaleDateString(
                                  'es-ES'
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            <button
                              onClick={() => handleDownloadFile(doc.id)}
                              className="px-3 py-1 bg-green-100 text-green-700 rounded-md text-sm font-medium hover:bg-green-200 transition-colors"
                              title="Descargar"
                            >
                              Descargar
                            </button>
                            {canEdit && (
                              <button
                                onClick={() => handleDeleteFile(doc.id)}
                                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                title="Eliminar"
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
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </details>
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
                Editar Vehículo - {editingVehiculo.marca}{' '}
                {editingVehiculo.modelo}
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
                        matricula: formData.get('matricula')
                          ? (formData.get('matricula') as string).trim()
                          : undefined,
                        kms: formData.get('kms')
                          ? parseInt(formData.get('kms') as string)
                          : undefined,
                        color: formData.get('color')
                          ? (formData.get('color') as string).trim()
                          : undefined,
                        fechaMatriculacion: formData.get('fechaMatriculacion')
                          ? (formData.get('fechaMatriculacion') as string)
                          : undefined,
                        bastidor: formData.get('bastidor')
                          ? (formData.get('bastidor') as string).trim()
                          : undefined,
                        precioCompra: parseNumericField(
                          formData.get('precioCompra')
                        ),
                        gastosTransporte: parseNumericField(
                          formData.get('gastosTransporte')
                        ),
                        gastosTasas: parseNumericField(
                          formData.get('gastosTasas')
                        ),
                        gastosMecanica: parseNumericField(
                          formData.get('gastosMecanica')
                        ),
                        gastosPintura: parseNumericField(
                          formData.get('gastosPintura')
                        ),
                        gastosLimpieza: parseNumericField(
                          formData.get('gastosLimpieza')
                        ),
                        gastosOtros: parseNumericField(
                          formData.get('gastosOtros')
                        ),
                        gastosCNGarantia: parseNumericField(
                          formData.get('gastosCNGarantia')
                        ),
                        precioVenta: parseNumericField(
                          formData.get('precioVenta')
                        ),
                        garantiaPremium:
                          formData.get('garantiaPremium') === 'on',
                        notasInversor:
                          (formData.get('notasInversor') as string) ||
                          undefined,
                        fotoInversor: photoUrl,
                      }
                      handleSaveVehiculo(vehiculoData)
                    }
                    reader.readAsDataURL(fileInput)
                  } else {
                    // Si no hay archivo, usar la foto actual o undefined si se borró
                    const vehiculoData = {
                      matricula: formData.get('matricula')
                        ? (formData.get('matricula') as string).trim()
                        : undefined,
                      kms: formData.get('kms')
                        ? parseInt(formData.get('kms') as string)
                        : undefined,
                      color: formData.get('color')
                        ? (formData.get('color') as string).trim()
                        : undefined,
                      fechaMatriculacion: formData.get('fechaMatriculacion')
                        ? (formData.get('fechaMatriculacion') as string)
                        : undefined,
                      bastidor: formData.get('bastidor')
                        ? (formData.get('bastidor') as string).trim()
                        : undefined,
                      precioCompra: parseNumericField(
                        formData.get('precioCompra')
                      ),
                      gastosTransporte: parseNumericField(
                        formData.get('gastosTransporte')
                      ),
                      gastosTasas: parseNumericField(
                        formData.get('gastosTasas')
                      ),
                      gastosMecanica: parseNumericField(
                        formData.get('gastosMecanica')
                      ),
                      gastosPintura: parseNumericField(
                        formData.get('gastosPintura')
                      ),
                      gastosLimpieza: parseNumericField(
                        formData.get('gastosLimpieza')
                      ),
                      gastosOtros: parseNumericField(
                        formData.get('gastosOtros')
                      ),
                      gastosCNGarantia: parseNumericField(
                        formData.get('gastosCNGarantia')
                      ),
                      precioVenta: parseNumericField(
                        formData.get('precioVenta')
                      ),
                      garantiaPremium: formData.get('garantiaPremium') === 'on',
                      notasInversor:
                        (formData.get('notasInversor') as string) || undefined,
                      fotoInversor: fotoInversor,
                    }
                    handleSaveVehiculo(vehiculoData)
                  }
                }}
              >
                {/* Información Básica del Vehículo */}
                <div className="mb-6">
                  <h3 className="text-base font-medium text-gray-700 mb-3">
                    📋 Información Básica
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Matrícula
                      </label>
                      <input
                        type="text"
                        name="matricula"
                        defaultValue={editingVehiculo.matricula || ''}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Ej: 1234ABC"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        KMs
                      </label>
                      <input
                        type="number"
                        name="kms"
                        defaultValue={editingVehiculo.kms || ''}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Color
                      </label>
                      <input
                        type="text"
                        name="color"
                        defaultValue={(editingVehiculo as any).color || ''}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Ej: Blanco"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Fecha Matriculación
                      </label>
                      <input
                        type="date"
                        name="fechaMatriculacion"
                        defaultValue={
                          editingVehiculo.fechaMatriculacion
                            ? new Date(editingVehiculo.fechaMatriculacion)
                                .toISOString()
                                .split('T')[0]
                            : ''
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Bastidor
                      </label>
                      <input
                        type="text"
                        name="bastidor"
                        defaultValue={editingVehiculo.bastidor || ''}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Número de bastidor"
                      />
                    </div>
                  </div>
                </div>
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

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        🛡️ CN y Garantía (€)
                      </label>
                      <input
                        type="number"
                        name="gastosCNGarantia"
                        defaultValue={editingVehiculo.gastosCNGarantia || ''}
                        step="0.01"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Precio de Venta */}
                <div className="mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        🛡️ Extra GP 190€ (Garantía Premium)
                      </label>
                      <div className="flex items-center space-x-2 mt-2">
                        <input
                          type="checkbox"
                          name="garantiaPremium"
                          defaultChecked={
                            (editingVehiculo as any).garantiaPremium || false
                          }
                          className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                        />
                        <span className="text-sm text-gray-700">
                          Vendido con garantía premium (+190€ al beneficio)
                        </span>
                      </div>
                    </div>
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

        {/* Modal para asignar un activo existente */}
        {showAssignModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  Asignar activo a {inversorData?.nombre}
                </h2>
                <button
                  onClick={closeAssignModal}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="p-6 border-b border-gray-200">
                <input
                  type="text"
                  autoFocus
                  placeholder="Buscar por matrícula, marca, modelo o referencia..."
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {isLoadingAssign ? (
                  <p className="text-center text-gray-500 py-8">
                    Cargando vehículos...
                  </p>
                ) : assignVehiculosFiltrados.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No se encontraron vehículos disponibles
                  </p>
                ) : (
                  <div className="space-y-2">
                    {assignVehiculosFiltrados.map((vehiculo) => (
                      <div
                        key={vehiculo.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center flex-wrap gap-x-2">
                            <span className="font-semibold text-gray-900">
                              {vehiculo.matricula || 'Sin matrícula'}
                            </span>
                            <span className="text-gray-700">
                              {vehiculo.marca} {vehiculo.modelo}
                            </span>
                          </div>
                          <div className="flex items-center flex-wrap gap-x-2 text-xs text-gray-500 mt-1">
                            <span>Ref: {vehiculo.referencia || '-'}</span>
                            <span>•</span>
                            <span>Tipo: {tipoLabel(vehiculo.tipo)}</span>
                            <span>•</span>
                            {vehiculo.precioCompra && vehiculo.precioCompra > 0 ? (
                              <span>
                                Compra:{' '}
                                {vehiculo.precioCompra.toLocaleString('es-ES')} €
                              </span>
                            ) : (
                              <span className="text-amber-600 font-medium">
                                Sin precio de compra
                              </span>
                            )}
                            {vehiculo.inversorId &&
                              vehiculo.inversorId !== parseInt(inversorId) && (
                                <span className="text-amber-600 font-medium">
                                  Asignado a{' '}
                                  {vehiculo.inversorNombre || 'otro inversor'}
                                </span>
                              )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAssignVehiculo(vehiculo)}
                          disabled={assigningId === vehiculo.id}
                          className="ml-3 px-3 py-1.5 bg-primary-500 text-white rounded-md text-sm hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {assigningId === vehiculo.id ? 'Asignando...' : 'Asignar'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <ToastContainer />

        {/* Modal de confirmación de eliminación */}
        <ConfirmDeleteModal
          isOpen={showDeleteModal}
          onClose={cancelDeleteFile}
          onConfirm={confirmDeleteFile}
          title="Eliminar archivo"
          message="¿Estás seguro de que quieres eliminar este archivo? Esta acción no se puede deshacer."
          fileName={fileToDelete?.name}
          isLoading={isDeletingFile}
        />
      </div>
    </InversorProtectedRoute>
  )
}
