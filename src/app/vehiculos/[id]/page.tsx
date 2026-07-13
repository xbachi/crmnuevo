'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import { useConfirmModal } from '@/components/ConfirmModal'
import {
  formatCurrency,
  formatVehicleReference,
  formatDate,
  generateVehicleSlug,
  capitalizeText,
} from '@/lib/utils'
import NotasSection from '@/components/NotasSection'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  tipo: string
  estado: string
  orden: number
  color?: string
  fechaMatriculacion?: string
  año?: number
  combustible?: string
  cambio?: string
  potencia?: number
  cilindrada?: number
  puertas?: number
  plazas?: number
  categoria?: string

  // Campos financieros
  precioCompra?: number
  gastosTransporte?: number
  gastosTasas?: number
  gastosMecanica?: number
  gastosPintura?: number
  gastosLimpieza?: number
  gastosOtros?: number
  precioPublicacion?: number
  precioVenta?: number
  beneficioNeto?: number

  // Campos de inversor
  esCocheInversor?: boolean
  inversorId?: number
  inversorNombre?: string
  fechaCompra?: string
  notasInversor?: string
  fotoInversor?: string

  // Campos de documentación/estado
  itv?: string
  fechaItv?: string
  fechaVencimientoItv?: string
  seguro?: string
  segundaLlave?: string
  carpeta?: string
  master?: string
  hojasA?: string
  documentacion?: string
  ubicacion?: string

  createdAt: string
  updatedAt?: string
  // Información de venta
  venta?: {
    dealId: number
    dealNumero: string
    fechaVenta: string
    cliente: {
      id: number
      nombre: string
      apellidos: string
      email: string
      telefono: string
    }
  } | null
}

interface VehiculoNota {
  id: number
  vehiculoId: number
  contenido: string
  fecha: string
  usuario: string
  tipo: 'general' | 'tecnica' | 'comercial' | 'financiera'
  prioridad: 'baja' | 'media' | 'alta'
  completada: boolean
  createdAt: string
  updatedAt: string
}

interface VehiculoRecordatorio {
  id: number
  vehiculo_id: number
  titulo: string
  descripcion: string
  fecha_recordatorio: string
  tipo: string
  prioridad: string
  completado: boolean
  created_at: string
  updated_at: string
}

// Función para extraer el ID del slug (formato: id-marca-modelo)
const extractIdFromSlug = (slug: string): string | null => {
  console.log(`🔧 [EXTRACT] Extracting ID from slug: "${slug}"`)

  // Extraer el ID de la primera parte del slug
  const match = slug.match(/^(\d+)-/)
  if (match) {
    const id = match[1]
    console.log(`🔧 [EXTRACT] ID encontrado: "${id}"`)
    return id
  }

  console.log(`❌ [EXTRACT] No se pudo extraer ID del slug: "${slug}"`)
  return null
}

export default function VehiculoDetailPage() {
  const router = useRouter()
  const params = useParams()
  // Extraer ID del formato "id-marca-modelo"
  const vehiculoSlug = params.id as string
  const vehiculoId = extractIdFromSlug(vehiculoSlug)
  const { showToast, ToastContainer } = useToast()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()

  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null)
  const [recordatorios, setRecordatorios] = useState<VehiculoRecordatorio[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'general' | 'financiero'>(
    'general'
  )
  const { isAdmin } = useAuth()

  // Estados para notas
  const [notas, setNotas] = useState<
    Array<{
      id: number
      contenido: string
      usuario_nombre: string
      fecha_creacion: string
    }>
  >([])

  // Estados para checklist de compra
  const [estadoCompra, setEstadoCompra] = useState({
    pagado: false,
    transporteSolicitado: false,
    recibido: false,
  })
  const [isLoadingEstadoCompra, setIsLoadingEstadoCompra] = useState(false)

  // Estados para documentos
  const [documentos, setDocumentos] = useState<
    Array<{
      id: string
      name: string
      fileName?: string
      size: number
      type: string
      uploadDate: string
      path: string
      tamañoFormateado?: string
    }>
  >([])

  // Estados para edición
  const [isEditingGeneral, setIsEditingGeneral] = useState(false)
  const [isEditingDocumentacion, setIsEditingDocumentacion] = useState(false)
  const [isEditingFinanciero, setIsEditingFinanciero] = useState(false)
  const [editingData, setEditingData] = useState({
    tipo: '',
    marca: '',
    modelo: '',
    matricula: '',
    bastidor: '',
    kms: 0,
    color: '',
    fechaMatriculacion: '',
    fechaCompra: '',
    año: 0,
    itv: '' as string | null,
    seguro: '' as string | null,
    segundaLlave: '' as string | null,
    carpeta: '' as string | null,
    master: '' as string | null,
    hojasA: '' as string | null,
    documentacion: '' as string | null,
    precioCompra: 0,
    gastosTransporte: 0,
    gastosTasas: 0,
    gastosMecanica: 0,
    gastosPintura: 0,
    gastosLimpieza: 0,
    gastosOtros: 0,
    precioVenta: 0,
    inversorId: 0,
  })
  const [inversores, setInversores] = useState<
    Array<{ id: number; nombre: string }>
  >([])

  // Estados para nuevo recordatorio
  const [nuevoRecordatorio, setNuevoRecordatorio] = useState({
    titulo: '',
    descripcion: '',
    fechaRecordatorio: '',
    tipo: 'otro' as 'itv' | 'seguro' | 'revision' | 'documentacion' | 'otro',
    prioridad: 'media' as 'baja' | 'media' | 'alta',
  })

  // Estados para edición de recordatorios
  const [editingRecordatorioId, setEditingRecordatorioId] = useState<
    number | null
  >(null)
  const [editingRecordatorioData, setEditingRecordatorioData] = useState({
    titulo: '',
    descripcion: '',
    tipo: 'otro' as 'itv' | 'seguro' | 'revision' | 'documentacion' | 'otro',
    prioridad: 'media' as 'baja' | 'media' | 'alta',
    fechaRecordatorio: '',
  })
  const [showAddRecordatorioForm, setShowAddRecordatorioForm] = useState(false)

  // Cambio de matrícula (historial: la factura/carpeta viejas se quedan con la
  // anterior, el coche pasa a la nueva)
  const [matriculaAnterior, setMatriculaAnterior] = useState<string | null>(null)
  const [showMatriculaModal, setShowMatriculaModal] = useState(false)
  const [nuevaMatricula, setNuevaMatricula] = useState('')
  const [motivoMatricula, setMotivoMatricula] = useState('')
  const [guardandoMatricula, setGuardandoMatricula] = useState(false)
  const [errorMatricula, setErrorMatricula] = useState<string | null>(null)

  // Estados para el modal de contrato de Coches R
  const [showContratoModal, setShowContratoModal] = useState(false)
  const [selectedCliente, setSelectedCliente] = useState<any>(null)
  const [clienteSearchTerm, setClienteSearchTerm] = useState('')
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const [precioVenta, setPrecioVenta] = useState('')
  const [isGeneratingContrato, setIsGeneratingContrato] = useState(false)
  const [clientes, setClientes] = useState<any[]>([])

  // Helper function para mostrar valores de documentación legal
  const getDocumentacionValue = (value: string | null | undefined): string => {
    if (!value || value === '' || value === 'null' || value === 'undefined') {
      return 'Chequear'
    }
    return value
  }

  // Función para obtener datos del vehículo
  const fetchVehiculo = async () => {
    // console.log('🔍 [FETCH] ===== INICIANDO CARGA DE VEHÍCULO =====')
    try {
      console.log(`🔍 [FETCH] Slug completo: "${vehiculoSlug}"`)
      console.log(`🔢 [FETCH] ID extraído: "${vehiculoId}"`)

      if (!vehiculoId) {
        console.log(`❌ [FETCH] No se pudo extraer ID del slug`)
        setError('ID de vehículo inválido')
        setIsLoading(false)
        return null
      }

      setIsLoading(true)
      setError(null)
      const apiUrl = `/api/vehiculos/${vehiculoId}`
      console.log(`📞 [FETCH] Llamando API: ${apiUrl}`)

      const response = await fetch(apiUrl)
      console.log(`📡 [FETCH] Response status: ${response.status}`)
      console.log(
        `📡 [FETCH] Response headers:`,
        Object.fromEntries(response.headers.entries())
      )

      if (response.ok) {
        const data = await response.json()
        console.log(`✅ [FETCH] Datos recibidos del servidor:`, {
          id: data.id,
          referencia: data.referencia,
          marca: data.marca,
          modelo: data.modelo,
          estado: data.estado,
          matricula: data.matricula,
          bastidor: data.bastidor,
        })
        // console.log(`✅ [FETCH] Estado del vehículo:`, {
        //   estado: data.estado,
        //   tipo: typeof data.estado,
        //   esNull: data.estado === null,
        //   esUndefined: data.estado === undefined,
        // })
        // console.log(`✅ [FETCH] Datos completos del vehículo:`, data)

        // Actualizar estado del vehículo
        // console.log('🔄 [FETCH] Actualizando estado del vehículo...')
        // console.log('🔄 [FETCH] Datos recibidos del servidor:', {
        //   id: data.id,
        //   marca: data.marca,
        //   modelo: data.modelo,
        //   color: data.color,
        //   estado: data.estado,
        // })
        setVehiculo(data)
        setError(null)
        // console.log('✅ [FETCH] Estado del vehículo actualizado')
        // console.log('✅ [FETCH] Color actualizado a:', data.color)

        // Verificar si la URL es correcta y redirigir si es necesario
        const correctSlug = generateVehicleSlug(data)
        // console.log(`🔗 [FETCH] Slug correcto calculado: "${correctSlug}"`)
        // console.log(`🔗 [FETCH] Slug actual: "${vehiculoSlug}"`)

        if (vehiculoSlug !== correctSlug) {
          // console.log(
          //   `🔄 [FETCH] Redirigiendo a slug correcto: /vehiculos/${correctSlug}`
          // )
          router.replace(`/vehiculos/${correctSlug}`)
        } else {
          // console.log(
          //   `✅ [FETCH] URL es correcta, mostrando página del vehículo`
          // )
        }

        // console.log(
        //   '✅ [FETCH] ===== CARGA DE VEHÍCULO COMPLETADA EXITOSAMENTE ====='
        // )
        return data
      } else {
        const errorData = await response.json().catch(() => ({}))
        // console.error(`❌ [FETCH] Error al cargar el vehículo:`, {
        //   status: response.status,
        //   statusText: response.statusText,
        //   error: errorData,
        // })
        // console.log(`🔄 [FETCH] Redirigiendo a /vehiculos`)
        router.push('/vehiculos')
        setError('Error al cargar vehículo')
        return null
      }
    } catch (error) {
      console.error('❌ [FETCH] Error en fetchVehiculo:', error)
      console.error('❌ [FETCH] Tipo de error:', typeof error)
      console.error(
        '❌ [FETCH] Mensaje de error:',
        error instanceof Error ? error.message : 'Error desconocido'
      )
      setError('Error al cargar vehículo')
      return null
    } finally {
      console.log('🔧 [FETCH] Finalizando carga, desactivando loading...')
      setIsLoading(false)
      console.log('✅ [FETCH] Loading desactivado')
    }
  }

  // Función para obtener documentos
  const fetchDocumentos = async () => {
    try {
      console.log(
        `📁 [VEHICULO PAGE] Obteniendo documentos para vehículo ${vehiculoId}`
      )
      const response = await fetch(`/api/vehiculos/${vehiculoId}/files`)
      if (response.ok) {
        const data = await response.json()
        // Convertir tamaño de bytes a formato legible
        const documentosFormateados = data.map((doc: any) => ({
          ...doc,
          tamañoFormateado: formatFileSize(doc.size),
        }))
        setDocumentos(documentosFormateados)
        console.log(
          `✅ [VEHICULO PAGE] Archivos cargados:`,
          documentosFormateados.length
        )
      } else {
        console.error('Error al obtener documentos:', response.statusText)
      }
    } catch (error) {
      console.error('Error al obtener documentos:', error)
    }
  }

  // Función para obtener notas desde la API
  const fetchNotas = async () => {
    try {
      console.log(
        `📝 [VEHICULO PAGE] Obteniendo notas para vehículo ${vehiculoId}`
      )
      const response = await fetch(`/api/vehiculos/${vehiculoId}/notas`)
      if (response.ok) {
        const data = await response.json()
        setNotas(data)
        console.log(`✅ [VEHICULO PAGE] Notas cargadas:`, data.length)
      } else {
        console.error('Error al obtener notas:', response.statusText)
        setNotas([])
      }
    } catch (error) {
      console.error('Error al obtener notas:', error)
      setNotas([])
    }
  }

  // Función para obtener recordatorios desde la API
  const fetchRecordatorios = async () => {
    try {
      console.log(
        `📅 [VEHICULO PAGE] Obteniendo recordatorios para vehículo ${vehiculoId}`
      )
      const response = await fetch(`/api/vehiculos/${vehiculoId}/recordatorios`)
      if (response.ok) {
        const data = await response.json()
        setRecordatorios(data)
        console.log(`✅ [VEHICULO PAGE] Recordatorios cargados:`, data.length)
      } else {
        console.error('Error al obtener recordatorios:', response.statusText)
        setRecordatorios([])
      }
    } catch (error) {
      console.error('Error al obtener recordatorios:', error)
      setRecordatorios([])
    }
  }

  // Función para obtener estado de compra desde la API
  const fetchEstadoCompra = async () => {
    try {
      console.log(
        `💰 [VEHICULO PAGE] Obteniendo estado de compra para vehículo ${vehiculoId}`
      )
      const response = await fetch(`/api/vehiculos/${vehiculoId}/estado-compra`)
      if (response.ok) {
        const data = await response.json()
        setEstadoCompra(data)
        console.log(`✅ [VEHICULO PAGE] Estado de compra cargado:`, data)
      } else {
        console.error('Error al obtener estado de compra:', response.statusText)
        setEstadoCompra({
          pagado: false,
          transporteSolicitado: false,
          recibido: false,
        })
      }
    } catch (error) {
      console.error('Error al obtener estado de compra:', error)
      setEstadoCompra({
        pagado: false,
        transporteSolicitado: false,
        recibido: false,
      })
    }
  }

  // Función para guardar estado de compra
  const saveEstadoCompra = async (nuevoEstado: typeof estadoCompra) => {
    if (!vehiculoId) return

    setIsLoadingEstadoCompra(true)
    try {
      console.log(
        `💾 [VEHICULO PAGE] Guardando estado de compra para vehículo ${vehiculoId}`,
        nuevoEstado
      )
      const response = await fetch(
        `/api/vehiculos/${vehiculoId}/estado-compra`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nuevoEstado),
        }
      )

      if (response.ok) {
        const data = await response.json()
        setEstadoCompra(data)
        console.log(`✅ [VEHICULO PAGE] Estado de compra guardado:`, data)
        showToast('Estado de compra actualizado', 'success')
      } else {
        const errorData = await response.text()
        console.error('❌ [VEHICULO PAGE] Error al guardar estado de compra:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
        })
        showToast('Error al guardar estado de compra', 'error')
      }
    } catch (error) {
      console.error('Error al guardar estado de compra:', error)
      showToast('Error al guardar estado de compra', 'error')
    } finally {
      setIsLoadingEstadoCompra(false)
    }
  }

  const fetchMatriculaHistorial = async () => {
    try {
      const res = await fetch(`/api/vehiculos/${vehiculoId}/matricula`)
      if (!res.ok) return
      const data = await res.json()
      setMatriculaAnterior(data.anterior ?? null)
    } catch {
      // el historial es informativo: si falla, la ficha se muestra igual
    }
  }

  const guardarCambioMatricula = async () => {
    setErrorMatricula(null)
    setGuardandoMatricula(true)
    try {
      const res = await fetch(`/api/vehiculos/${vehiculoId}/matricula`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricula: nuevaMatricula,
          motivo: motivoMatricula || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMatricula(data.error || 'No se pudo cambiar la matrícula')
        return
      }
      setShowMatriculaModal(false)
      setNuevaMatricula('')
      setMotivoMatricula('')
      await fetchVehiculo()
      await fetchMatriculaHistorial()
    } catch (error) {
      setErrorMatricula(
        error instanceof Error ? error.message : 'Error desconocido'
      )
    } finally {
      setGuardandoMatricula(false)
    }
  }

  useEffect(() => {
    const fetchVehiculoEffect = async () => {
      await fetchVehiculo()
    }

    if (vehiculoId) {
      console.log(
        `🚀 [VEHICULO PAGE] Iniciando useEffect con ID: "${vehiculoId}"`
      )
      fetchVehiculo()
      fetchDocumentos()
      fetchNotas()
      fetchRecordatorios()
      fetchEstadoCompra()
      fetchMatriculaHistorial()
    } else {
      console.log(`⚠️ [VEHICULO PAGE] No hay ID para buscar`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculoId])

  // Cerrar dropdowns al hacer clic fuera (igual que en deals)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.dropdown-container')) {
        setShowClienteDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Funciones para manejar documentos
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files
    if (!files || files.length === 0 || !vehiculo?.id) return

    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('vehiculoId', vehiculo.id.toString())

      try {
        const response = await fetch('/api/vehiculos/upload-document', {
          method: 'POST',
          body: formData,
        })

        if (response.ok) {
          const responseData = await response.json()
          showToast('Archivo subido exitosamente', 'success')
          // Recargar archivos
          await fetchDocumentos()
        } else {
          showToast('Error al subir archivo', 'error')
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

  // Función para cambiar la condición del vehículo
  const cambiarCondicionVehiculo = async (nuevaCondicion: string) => {
    if (!vehiculo?.id) {
      showToast('Error: No se pudo identificar el vehículo', 'error')
      return
    }

    try {
      console.log(
        `🔄 [CONDICION] Cambiando condición del vehículo ${vehiculo.id} a ${nuevaCondicion}`
      )

      // Mapear condición a estado para simplificar
      let nuevoEstado = vehiculo.estado
      if (nuevaCondicion === 'disponible') {
        nuevoEstado = 'ACTIVO'
      } else if (nuevaCondicion === 'reservado') {
        nuevoEstado = 'RESERVADO'
      } else if (nuevaCondicion === 'vendido') {
        nuevoEstado = 'VENDIDO'
      }

      const response = await fetch(`/api/vehiculos/${vehiculo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          estado: nuevoEstado,
        }),
      })

      if (response.ok) {
        const vehiculoActualizado = await response.json()
        setVehiculo(vehiculoActualizado)
        showToast(`Condición cambiada a ${nuevaCondicion}`, 'success')
        console.log(
          `✅ [CONDICION] Condición actualizada exitosamente:`,
          nuevaCondicion
        )
      } else {
        const errorData = await response.json()
        console.error('❌ [CONDICION] Error actualizando condición:', errorData)
        showToast(
          `Error al cambiar condición: ${errorData.message || 'Error desconocido'}`,
          'error'
        )
      }
    } catch (error) {
      console.error('❌ [CONDICION] Error al cambiar condición:', error)
      showToast('Error al cambiar condición del vehículo', 'error')
    }
  }

  const handleDeleteFile = async (docId: string) => {
    try {
      console.log(
        `🗑️ [DELETE] Eliminando archivo ${docId} del vehículo ${vehiculo?.id}`
      )

      const response = await fetch(
        `/api/vehiculos/${vehiculo?.id}/files/${docId}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ [DELETE] Error eliminando archivo:', errorData)
        showToast(`Error eliminando archivo: ${errorData.error}`, 'error')
        return
      }

      const result = await response.json()
      console.log('✅ [DELETE] Archivo eliminado exitosamente:', result)

      // Actualizar lista de documentos
      await fetchDocumentos()
      showToast('Archivo eliminado correctamente', 'success')
    } catch (error) {
      console.error('❌ [DELETE] Error eliminando archivo:', error)
      showToast('Error eliminando archivo', 'error')
    }
  }

  const handleAnularContrato = async (docId: string) => {
    try {
      console.log(
        `🚫 [ANULAR] Anulando contrato ${docId} del vehículo ${vehiculo?.id}`
      )

      // Eliminar el archivo del contrato
      const response = await fetch(
        `/api/vehiculos/${vehiculo?.id}/files/${docId}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ [ANULAR] Error eliminando contrato:', errorData)
        showToast(`Error anulando contrato: ${errorData.error}`, 'error')
        return
      }

      const result = await response.json()
      console.log('✅ [ANULAR] Contrato anulado exitosamente:', result)

      // Actualizar lista de documentos
      await fetchDocumentos()

      // Cambiar estado del vehículo de vuelta a "en stock" o "disponible"
      try {
        const updateResponse = await fetch(`/api/vehiculos/${vehiculo?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'EN_STOCK' }), // Volver al estado anterior
        })

        if (updateResponse.ok) {
          // Recargar datos del vehículo para reflejar el cambio de estado
          await fetchVehiculo()
          showToast(
            'Contrato anulado y vehículo disponible nuevamente',
            'success'
          )
        } else {
          showToast(
            'Contrato anulado pero error al actualizar estado del vehículo',
            'info'
          )
        }
      } catch (updateError) {
        console.error('Error actualizando estado del vehículo:', updateError)
        showToast(
          'Contrato anulado pero error al actualizar estado del vehículo',
          'info'
        )
      }
    } catch (error) {
      console.error('❌ [ANULAR] Error anulando contrato:', error)
      showToast('Error anulando contrato', 'error')
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Funciones para edición
  const startEditingGeneral = () => {
    // console.log('🔧 [EDIT] ===== INICIANDO EDICIÓN GENERAL =====')
    // console.log('🔧 [EDIT] Vehículo actual:', vehiculo)
    // console.log('🔧 [EDIT] ID del vehículo:', vehiculo?.id)
    // console.log('🔧 [EDIT] Estado actual del vehículo:', vehiculo?.estado)

    if (vehiculo) {
      const newEditingData = {
        ...editingData,
        tipo: vehiculo.tipo || '',
        marca: vehiculo.marca || '',
        modelo: vehiculo.modelo || '',
        matricula: vehiculo.matricula || '',
        bastidor: vehiculo.bastidor || '',
        kms: vehiculo.kms || 0,
        color: vehiculo.color || '',
        fechaMatriculacion: vehiculo.fechaMatriculacion || '',
        fechaCompra: vehiculo.fechaCompra || '',
        año: vehiculo.año || 0,
        itv: vehiculo.itv || '',
        seguro: vehiculo.seguro || '',
        segundaLlave: vehiculo.segundaLlave || '',
        carpeta: vehiculo.carpeta || '',
        master: vehiculo.master || '',
        hojasA: vehiculo.hojasA || '',
        documentacion: vehiculo.documentacion || '',
        inversorId: vehiculo.inversorId || 0,
      }

      console.log('🔧 [EDIT] Datos de edición preparados:', newEditingData)
      console.log('🔧 [EDIT] Campos específicos:', {
        marca: newEditingData.marca,
        modelo: newEditingData.modelo,
        matricula: newEditingData.matricula,
        bastidor: newEditingData.bastidor,
        kms: newEditingData.kms,
        color: newEditingData.color,
        fechaMatriculacion: newEditingData.fechaMatriculacion,
      })

      // console.log('🔄 [EDIT] Actualizando estado de edición...')
      setEditingData(newEditingData)
      setIsEditingGeneral(true)
      // console.log('✅ [EDIT] Modo edición general activado')
      // console.log('✅ [EDIT] ===== EDICIÓN GENERAL INICIADA EXITOSAMENTE =====')
    } else {
      console.error('❌ [EDIT] No hay vehículo para editar')
      showToast('Error: No hay vehículo para editar', 'error')
    }
  }

  const startEditingDocumentacion = () => {
    if (vehiculo) {
      setEditingData((prev) => ({
        ...prev,
        itv: vehiculo.itv || '',
        seguro: vehiculo.seguro || '',
        segundaLlave: vehiculo.segundaLlave || '',
        carpeta: vehiculo.carpeta || '',
        master: vehiculo.master || '',
        hojasA: vehiculo.hojasA || '',
        documentacion: vehiculo.documentacion || '',
      }))
      setIsEditingDocumentacion(true)
    }
  }

  const startEditingFinanciero = () => {
    console.log('🔧 [EDIT] ===== INICIANDO EDICIÓN FINANCIERO =====')
    console.log('🔧 [EDIT] Vehículo actual:', vehiculo)
    console.log('🔧 [EDIT] ID del vehículo:', vehiculo?.id)

    if (vehiculo) {
      const newEditingData = {
        ...editingData,
        precioCompra: vehiculo.precioCompra || 0,
        gastosTransporte: vehiculo.gastosTransporte || 0,
        gastosTasas: vehiculo.gastosTasas || 0,
        gastosMecanica: vehiculo.gastosMecanica || 0,
        gastosPintura: vehiculo.gastosPintura || 0,
        gastosLimpieza: vehiculo.gastosLimpieza || 0,
        gastosOtros: vehiculo.gastosOtros || 0,
        precioVenta: vehiculo.precioVenta || 0,
      }

      console.log('🔧 [EDIT] Datos de edición financiero:', newEditingData)
      setEditingData(newEditingData)
      setIsEditingFinanciero(true)
      console.log('✅ [EDIT] Modo edición financiero activado')
    } else {
      console.error('❌ [EDIT] No hay vehículo para editar')
      showToast('Error: No hay vehículo para editar', 'error')
    }
  }

  const cancelEditing = () => {
    console.log('🔧 [EDIT] Cancelando edición')
    console.log('🔧 [EDIT] Datos actuales antes de cancelar:', editingData)
    setIsEditingGeneral(false)
    setIsEditingDocumentacion(false)
    setIsEditingFinanciero(false)
    console.log('🔧 [EDIT] Modo edición desactivado')
  }

  const saveEditing = async () => {
    // console.log('🔧 [SAVE] ===== INICIANDO GUARDADO =====')
    // console.log('🔧 [SAVE] ID del vehículo:', vehiculo?.id)
    // console.log('🔧 [SAVE] Datos a guardar:', editingData)
    // console.log('🔧 [SAVE] Campos específicos a guardar:', {
    //   marca: editingData.marca,
    //   modelo: editingData.modelo,
    //   color: editingData.color,
    //   kms: editingData.kms,
    //   fechaMatriculacion: editingData.fechaMatriculacion,
    //   itv: editingData.itv,
    //   seguro: editingData.seguro,
    //   segundaLlave: editingData.segundaLlave,
    //   documentacion: editingData.documentacion,
    // })
    // console.log('🔧 [SAVE] Modo edición general:', isEditingGeneral)
    // console.log('🔧 [SAVE] Modo edición documentación:', isEditingDocumentacion)
    // console.log('🔧 [SAVE] Modo edición financiero:', isEditingFinanciero)
    // console.log(
    //   '🔧 [SAVE] ¿Hay datos para guardar?',
    //   Object.keys(editingData).length > 0
    // )

    if (!vehiculo?.id) {
      console.error('❌ [SAVE] No hay ID de vehículo')
      showToast('Error: No hay ID de vehículo', 'error')
      return
    }

    // Filtrar solo los campos que están siendo editados
    const camposAGuardar: any = {}

    if (isEditingGeneral) {
      // Campos de información general
      if (editingData.tipo !== undefined) camposAGuardar.tipo = editingData.tipo
      if (editingData.marca !== undefined)
        camposAGuardar.marca = editingData.marca
      if (editingData.modelo !== undefined)
        camposAGuardar.modelo = editingData.modelo
      // matricula: NO se manda acá — va por POST /api/vehiculos/[id]/matricula
      // (deja historial; el PUT rechaza el cambio con 409).
      if (editingData.bastidor !== undefined)
        camposAGuardar.bastidor = editingData.bastidor
      if (editingData.kms !== undefined) camposAGuardar.kms = editingData.kms
      if (editingData.fechaMatriculacion !== undefined)
        camposAGuardar.fechaMatriculacion = editingData.fechaMatriculacion
      if (editingData.fechaCompra !== undefined)
        camposAGuardar.fechaCompra = editingData.fechaCompra
      if (editingData.color !== undefined)
        camposAGuardar.color = editingData.color
      // Guardar inversorId si está definido
      if (editingData.inversorId !== undefined) {
        camposAGuardar.inversorId = editingData.inversorId
      }
      // Si el tipo es "I" (Inversor) y hay inversorId, establecer esCocheInversor
      if (editingData.tipo === 'I' || camposAGuardar.tipo === 'I') {
        if (
          editingData.inversorId !== undefined &&
          editingData.inversorId > 0
        ) {
          camposAGuardar.esCocheInversor = true
        } else if (
          editingData.inversorId === 0 ||
          editingData.inversorId === null
        ) {
          // Si se quita el inversor, también quitar esCocheInversor
          camposAGuardar.esCocheInversor = false
        }
      } else if (editingData.tipo !== undefined && editingData.tipo !== 'I') {
        // Si el tipo cambia a algo que no sea Inversor, limpiar inversorId y esCocheInversor
        camposAGuardar.esCocheInversor = false
        if (editingData.inversorId === undefined && vehiculo.inversorId) {
          camposAGuardar.inversorId = null
        }
      }
    }

    if (isEditingDocumentacion) {
      // Campos de documentación legal
      if (editingData.itv !== undefined) camposAGuardar.itv = editingData.itv
      if (editingData.seguro !== undefined)
        camposAGuardar.seguro = editingData.seguro
      if (editingData.segundaLlave !== undefined)
        camposAGuardar.segundaLlave = editingData.segundaLlave
      if (editingData.documentacion !== undefined)
        camposAGuardar.documentacion = editingData.documentacion
      if (editingData.master !== undefined)
        camposAGuardar.master = editingData.master
      if (editingData.carpeta !== undefined)
        camposAGuardar.carpeta = editingData.carpeta
      if (editingData.hojasA !== undefined)
        camposAGuardar.hojasA = editingData.hojasA
    }

    if (isEditingFinanciero) {
      // Campos de información financiera
      if (editingData.precioCompra !== undefined)
        camposAGuardar.precioCompra = editingData.precioCompra
      if (editingData.gastosTransporte !== undefined)
        camposAGuardar.gastosTransporte = editingData.gastosTransporte
      if (editingData.gastosTasas !== undefined)
        camposAGuardar.gastosTasas = editingData.gastosTasas
      if (editingData.gastosMecanica !== undefined)
        camposAGuardar.gastosMecanica = editingData.gastosMecanica
      if (editingData.gastosPintura !== undefined)
        camposAGuardar.gastosPintura = editingData.gastosPintura
      if (editingData.gastosLimpieza !== undefined)
        camposAGuardar.gastosLimpieza = editingData.gastosLimpieza
      if (editingData.gastosOtros !== undefined)
        camposAGuardar.gastosOtros = editingData.gastosOtros
      if (editingData.precioVenta !== undefined)
        camposAGuardar.precioVenta = editingData.precioVenta
    }

    console.log('🔧 [SAVE] Campos filtrados para guardar:', camposAGuardar)
    console.log(
      '🔧 [SAVE] Número de campos a guardar:',
      Object.keys(camposAGuardar).length
    )

    if (Object.keys(camposAGuardar).length === 0) {
      console.warn('⚠️ [SAVE] No hay campos para guardar')
      showToast('No hay cambios para guardar', 'info')
      return
    }

    try {
      console.log(
        '🔧 [SAVE] Enviando petición PUT a /api/vehiculos/' + vehiculo.id
      )
      console.log('🔧 [SAVE] Datos que se envían al servidor:', camposAGuardar)
      const response = await fetch(`/api/vehiculos/${vehiculo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(camposAGuardar),
      })

      console.log('🔧 [SAVE] Respuesta del servidor:', response.status)
      console.log(
        '🔧 [SAVE] Headers de respuesta:',
        Object.fromEntries(response.headers.entries())
      )

      if (response.ok) {
        const responseData = await response.json()
        // console.log('✅ [SAVE] Respuesta exitosa del servidor:', responseData)
        // console.log('✅ [SAVE] Cambios guardados en base de datos')

        // Recargar datos del vehículo
        // console.log('🔄 [SAVE] Recargando datos del vehículo...')
        const vehiculoActualizado = await fetchVehiculo()

        if (vehiculoActualizado) {
          // console.log('✅ [SAVE] Datos del vehículo recargados exitosamente')
          // console.log(
          //   '✅ [SAVE] Nuevo estado del vehículo:',
          //   vehiculoActualizado.estado
          // )
          // console.log('✅ [SAVE] Nueva marca:', vehiculoActualizado.marca)
          // console.log('✅ [SAVE] Nuevo modelo:', vehiculoActualizado.modelo)
          // console.log('✅ [SAVE] Nuevo color:', vehiculoActualizado.color)
          // console.log('✅ [SAVE] Datos completos recargados:', {
          //   id: vehiculoActualizado.id,
          //   marca: vehiculoActualizado.marca,
          //   modelo: vehiculoActualizado.modelo,
          //   color: vehiculoActualizado.color,
          //   estado: vehiculoActualizado.estado,
          // })
        } else {
          // console.warn(
          //   '⚠️ [SAVE] No se pudieron recargar los datos del vehículo'
          // )
        }

        // Desactivar modo edición
        // console.log('🔧 [SAVE] Desactivando modo edición...')
        setIsEditingGeneral(false)
        setIsEditingDocumentacion(false)
        setIsEditingFinanciero(false)
        // console.log('✅ [SAVE] Modo edición desactivado')

        showToast('Cambios guardados exitosamente', 'success')
        // console.log('✅ [SAVE] ===== GUARDADO COMPLETADO EXITOSAMENTE =====')
      } else {
        const errorData = await response.json().catch(() => ({}))
        // console.error('❌ [SAVE] Error en respuesta del servidor:', {
        //   status: response.status,
        //   statusText: response.statusText,
        //   error: errorData,
        // })
        showToast(`Error al guardar cambios: ${response.status}`, 'error')
      }
    } catch (error) {
      // console.error('❌ [SAVE] Error al guardar:', error)
      // console.error('❌ [SAVE] Tipo de error:', typeof error)
      // console.error(
      //   '❌ [SAVE] Mensaje de error:',
      //   error instanceof Error ? error.message : 'Error desconocido'
      // )
      showToast('Error al guardar cambios', 'error')
    }
  }

  const handleAgregarRecordatorio = async () => {
    if (
      !nuevoRecordatorio.titulo.trim() ||
      !nuevoRecordatorio.fechaRecordatorio ||
      !vehiculo?.id
    )
      return

    try {
      console.log(
        `📅 [RECORDATORIO] Agregando recordatorio para vehículo ${vehiculo.id}:`,
        nuevoRecordatorio
      )

      // Mapear fechaRecordatorio a fecha_recordatorio para la API
      const recordatorioData = {
        titulo: nuevoRecordatorio.titulo,
        descripcion: nuevoRecordatorio.descripcion,
        tipo: nuevoRecordatorio.tipo,
        prioridad: nuevoRecordatorio.prioridad,
        fecha_recordatorio: nuevoRecordatorio.fechaRecordatorio,
      }

      const response = await fetch(
        `/api/vehiculos/${vehiculo.id}/recordatorios`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordatorioData),
        }
      )

      if (response.ok) {
        const nuevoRecordatorioData = await response.json()
        console.log(
          `✅ [RECORDATORIO] Recordatorio agregado exitosamente:`,
          nuevoRecordatorioData
        )

        setNuevoRecordatorio({
          titulo: '',
          descripcion: '',
          fechaRecordatorio: '',
          tipo: 'otro',
          prioridad: 'media',
        })

        // Ocultar el formulario
        setShowAddRecordatorioForm(false)

        // Recargar recordatorios
        await fetchRecordatorios()

        showToast('Recordatorio agregado correctamente', 'success')
      } else {
        const errorData = await response.json()
        console.error(
          '❌ [RECORDATORIO] Error al agregar el recordatorio:',
          errorData
        )
        showToast(
          `Error al agregar el recordatorio: ${errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error(
        '❌ [RECORDATORIO] Error al agregar el recordatorio:',
        error
      )
      showToast('Error al agregar el recordatorio', 'error')
    }
  }

  // Función para editar recordatorio
  const handleEditarRecordatorio = (recordatorio: VehiculoRecordatorio) => {
    setEditingRecordatorioId(recordatorio.id)
    setEditingRecordatorioData({
      titulo: recordatorio.titulo,
      descripcion: recordatorio.descripcion,
      tipo: recordatorio.tipo as
        | 'itv'
        | 'seguro'
        | 'revision'
        | 'documentacion'
        | 'otro',
      prioridad: recordatorio.prioridad as 'baja' | 'media' | 'alta',
      fechaRecordatorio: recordatorio.fecha_recordatorio.split('T')[0], // Solo la fecha
    })
  }

  // Función para guardar edición de recordatorio
  const handleGuardarEdicionRecordatorio = async () => {
    if (
      !editingRecordatorioData.titulo.trim() ||
      !editingRecordatorioData.fechaRecordatorio ||
      !vehiculo?.id ||
      !editingRecordatorioId
    )
      return

    try {
      console.log(
        `✏️ [RECORDATORIO] Actualizando recordatorio ${editingRecordatorioId} para vehículo ${vehiculo.id}`
      )

      const recordatorioData = {
        id: editingRecordatorioId,
        titulo: editingRecordatorioData.titulo,
        descripcion: editingRecordatorioData.descripcion,
        tipo: editingRecordatorioData.tipo,
        prioridad: editingRecordatorioData.prioridad,
        fecha_recordatorio: editingRecordatorioData.fechaRecordatorio,
      }

      const response = await fetch(
        `/api/vehiculos/${vehiculo.id}/recordatorios`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordatorioData),
        }
      )

      if (response.ok) {
        console.log(`✅ [RECORDATORIO] Recordatorio actualizado exitosamente`)

        await fetchRecordatorios()
        setEditingRecordatorioId(null)
        setEditingRecordatorioData({
          titulo: '',
          descripcion: '',
          tipo: 'otro',
          prioridad: 'media',
          fechaRecordatorio: '',
        })

        showToast('Recordatorio actualizado correctamente', 'success')
      } else {
        const errorData = await response.json()
        console.error(
          '❌ [RECORDATORIO] Error actualizando recordatorio:',
          errorData
        )
        showToast(
          `Error al actualizar el recordatorio: ${errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error('❌ [RECORDATORIO] Error actualizando recordatorio:', error)
      showToast('Error al actualizar el recordatorio', 'error')
    }
  }

  // Función para cancelar edición de recordatorio
  const handleCancelarEdicionRecordatorio = () => {
    setEditingRecordatorioId(null)
    setEditingRecordatorioData({
      titulo: '',
      descripcion: '',
      tipo: 'otro',
      prioridad: 'media',
      fechaRecordatorio: '',
    })
  }

  // Función para eliminar recordatorio
  const handleEliminarRecordatorio = async (recordatorioId: number) => {
    if (!vehiculo?.id) return

    try {
      console.log(
        `🗑️ [RECORDATORIO] Eliminando recordatorio ${recordatorioId} del vehículo ${vehiculo.id}`
      )

      const response = await fetch(
        `/api/vehiculos/${vehiculo.id}/recordatorios?recordatorioId=${recordatorioId}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        console.log(`✅ [RECORDATORIO] Recordatorio eliminado exitosamente`)

        await fetchRecordatorios()
        showToast('Recordatorio eliminado correctamente', 'success')
      } else {
        const errorData = await response.json()
        console.error(
          '❌ [RECORDATORIO] Error eliminando recordatorio:',
          errorData
        )
        showToast(
          `Error al eliminar el recordatorio: ${errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error('❌ [RECORDATORIO] Error eliminando recordatorio:', error)
      showToast('Error al eliminar el recordatorio', 'error')
    }
  }

  // Función para marcar recordatorio como completado
  const handleCompletarRecordatorio = async (
    recordatorio: VehiculoRecordatorio
  ) => {
    if (!vehiculo?.id) return

    try {
      console.log(
        `✅ [RECORDATORIO] Completando recordatorio ${recordatorio.id}`
      )

      const response = await fetch(
        `/api/vehiculos/${vehiculo.id}/recordatorios`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: recordatorio.id,
            completado: !recordatorio.completado,
          }),
        }
      )

      if (response.ok) {
        console.log(`✅ [RECORDATORIO] Recordatorio completado`)

        await fetchRecordatorios()
        showToast(
          `Recordatorio ${!recordatorio.completado ? 'completado' : 'pendiente'}`,
          'success'
        )
      } else {
        const errorData = await response.json()
        console.error(
          '❌ [RECORDATORIO] Error completando recordatorio:',
          errorData
        )
        showToast(
          `Error al completar el recordatorio: ${errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error('❌ [RECORDATORIO] Error completando recordatorio:', error)
      showToast('Error al completar el recordatorio', 'error')
    }
  }

  // Funciones para el modal de contrato de Coches R
  const fetchClientes = async (searchTerm: string) => {
    if (searchTerm.length < 2) return []

    try {
      const response = await fetch(
        `/api/clientes?search=${encodeURIComponent(searchTerm)}`
      )
      if (response.ok) {
        return await response.json()
      }
      return []
    } catch (error) {
      console.error('Error fetching clientes:', error)
      return []
    }
  }

  const handleClienteSearch = async (term: string) => {
    setClienteSearchTerm(term)
    if (term.length >= 2) {
      const clientesEncontrados = await fetchClientes(term)
      setClientes(clientesEncontrados)
      setShowClienteDropdown(clientesEncontrados.length > 0)
    } else {
      setClientes([])
      setShowClienteDropdown(false)
    }
  }

  const handleSelectCliente = (cliente: any) => {
    setSelectedCliente(cliente)
    setClienteSearchTerm(
      `${capitalizeText(cliente.nombre)} ${capitalizeText(cliente.apellidos)}`
    )
    setShowClienteDropdown(false)
  }

  // Filtrar clientes basado en el término de búsqueda (igual que en deals)
  const filteredClientes = clientes.filter((cliente) => {
    if (!clienteSearchTerm) return true
    const searchLower = clienteSearchTerm.toLowerCase()
    return (
      cliente.nombre.toLowerCase().includes(searchLower) ||
      cliente.apellidos.toLowerCase().includes(searchLower) ||
      cliente.telefono?.includes(searchLower) ||
      cliente.email?.toLowerCase().includes(searchLower) ||
      cliente.dni?.includes(searchLower)
    )
  })

  const handleGenerarContrato = async () => {
    if (!selectedCliente || !precioVenta) {
      showToast(
        'Por favor selecciona un cliente e ingresa el precio de venta',
        'error'
      )
      return
    }

    setIsGeneratingContrato(true)
    try {
      const response = await fetch('/api/coches-r/generar-contrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehiculoId: vehiculo?.id,
          clienteId: selectedCliente.id,
          precioVenta: parseFloat(precioVenta),
        }),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `contrato-coche-r-${vehiculo?.referencia}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)

        // Guardar el contrato como documento del vehículo
        const formData = new FormData()
        formData.append(
          'file',
          blob,
          `contrato-coche-r-${vehiculo?.referencia}.pdf`
        )
        formData.append('vehiculoId', vehiculo?.id.toString() || '')

        const saveResponse = await fetch('/api/vehiculos/upload-document', {
          method: 'POST',
          body: formData,
        })

        if (saveResponse.ok) {
          showToast('Contrato generado y guardado exitosamente', 'success')
          // Recargar documentos para mostrar el nuevo contrato
          await fetchDocumentos()
        } else {
          showToast('Contrato generado pero no se pudo guardar', 'info')
        }

        // Cambiar estado del vehículo a "vendido"
        try {
          const updateResponse = await fetch(`/api/vehiculos/${vehiculo?.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'vendido' }),
          })

          if (updateResponse.ok) {
            // Recargar datos del vehículo para reflejar el cambio de estado
            await fetchVehiculo()
            showToast('Vehículo marcado como vendido', 'success')
          }
        } catch (updateError) {
          console.error('Error actualizando estado del vehículo:', updateError)
        }

        setShowContratoModal(false)
        setSelectedCliente(null)
        setClienteSearchTerm('')
        setPrecioVenta('')
        setClientes([])
        setShowClienteDropdown(false)
      } else {
        showToast('Error al generar el contrato', 'error')
      }
    } catch (error) {
      console.error('Error generating contract:', error)
      showToast('Error al generar el contrato', 'error')
    } finally {
      setIsGeneratingContrato(false)
    }
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'C':
      case 'Compra':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'I':
      case 'Inversor':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'D':
      case 'Deposito Venta':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'R':
      case 'Coche R':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getEstadoColor = (estado: string) => {
    switch (estado.toLowerCase()) {
      case 'activo':
      case 'disponible':
        return 'bg-green-100 text-green-800'
      case 'reservado':
        return 'bg-yellow-100 text-yellow-800'
      case 'vendido':
        return 'bg-red-100 text-red-800'
      case 'facturado':
        return 'bg-indigo-100 text-indigo-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getDescripcionEstado = (estado: string) => {
    switch (estado.toLowerCase()) {
      case 'disponible':
        return 'Vehículo disponible para venta'
      case 'reservado':
        return 'Vehículo reservado por cliente'
      case 'vendido':
        return 'Vehículo vendido'
      case 'facturado':
        return 'Venta facturada'
      default:
        return 'Estado no definido'
    }
  }

  // Función para determinar la condición del vehículo basada en el estado
  const getCondicionVehiculo = () => {
    if (!vehiculo?.estado) return 'INICIAL'

    const estado = vehiculo.estado.toLowerCase()

    switch (estado) {
      case 'activo':
        return 'disponible'
      case 'reservado':
        return 'reservado'
      case 'vendido':
        return 'vendido'
      default:
        return 'disponible'
    }
  }

  // Función para obtener el color de la condición
  const getCondicionColor = (condicion: string) => {
    switch (condicion.toLowerCase()) {
      case 'disponible':
        return 'bg-green-100 text-green-800'
      case 'reservado':
        return 'bg-orange-100 text-orange-800'
      case 'vendido':
        return 'bg-red-100 text-red-800'
      case 'facturado':
        return 'bg-indigo-100 text-indigo-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getSubEstado = (estado: string) => {
    switch (estado.toLowerCase()) {
      case 'disponible':
        return [
          'Inicial',
          'Mecauto',
          'Pintura',
          'Limpieza',
          'Fotos',
          'Publicado',
        ]
      case 'reservado':
        return [
          'Reserva confirmada',
          'Pendiente de pago',
          'Documentación en trámite',
        ]
      case 'vendido':
        return ['Venta completada', 'Pendiente de entrega', 'Entregado']
      case 'facturado':
        return ['Factura emitida', 'Pago recibido', 'Proceso completado']
      default:
        return []
    }
  }

  const getPrioridadColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta':
        return 'bg-red-100 text-red-800'
      case 'media':
        return 'bg-yellow-100 text-yellow-800'
      case 'baja':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (isLoading) {
    console.log(`⏳ [VEHICULO PAGE] Mostrando pantalla de carga...`)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  if (!vehiculo) {
    // console.log(`⚠️ [VEHICULO PAGE] No hay datos de vehículo para mostrar`)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Vehículo no encontrado
          </h1>
          <Link
            href="/vehiculos"
            className="text-green-600 hover:text-green-800"
          >
            Volver a la lista de vehículos
          </Link>
        </div>
      </div>
    )
  }

  console.log(
    `🎯 [VEHICULO PAGE] Renderizando página del vehículo: ${capitalizeText(vehiculo.marca)} ${capitalizeText(vehiculo.modelo)} (${vehiculo.referencia})`
  )

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-slate-200">
          <div className="w-[85%] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4">
              <div className="flex items-center space-x-3 sm:space-x-4">
                <button
                  onClick={() => router.push('/vehiculos')}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                >
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5"
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
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                    {formatVehicleReference(vehiculo.referencia, vehiculo.tipo)}{' '}
                    - {capitalizeText(vehiculo.marca)}{' '}
                    {capitalizeText(vehiculo.modelo)}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 truncate">
                    {vehiculo.matricula} • {vehiculo.kms?.toLocaleString()} km •{' '}
                    {vehiculo.fechaMatriculacion
                      ? new Date(vehiculo.fechaMatriculacion).getFullYear()
                      : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 sm:space-x-3">
                <span
                  className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getEstadoColor(vehiculo.estado || 'inicial')}`}
                >
                  {(vehiculo.estado || 'inicial').toUpperCase()}
                </span>
                <span
                  className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium border ${getTipoColor(vehiculo.tipo)}`}
                >
                  {vehiculo.tipo === 'C'
                    ? 'COMPRA'
                    : vehiculo.tipo === 'I'
                      ? 'INVERSOR'
                      : vehiculo.tipo === 'D'
                        ? 'DEPÓSITO'
                        : vehiculo.tipo === 'R'
                          ? 'RENTING'
                          : vehiculo.tipo}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="w-[85%] mx-auto px-2 sm:px-4 lg:px-6 xl:px-8 py-2 sm:py-4 lg:py-6 xl:py-8">
          <div className="grid grid-cols-1 2xl:grid-cols-10 gap-2 sm:gap-4 lg:gap-6 xl:gap-8">
            {/* Panel Principal */}
            <div className="2xl:col-span-7 space-y-2 sm:space-y-4 lg:space-y-6">
              {/* Estado del Vehículo - Solo visible en pantallas < 1500px */}
              <div className="block 2xl:hidden bg-white rounded-xl shadow-sm border border-slate-200 p-2 sm:p-3 lg:p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-4 h-4 xl:w-6 xl:h-6 bg-indigo-500 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-2 h-2 xl:w-4 xl:h-4 text-white"
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
                  <h2 className="text-sm xl:text-base font-semibold text-gray-900">
                    Estado
                  </h2>
                </div>

                <div className="space-y-3">
                  {/* Una sola fila: Estado, Condición y Botones de "Marcar como" */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Estado Actual
                        </label>
                        <span
                          className={`px-2 py-1 rounded-lg text-xs font-medium ${getEstadoColor(vehiculo?.estado || 'inicial')}`}
                        >
                          {(vehiculo?.estado || 'inicial').toUpperCase()}
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Condición
                        </label>
                        <span
                          className={`px-2 py-1 rounded-lg text-xs font-medium ${getCondicionColor(getCondicionVehiculo())}`}
                        >
                          {getCondicionVehiculo().toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Botones "Marcar como" - Solo visibles en pantallas >= 500px */}
                    {isAdmin && vehiculo && (
                      <div className="hidden sm:flex sm:flex-row sm:space-x-2">
                        <p className="text-xs text-gray-600 font-medium mr-2">
                          Marcar como:
                        </p>
                        {getCondicionVehiculo() !== 'reservado' && (
                          <button
                            onClick={() =>
                              cambiarCondicionVehiculo('reservado')
                            }
                            className="px-2 py-1 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-xs font-medium flex items-center space-x-1"
                          >
                            <svg
                              className="w-2 h-2"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                              />
                            </svg>
                            <span>Reservado</span>
                          </button>
                        )}

                        {getCondicionVehiculo() !== 'vendido' && (
                          <button
                            onClick={() => cambiarCondicionVehiculo('vendido')}
                            className="px-2 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-xs font-medium flex items-center space-x-1"
                          >
                            <svg
                              className="w-2 h-2"
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
                            <span>Vendido</span>
                          </button>
                        )}

                        {getCondicionVehiculo() !== 'disponible' && (
                          <button
                            onClick={() =>
                              cambiarCondicionVehiculo('disponible')
                            }
                            className="px-2 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-xs font-medium flex items-center space-x-1"
                          >
                            <svg
                              className="w-2 h-2"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                            <span>Disponible</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Alerta de ITV vencida */}
                  {vehiculo?.itv === 'No' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-1.5 xl:p-2 lg:p-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 xl:w-4 xl:h-4 lg:w-6 lg:h-6 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-1.5 h-1.5 xl:w-2 xl:h-2 lg:w-3 lg:h-3 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                            />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs xl:text-sm font-medium text-red-800">
                            ITV Vencida
                          </p>
                          <p className="text-xs text-red-600">
                            Este vehículo necesita revisión de ITV
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tabs de Información */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                {/* Tab Headers */}
                <div className="border-b border-gray-200">
                  <nav className="flex space-x-4 sm:space-x-8 px-4 sm:px-6 overflow-x-auto">
                    <button
                      onClick={() => setActiveTab('general')}
                      className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
                        activeTab === 'general'
                          ? 'border-green-500 text-green-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Información General
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setActiveTab('financiero')}
                        className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
                          activeTab === 'financiero'
                            ? 'border-green-500 text-green-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Información Financiera
                      </button>
                    )}
                  </nav>
                </div>

                {/* Tab Content */}
                <div className="p-4 sm:p-6">
                  {/* Información General */}
                  {activeTab === 'general' && (
                    <div className="space-y-6">
                      {/* Botones de edición */}
                      <div className="flex justify-end space-x-3">
                        {!isEditingGeneral ? (
                          <button
                            onClick={startEditingGeneral}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
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
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"
                              />
                            </svg>
                            <span>Editar Información</span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={cancelEditing}
                              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center space-x-2"
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
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                              <span>Cancelar</span>
                            </button>
                            <button
                              onClick={saveEditing}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
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
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              <span>Guardar Cambios</span>
                            </button>
                          </>
                        )}
                      </div>

                      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-2 sm:gap-3 lg:gap-6">
                        {/* Tipo, Marca y Modelo */}
                        <div className="2xl:col-span-4 bg-blue-50 border border-blue-200 rounded-lg p-1.5 sm:p-2 lg:p-4">
                          <div className="flex items-center space-x-1 sm:space-x-2 mb-1 lg:mb-3">
                            <div className="w-4 h-4 sm:w-5 sm:h-5 lg:w-8 lg:h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                              <svg
                                className="w-2 h-2 sm:w-3 sm:h-3 lg:w-4 lg:h-4 text-white"
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
                            <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-orange-900 text-xs sm:text-sm lg:text-base font-semibold text-orange-900">
                              Identificación
                            </h3>
                          </div>
                          <div className="text-sm lg:text-base">
                            <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2">
                              <span className="text-blue-700 font-medium">
                                Tipo:{' '}
                                {isEditingGeneral ? (
                                  <select
                                    value={editingData.tipo}
                                    onChange={(e) =>
                                      setEditingData((prev) => ({
                                        ...prev,
                                        tipo: e.target.value,
                                      }))
                                    }
                                    className="ml-1 text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-sm font-medium"
                                  >
                                    <option value="C">COMPRA</option>
                                    <option value="I">INVERSOR</option>
                                    <option value="D">DEPÓSITO</option>
                                    <option value="R">RENTING</option>
                                  </select>
                                ) : (
                                  <span className="text-blue-900 font-semibold ml-1">
                                    {vehiculo.tipo === 'C'
                                      ? 'COMPRA'
                                      : vehiculo.tipo === 'I'
                                        ? 'INVERSOR'
                                        : vehiculo.tipo === 'D'
                                          ? 'DEPÓSITO'
                                          : vehiculo.tipo === 'R'
                                            ? 'RENTING'
                                            : vehiculo.tipo}
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2 mt-2">
                              <span className="text-blue-700 font-medium">
                                Marca:{' '}
                                {isEditingGeneral ? (
                                  <input
                                    type="text"
                                    value={editingData.marca}
                                    onChange={(e) =>
                                      setEditingData((prev) => ({
                                        ...prev,
                                        marca: e.target.value,
                                      }))
                                    }
                                    className="ml-1 text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-sm font-medium w-24"
                                  />
                                ) : (
                                  <span className="text-blue-900 font-semibold ml-1 capitalize">
                                    {vehiculo.marca}
                                  </span>
                                )}
                              </span>
                              <span className="text-blue-700 font-medium">
                                Modelo:{' '}
                                {isEditingGeneral ? (
                                  <input
                                    type="text"
                                    value={editingData.modelo}
                                    onChange={(e) =>
                                      setEditingData((prev) => ({
                                        ...prev,
                                        modelo: e.target.value,
                                      }))
                                    }
                                    className="ml-1 text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-sm font-medium w-24"
                                  />
                                ) : (
                                  <span className="text-blue-900 font-semibold ml-1 capitalize">
                                    {vehiculo.modelo}
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2 mt-2">
                              <span className="text-blue-700 font-medium">
                                Fecha de Compra:{' '}
                                {isEditingGeneral ? (
                                  <input
                                    type="date"
                                    value={editingData.fechaCompra || ''}
                                    onChange={(e) =>
                                      setEditingData((prev) => ({
                                        ...prev,
                                        fechaCompra: e.target.value,
                                      }))
                                    }
                                    className="ml-1 text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-sm font-medium"
                                  />
                                ) : (
                                  <span className="text-blue-900 font-semibold ml-1">
                                    {vehiculo.fechaCompra
                                      ? new Date(
                                          vehiculo.fechaCompra
                                        ).toLocaleDateString('es-ES')
                                      : 'No especificada'}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Matrícula y Bastidor */}
                        <div className="2xl:col-span-4 bg-green-50 border border-green-200 rounded-lg p-1.5 sm:p-2 lg:p-4">
                          <div className="flex items-center space-x-1 sm:space-x-2 mb-1 lg:mb-3">
                            <div className="w-4 h-4 sm:w-5 sm:h-5 lg:w-8 lg:h-8 bg-green-500 rounded-lg flex items-center justify-center">
                              <svg
                                className="w-2 h-2 sm:w-3 sm:h-3 lg:w-4 lg:h-4 text-white"
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
                            <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-orange-900 text-xs sm:text-sm lg:text-base font-semibold text-orange-900">
                              Documentación
                            </h3>
                          </div>
                          <div className="text-sm lg:text-base">
                            <div className="flex flex-col gap-2">
                              <span className="text-green-700 font-medium">
                                Matrícula:{' '}
                                <span className="text-green-900 font-mono font-semibold ml-1 uppercase">
                                  {vehiculo.matricula}
                                </span>
                                {matriculaAnterior && (
                                  <span className="ml-2 text-xs text-gray-500 font-mono">
                                    (antes: {matriculaAnterior})
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setErrorMatricula(null)
                                    setNuevaMatricula('')
                                    setMotivoMatricula('')
                                    setShowMatriculaModal(true)
                                  }}
                                  className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline"
                                >
                                  Cambiar
                                </button>
                              </span>
                              <span className="text-green-700 font-medium">
                                Bastidor:{' '}
                                {isEditingGeneral ? (
                                  <input
                                    type="text"
                                    value={editingData.bastidor}
                                    onChange={(e) =>
                                      setEditingData((prev) => ({
                                        ...prev,
                                        bastidor: e.target.value,
                                      }))
                                    }
                                    className="ml-1 text-green-900 bg-white border border-green-300 rounded px-2 py-1 text-sm font-medium font-mono w-32"
                                  />
                                ) : (
                                  <span className="text-green-900 font-mono font-bold text-sm lg:text-base break-all ml-1">
                                    {vehiculo.bastidor}
                                  </span>
                                )}
                              </span>
                              <span className="text-green-700 font-medium">
                                Fecha Matriculación:{' '}
                                {isEditingGeneral ? (
                                  <input
                                    type="date"
                                    value={editingData.fechaMatriculacion || ''}
                                    onChange={(e) =>
                                      setEditingData((prev) => ({
                                        ...prev,
                                        fechaMatriculacion: e.target.value,
                                      }))
                                    }
                                    className="ml-1 text-green-900 bg-white border border-green-300 rounded px-2 py-1 text-sm font-medium"
                                  />
                                ) : (
                                  <span className="text-green-900 font-semibold ml-1">
                                    {vehiculo.fechaMatriculacion
                                      ? new Date(
                                          vehiculo.fechaMatriculacion
                                        ).toLocaleDateString('es-ES')
                                      : 'No especificada'}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* KMs, Fecha y Color */}
                        <div className="2xl:col-span-4 bg-orange-50 border border-orange-200 rounded-lg p-1.5 sm:p-2 lg:p-4">
                          <div className="flex items-center space-x-1 sm:space-x-2 mb-1 lg:mb-3">
                            <div className="w-4 h-4 sm:w-5 sm:h-5 lg:w-8 lg:h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                              <svg
                                className="w-2 h-2 sm:w-3 sm:h-3 lg:w-4 lg:h-4 text-white"
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
                            </div>
                            <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-orange-900 text-xs sm:text-sm lg:text-base font-semibold text-orange-900">
                              Características
                            </h3>
                          </div>
                          <div className="text-sm lg:text-base">
                            <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2">
                              <span className="text-orange-700 font-medium">
                                KMs:{' '}
                                {isEditingGeneral ? (
                                  <input
                                    type="number"
                                    value={editingData.kms}
                                    onChange={(e) =>
                                      setEditingData((prev) => ({
                                        ...prev,
                                        kms: parseInt(e.target.value) || 0,
                                      }))
                                    }
                                    className="ml-1 text-orange-900 bg-white border border-orange-300 rounded px-2 py-1 text-sm font-medium w-24"
                                    placeholder="KMs"
                                  />
                                ) : (
                                  <span className="text-orange-900 font-semibold ml-1">
                                    {vehiculo.kms?.toLocaleString() || 'N/A'} km
                                  </span>
                                )}
                              </span>
                              <span className="text-orange-700 font-medium">
                                Color:{' '}
                                {isEditingGeneral ? (
                                  <input
                                    type="text"
                                    value={editingData.color}
                                    onChange={(e) =>
                                      setEditingData((prev) => ({
                                        ...prev,
                                        color: e.target.value,
                                      }))
                                    }
                                    className="ml-1 text-orange-900 bg-white border border-orange-300 rounded px-2 py-1 text-sm font-medium w-24"
                                    placeholder="Color"
                                  />
                                ) : (
                                  <span className="text-orange-900 font-medium ml-1 capitalize">
                                    {vehiculo.color || 'N/A'}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Información Financiera (Solo Admin) - Formato Mejorado */}
                  {activeTab === 'financiero' && isAdmin && (
                    <div className="space-y-6">
                      {/* Botones de edición */}
                      <div className="flex justify-end space-x-3">
                        {!isEditingFinanciero ? (
                          <button
                            onClick={startEditingFinanciero}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
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
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"
                              />
                            </svg>
                            <span>Editar Información Financiera</span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={cancelEditing}
                              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center space-x-2"
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
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                              <span>Cancelar</span>
                            </button>
                            <button
                              onClick={saveEditing}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
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
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              <span>Guardar Cambios</span>
                            </button>
                          </>
                        )}
                      </div>

                      {/* Resumen Financiero con Iconos y Colores */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                          <svg
                            className="w-3 h-3 sm:w-4 sm:h-4 lg:w-6 lg:h-6 mr-3 text-blue-600"
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
                          Resumen Financiero
                        </h3>

                        {(() => {
                          const totalInvertido =
                            (vehiculo.precioCompra || 0) +
                            (vehiculo.gastosTransporte || 0) +
                            (vehiculo.gastosTasas || 0) +
                            (vehiculo.gastosMecanica || 0) +
                            (vehiculo.gastosPintura || 0) +
                            (vehiculo.gastosLimpieza || 0) +
                            (vehiculo.gastosOtros || 0)
                          const precioVenta = vehiculo.precioVenta || 0
                          const iva =
                            precioVenta > 0
                              ? (precioVenta - totalInvertido) * 0.21
                              : 0
                          const beneficio = precioVenta - iva - totalInvertido

                          return (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                              {/* Total Invertido */}
                              <div className="bg-white rounded-lg p-1.5 sm:p-2 lg:p-3 border border-gray-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center">
                                    <svg
                                      className="w-4 h-4 text-red-500 mr-2"
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
                                    <span className="text-sm font-medium text-gray-600">
                                      Total Invertido:
                                    </span>
                                  </div>
                                  <span className="text-lg font-bold text-gray-900">
                                    {formatCurrency(totalInvertido)}
                                  </span>
                                </div>
                              </div>

                              {/* Precio de Venta */}
                              <div className="bg-white rounded-lg p-1.5 sm:p-2 lg:p-3 border border-gray-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center">
                                    <svg
                                      className="w-4 h-4 text-green-500 mr-2"
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
                                    <span className="text-sm font-medium text-gray-600">
                                      Precio de Venta:
                                    </span>
                                  </div>
                                  <span className="text-lg font-bold text-gray-900">
                                    {formatCurrency(precioVenta)}
                                  </span>
                                </div>
                              </div>

                              {/* IVA */}
                              <div className="bg-white rounded-lg p-1.5 sm:p-2 lg:p-3 border border-gray-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center">
                                    <svg
                                      className="w-4 h-4 text-yellow-500 mr-2"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                      />
                                    </svg>
                                    <span className="text-sm font-medium text-gray-600">
                                      IVA (21%):
                                    </span>
                                  </div>
                                  <span className="text-lg font-bold text-gray-900">
                                    {formatCurrency(iva)}
                                  </span>
                                </div>
                              </div>

                              {/* Beneficio Neto */}
                              <div className="bg-white rounded-lg p-1.5 sm:p-2 lg:p-3 border border-gray-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center">
                                    <svg
                                      className="w-4 h-4 text-blue-500 mr-2"
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
                                    <span className="text-sm font-medium text-gray-600">
                                      Beneficio Neto:
                                    </span>
                                  </div>
                                  <span
                                    className={`text-lg font-bold ${beneficio >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                  >
                                    {formatCurrency(beneficio)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </div>

                      {/* Desglose Detallado */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Costos de Adquisición */}
                        <div className="bg-gray-50 rounded-lg p-6">
                          <h4 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <svg
                              className="w-5 h-5 mr-2 text-red-500"
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
                            Costos de Adquisición
                          </h4>

                          <div className="space-y-3">
                            <div className="flex justify-between items-center py-2 border-b border-gray-200">
                              <span className="text-sm text-gray-600">
                                Precio de Compra
                              </span>
                              {isEditingFinanciero ? (
                                <input
                                  type="text"
                                  value={
                                    editingData.precioCompra === 0
                                      ? ''
                                      : editingData.precioCompra
                                  }
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      precioCompra:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder=""
                                />
                              ) : (
                                <span className="font-semibold">
                                  {formatCurrency(vehiculo.precioCompra || 0)}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-200">
                              <span className="text-sm text-gray-600">
                                Transporte
                              </span>
                              {isEditingFinanciero ? (
                                <input
                                  type="text"
                                  value={
                                    editingData.gastosTransporte === 0
                                      ? ''
                                      : editingData.gastosTransporte
                                  }
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosTransporte:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder=""
                                />
                              ) : (
                                <span className="font-semibold">
                                  {formatCurrency(
                                    vehiculo.gastosTransporte || 0
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-200">
                              <span className="text-sm text-gray-600">
                                Tasas
                              </span>
                              {isEditingFinanciero ? (
                                <input
                                  type="text"
                                  value={
                                    editingData.gastosTasas === 0
                                      ? ''
                                      : editingData.gastosTasas
                                  }
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosTasas:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder=""
                                />
                              ) : (
                                <span className="font-semibold">
                                  {formatCurrency(vehiculo.gastosTasas || 0)}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-200">
                              <span className="text-sm text-gray-600">
                                Mecánica
                              </span>
                              {isEditingFinanciero ? (
                                <input
                                  type="text"
                                  value={
                                    editingData.gastosMecanica === 0
                                      ? ''
                                      : editingData.gastosMecanica
                                  }
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosMecanica:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder=""
                                />
                              ) : (
                                <span className="font-semibold">
                                  {formatCurrency(vehiculo.gastosMecanica || 0)}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-200">
                              <span className="text-sm text-gray-600">
                                Pintura
                              </span>
                              {isEditingFinanciero ? (
                                <input
                                  type="text"
                                  value={
                                    editingData.gastosPintura === 0
                                      ? ''
                                      : editingData.gastosPintura
                                  }
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosPintura:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder=""
                                />
                              ) : (
                                <span className="font-semibold">
                                  {formatCurrency(vehiculo.gastosPintura || 0)}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-200">
                              <span className="text-sm text-gray-600">
                                Limpieza
                              </span>
                              {isEditingFinanciero ? (
                                <input
                                  type="text"
                                  value={
                                    editingData.gastosLimpieza === 0
                                      ? ''
                                      : editingData.gastosLimpieza
                                  }
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosLimpieza:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder=""
                                />
                              ) : (
                                <span className="font-semibold">
                                  {formatCurrency(vehiculo.gastosLimpieza || 0)}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-200">
                              <span className="text-sm text-gray-600">
                                Otros
                              </span>
                              {isEditingFinanciero ? (
                                <input
                                  type="text"
                                  value={
                                    editingData.gastosOtros === 0
                                      ? ''
                                      : editingData.gastosOtros
                                  }
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosOtros:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder=""
                                />
                              ) : (
                                <span className="font-semibold">
                                  {formatCurrency(vehiculo.gastosOtros || 0)}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center py-3 bg-white rounded-lg px-3 mt-4">
                              <span className="text-lg font-bold text-gray-900">
                                Total Invertido
                              </span>
                              <span className="text-lg font-bold text-red-600">
                                {formatCurrency(
                                  (vehiculo.precioCompra || 0) +
                                    (vehiculo.gastosTransporte || 0) +
                                    (vehiculo.gastosTasas || 0) +
                                    (vehiculo.gastosMecanica || 0) +
                                    (vehiculo.gastosPintura || 0) +
                                    (vehiculo.gastosLimpieza || 0) +
                                    (vehiculo.gastosOtros || 0)
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Información de Venta */}
                        <div className="bg-gray-50 rounded-lg p-6">
                          <h4 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <svg
                              className="w-5 h-5 mr-2 text-green-500"
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
                            Información de Venta
                          </h4>

                          <div className="space-y-3">
                            <div className="flex justify-between items-center py-2 border-b border-gray-200">
                              <span className="text-sm text-gray-600">
                                Precio de Venta
                              </span>
                              {isEditingFinanciero ? (
                                <input
                                  type="text"
                                  value={
                                    editingData.precioVenta === 0
                                      ? ''
                                      : editingData.precioVenta
                                  }
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      precioVenta:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-32 text-right font-semibold text-lg border border-gray-300 rounded px-2 py-1"
                                  placeholder=""
                                />
                              ) : (
                                <span className="font-semibold text-lg">
                                  {formatCurrency(vehiculo.precioVenta || 0)}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-200">
                              <span className="text-sm text-gray-600">
                                IVA (21%)
                              </span>
                              <span className="font-semibold text-lg">
                                {formatCurrency(
                                  (vehiculo.precioVenta || 0) > 0
                                    ? ((vehiculo.precioVenta || 0) -
                                        ((vehiculo.precioCompra || 0) +
                                          (vehiculo.gastosTransporte || 0) +
                                          (vehiculo.gastosTasas || 0) +
                                          (vehiculo.gastosMecanica || 0) +
                                          (vehiculo.gastosPintura || 0) +
                                          (vehiculo.gastosLimpieza || 0) +
                                          (vehiculo.gastosOtros || 0))) *
                                        0.21
                                    : 0
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between items-center py-3 bg-white rounded-lg px-3 mt-4">
                              <span className="text-lg font-bold text-gray-900">
                                Beneficio Neto
                              </span>
                              <span
                                className={`text-lg font-bold ${(() => {
                                  const totalInvertido =
                                    (vehiculo.precioCompra || 0) +
                                    (vehiculo.gastosTransporte || 0) +
                                    (vehiculo.gastosTasas || 0) +
                                    (vehiculo.gastosMecanica || 0) +
                                    (vehiculo.gastosPintura || 0) +
                                    (vehiculo.gastosLimpieza || 0) +
                                    (vehiculo.gastosOtros || 0)
                                  const precioVenta = vehiculo.precioVenta || 0
                                  const iva =
                                    precioVenta > 0
                                      ? (precioVenta - totalInvertido) * 0.21
                                      : 0
                                  const beneficio =
                                    precioVenta - iva - totalInvertido
                                  return beneficio >= 0
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                })()}`}
                              >
                                {(() => {
                                  const totalInvertido =
                                    (vehiculo.precioCompra || 0) +
                                    (vehiculo.gastosTransporte || 0) +
                                    (vehiculo.gastosTasas || 0) +
                                    (vehiculo.gastosMecanica || 0) +
                                    (vehiculo.gastosPintura || 0) +
                                    (vehiculo.gastosLimpieza || 0) +
                                    (vehiculo.gastosOtros || 0)
                                  const precioVenta = vehiculo.precioVenta || 0
                                  const iva =
                                    precioVenta > 0
                                      ? (precioVenta - totalInvertido) * 0.21
                                      : 0
                                  const beneficio =
                                    precioVenta - iva - totalInvertido
                                  return formatCurrency(beneficio)
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Documentación del Vehículo */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
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
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                      Documentación Legal
                    </h2>
                  </div>
                  {!isEditingDocumentacion ? (
                    <button
                      onClick={startEditingDocumentacion}
                      className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center space-x-1"
                    >
                      <svg
                        className="w-2 h-2 xl:w-3 xl:h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"
                        />
                      </svg>
                      <span>Editar</span>
                    </button>
                  ) : (
                    <div className="flex space-x-2">
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm flex items-center space-x-1"
                      >
                        <svg
                          className="w-2 h-2 xl:w-3 xl:h-3"
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
                        <span>Cancelar</span>
                      </button>
                      <button
                        onClick={saveEditing}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center space-x-1"
                      >
                        <svg
                          className="w-2 h-2 xl:w-3 xl:h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span>Guardar</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-6">
                  {/* ITV */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-1.5 sm:p-2 lg:p-4">
                    <div className="flex items-center space-x-1 sm:space-x-2 mb-1 lg:mb-3">
                      <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-6 lg:h-6 bg-red-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-1.5 h-1.5 sm:w-2 sm:h-2 lg:w-3 lg:h-3 text-white"
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
                      </div>
                      <h3 className="font-semibold text-red-900 text-xs sm:text-sm lg:text-base font-semibold text-orange-900">
                        ITV
                      </h3>
                    </div>
                    <div className="text-xs lg:text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-red-700 font-medium">
                          Estado:{' '}
                          {isEditingDocumentacion ? (
                            <select
                              value={
                                editingData.itv === null ||
                                editingData.itv === undefined ||
                                editingData.itv === ''
                                  ? 'chequear'
                                  : editingData.itv === 'Sí' ||
                                      editingData.itv === 'si'
                                    ? 'si'
                                    : 'no'
                              }
                              onChange={(e) => {
                                if (e.target.value === 'chequear') {
                                  setEditingData((prev) => ({
                                    ...prev,
                                    itv: null,
                                  }))
                                } else {
                                  setEditingData((prev) => ({
                                    ...prev,
                                    itv: e.target.value === 'si' ? 'Sí' : 'No',
                                  }))
                                }
                              }}
                              className="ml-1 text-red-900 bg-white border border-red-300 rounded px-2 py-1 text-sm font-medium w-24"
                            >
                              <option value="chequear">Chequear</option>
                              <option value="si">Sí</option>
                              <option value="no">No</option>
                            </select>
                          ) : (
                            <span
                              className={`ml-1 px-1 py-0.5 rounded-full text-xs font-medium ${
                                vehiculo.itv === 'Sí' || vehiculo.itv === 'si'
                                  ? 'bg-green-100 text-green-800'
                                  : vehiculo.itv === 'No' ||
                                      vehiculo.itv === 'no'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {vehiculo.itv || 'Chequear'}
                            </span>
                          )}
                        </span>
                        {vehiculo.fechaVencimientoItv && (
                          <span className="text-red-700 font-medium">
                            Vencimiento:{' '}
                            <span className="text-red-900 font-medium ml-1">
                              {formatDate(vehiculo.fechaVencimientoItv)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Seguro */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-1.5 sm:p-2 lg:p-4">
                    <div className="flex items-center space-x-1 sm:space-x-2 mb-1 lg:mb-3">
                      <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-6 lg:h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-1.5 h-1.5 sm:w-2 sm:h-2 lg:w-3 lg:h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-orange-900 text-xs sm:text-sm lg:text-base font-semibold text-orange-900">
                        Seguro
                      </h3>
                    </div>
                    <div className="text-xs lg:text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-700 font-medium">
                          Estado:{' '}
                          {isEditingDocumentacion ? (
                            <select
                              value={
                                editingData.seguro === 'Sí' ||
                                editingData.seguro === 'si'
                                  ? 'si'
                                  : editingData.seguro === 'No' ||
                                      editingData.seguro === 'no'
                                    ? 'no'
                                    : 'chequear'
                              }
                              onChange={(e) => {
                                if (e.target.value === 'chequear') {
                                  setEditingData((prev) => ({
                                    ...prev,
                                    seguro: null,
                                  }))
                                } else {
                                  setEditingData((prev) => ({
                                    ...prev,
                                    seguro:
                                      e.target.value === 'si' ? 'Sí' : 'No',
                                  }))
                                }
                              }}
                              className="ml-1 text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-sm font-medium w-24"
                            >
                              <option value="chequear">Chequear</option>
                              <option value="no">No</option>
                              <option value="si">Sí</option>
                            </select>
                          ) : (
                            <span
                              className={`ml-1 px-1 py-0.5 rounded-full text-xs font-medium ${
                                vehiculo.seguro === 'Sí' ||
                                vehiculo.seguro === 'si'
                                  ? 'bg-green-100 text-green-800'
                                  : vehiculo.seguro === 'No' ||
                                      vehiculo.seguro === 'no'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {getDocumentacionValue(vehiculo.seguro)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Segunda Llave */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-1.5 sm:p-2 lg:p-4">
                    <div className="flex items-center space-x-1 sm:space-x-2 mb-1 lg:mb-3">
                      <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-6 lg:h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-1.5 h-1.5 sm:w-2 sm:h-2 lg:w-3 lg:h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-orange-900 font-semibold text-yellow-900">
                        2ª Llave
                      </h3>
                    </div>
                    <div className="text-xs lg:text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-700 font-medium">
                          Disponible:{' '}
                          {isEditingDocumentacion ? (
                            <select
                              value={
                                editingData.segundaLlave === 'Sí' ||
                                editingData.segundaLlave === 'si'
                                  ? 'si'
                                  : editingData.segundaLlave === 'No' ||
                                      editingData.segundaLlave === 'no'
                                    ? 'no'
                                    : 'chequear'
                              }
                              onChange={(e) => {
                                if (e.target.value === 'chequear') {
                                  setEditingData((prev) => ({
                                    ...prev,
                                    segundaLlave: null,
                                  }))
                                } else {
                                  setEditingData((prev) => ({
                                    ...prev,
                                    segundaLlave:
                                      e.target.value === 'si' ? 'Sí' : 'No',
                                  }))
                                }
                              }}
                              className="ml-1 text-yellow-900 bg-white border border-yellow-300 rounded px-2 py-1 text-sm font-medium w-24"
                            >
                              <option value="chequear">Chequear</option>
                              <option value="no">No</option>
                              <option value="si">Sí</option>
                            </select>
                          ) : (
                            <span
                              className={`ml-1 px-1 py-0.5 rounded-full text-xs font-medium ${
                                vehiculo.segundaLlave === 'si' ||
                                vehiculo.segundaLlave === 'Sí'
                                  ? 'bg-green-100 text-green-800'
                                  : vehiculo.segundaLlave === 'no' ||
                                      vehiculo.segundaLlave === 'No'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {getDocumentacionValue(vehiculo.segundaLlave)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Documentación */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-1.5 sm:p-2 lg:p-4">
                    <div className="flex items-center space-x-1 sm:space-x-2 mb-1 lg:mb-3">
                      <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-6 lg:h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-1.5 h-1.5 sm:w-2 sm:h-2 lg:w-3 lg:h-3 text-white"
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
                      <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-orange-900 font-semibold text-green-900">
                        Documentación
                      </h3>
                    </div>
                    <div className="text-xs lg:text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-green-700 font-medium">
                          Estado:{' '}
                          {isEditingDocumentacion ? (
                            <select
                              value={
                                editingData.documentacion === 'Sí' ||
                                editingData.documentacion === 'si'
                                  ? 'si'
                                  : editingData.documentacion === 'No' ||
                                      editingData.documentacion === 'no'
                                    ? 'no'
                                    : 'chequear'
                              }
                              onChange={(e) => {
                                if (e.target.value === 'chequear') {
                                  setEditingData((prev) => ({
                                    ...prev,
                                    documentacion: null,
                                  }))
                                } else {
                                  setEditingData((prev) => ({
                                    ...prev,
                                    documentacion:
                                      e.target.value === 'si' ? 'Sí' : 'No',
                                  }))
                                }
                              }}
                              className="ml-1 text-green-900 bg-white border border-green-300 rounded px-2 py-1 text-sm font-medium w-24"
                            >
                              <option value="chequear">Chequear</option>
                              <option value="no">No</option>
                              <option value="si">Sí</option>
                            </select>
                          ) : (
                            <span
                              className={`ml-1 px-1 py-0.5 rounded-full text-xs font-medium ${
                                vehiculo.documentacion === 'Sí' ||
                                vehiculo.documentacion === 'si'
                                  ? 'bg-green-100 text-green-800'
                                  : vehiculo.documentacion === 'No' ||
                                      vehiculo.documentacion === 'no'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {getDocumentacionValue(vehiculo.documentacion)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Master */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-1.5 sm:p-2 lg:p-4">
                    <div className="flex items-center space-x-1 sm:space-x-2 mb-1 lg:mb-3">
                      <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-6 lg:h-6 bg-indigo-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-1.5 h-1.5 sm:w-2 sm:h-2 lg:w-3 lg:h-3 text-white"
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
                      <h3 className="text-xs sm:text-sm lg:text-base font-semibold text-orange-900">
                        Master
                      </h3>
                    </div>
                    <div className="text-xs lg:text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-700 font-medium">
                          Estado:{' '}
                          {isEditingDocumentacion ? (
                            <select
                              value={
                                editingData.master === 'Sí' ||
                                editingData.master === 'si'
                                  ? 'si'
                                  : editingData.master === 'No' ||
                                      editingData.master === 'no'
                                    ? 'no'
                                    : 'chequear'
                              }
                              onChange={(e) => {
                                if (e.target.value === 'chequear') {
                                  setEditingData((prev) => ({
                                    ...prev,
                                    master: null,
                                  }))
                                } else {
                                  setEditingData((prev) => ({
                                    ...prev,
                                    master:
                                      e.target.value === 'si' ? 'Sí' : 'No',
                                  }))
                                }
                              }}
                              className="ml-1 text-indigo-900 bg-white border border-indigo-300 rounded px-2 py-1 text-sm font-medium w-24"
                            >
                              <option value="chequear">Chequear</option>
                              <option value="no">No</option>
                              <option value="si">Sí</option>
                            </select>
                          ) : (
                            <span
                              className={`ml-1 px-1 py-0.5 rounded-full text-xs font-medium ${
                                vehiculo.master === 'Sí' ||
                                vehiculo.master === 'si'
                                  ? 'bg-green-100 text-green-800'
                                  : vehiculo.master === 'No' ||
                                      vehiculo.master === 'no'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {getDocumentacionValue(vehiculo.master)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Carpeta */}
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-1.5 sm:p-2 lg:p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-6 lg:h-6 bg-orange-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-1.5 h-1.5 sm:w-2 sm:h-2 lg:w-3 lg:h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                          />
                        </svg>
                      </div>
                      <span className="text-xs lg:text-sm font-medium text-orange-700">
                        Estado:
                      </span>
                      {isEditingDocumentacion ? (
                        <select
                          value={
                            editingData.carpeta === 'Sí' ||
                            editingData.carpeta === 'si'
                              ? 'si'
                              : editingData.carpeta === 'No' ||
                                  editingData.carpeta === 'no'
                                ? 'no'
                                : 'chequear'
                          }
                          onChange={(e) => {
                            if (e.target.value === 'chequear') {
                              setEditingData((prev) => ({
                                ...prev,
                                carpeta: null,
                              }))
                            } else {
                              setEditingData((prev) => ({
                                ...prev,
                                carpeta: e.target.value === 'si' ? 'Sí' : 'No',
                              }))
                            }
                          }}
                          className="w-24 text-orange-900 bg-white border border-orange-300 rounded px-2 py-1 text-sm font-medium"
                        >
                          <option value="chequear">Chequear</option>
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span
                          className={`px-1 py-0.5 rounded-full text-xs font-medium ${
                            vehiculo.carpeta === 'Sí' ||
                            vehiculo.carpeta === 'si'
                              ? 'bg-green-100 text-green-800'
                              : vehiculo.carpeta === 'No' ||
                                  vehiculo.carpeta === 'no'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {getDocumentacionValue(vehiculo.carpeta)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Hojas A */}
                  <div className="bg-pink-50 border border-pink-200 rounded-lg p-1.5 sm:p-2 lg:p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-6 lg:h-6 bg-pink-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-1.5 h-1.5 sm:w-2 sm:h-2 lg:w-3 lg:h-3 text-white"
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
                      <span className="text-xs lg:text-sm font-medium text-pink-700">
                        Estado:
                      </span>
                      {isEditingDocumentacion ? (
                        <select
                          value={
                            editingData.hojasA === 'Sí' ||
                            editingData.hojasA === 'si'
                              ? 'si'
                              : editingData.hojasA === 'No' ||
                                  editingData.hojasA === 'no'
                                ? 'no'
                                : 'chequear'
                          }
                          onChange={(e) => {
                            if (e.target.value === 'chequear') {
                              setEditingData((prev) => ({
                                ...prev,
                                hojasA: null,
                              }))
                            } else {
                              setEditingData((prev) => ({
                                ...prev,
                                hojasA: e.target.value === 'si' ? 'Sí' : 'No',
                              }))
                            }
                          }}
                          className="w-24 text-pink-900 bg-white border border-pink-300 rounded px-2 py-1 text-sm font-medium"
                        >
                          <option value="chequear">Chequear</option>
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span
                          className={`px-1 py-0.5 rounded-full text-xs font-medium ${
                            vehiculo.hojasA === 'Sí' || vehiculo.hojasA === 'si'
                              ? 'bg-green-100 text-green-800'
                              : vehiculo.hojasA === 'No' ||
                                  vehiculo.hojasA === 'no'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {getDocumentacionValue(vehiculo.hojasA)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Estado de Compra */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">
                  Estado de Compra
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Pagado */}
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="pagado"
                      checked={estadoCompra.pagado}
                      disabled={isLoadingEstadoCompra}
                      onChange={(e) => {
                        const nuevoEstado = {
                          ...estadoCompra,
                          pagado: e.target.checked,
                        }
                        setEstadoCompra(nuevoEstado)
                        saveEstadoCompra(nuevoEstado)
                      }}
                      className="w-4 h-4 text-orange-600 bg-orange-100 border-orange-300 rounded focus:ring-orange-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <label
                      htmlFor="pagado"
                      className="text-orange-700 font-medium text-sm cursor-pointer"
                    >
                      Pagado
                    </label>
                  </div>

                  {/* Transporte Solicitado */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="transporteSolicitado"
                      checked={estadoCompra.transporteSolicitado}
                      disabled={isLoadingEstadoCompra}
                      onChange={(e) => {
                        const nuevoEstado = {
                          ...estadoCompra,
                          transporteSolicitado: e.target.checked,
                        }
                        setEstadoCompra(nuevoEstado)
                        saveEstadoCompra(nuevoEstado)
                      }}
                      className="w-4 h-4 text-green-600 bg-green-100 border-green-300 rounded focus:ring-green-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <label
                      htmlFor="transporteSolicitado"
                      className="text-green-700 font-medium text-sm cursor-pointer"
                    >
                      Transporte Solicitado
                    </label>
                  </div>

                  {/* Recibido */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="recibido"
                      checked={estadoCompra.recibido}
                      disabled={isLoadingEstadoCompra}
                      onChange={(e) => {
                        const nuevoEstado = {
                          ...estadoCompra,
                          recibido: e.target.checked,
                        }
                        setEstadoCompra(nuevoEstado)
                        saveEstadoCompra(nuevoEstado)
                      }}
                      className="w-4 h-4 text-blue-600 bg-blue-100 border-blue-300 rounded focus:ring-blue-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <label
                      htmlFor="recibido"
                      className="text-blue-700 font-medium text-sm cursor-pointer"
                    >
                      Recibido
                    </label>
                  </div>
                </div>
              </div>

              {/* Notas */}
              {vehiculo?.id ? (
                <NotasSection
                  notas={notas}
                  onNotasChange={setNotas}
                  entityId={vehiculo.id}
                  entityType="vehiculo"
                />
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">
                    Notas
                  </h2>
                  <p className="text-gray-500 text-center py-4">Cargando...</p>
                </div>
              )}

              {/* Documentos del Vehículo - Solo visible en pantallas < 1500px */}
              <div className="block 2xl:hidden bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
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
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                      Documentos
                    </h2>
                  </div>
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
                    + Subir Archivo
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    />
                  </label>
                </div>

                <div className="space-y-3">
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
                      <p className="text-sm">No hay documentos subidos</p>
                      <p className="text-xs text-gray-400">
                        Sube archivos para organizarlos aquí
                      </p>
                    </div>
                  ) : (
                    documentos.map((doc) => {
                      // Validar que el documento tiene las propiedades necesarias
                      if (!doc || !doc.id || !doc.name) {
                        console.warn(
                          'Documento con propiedades faltantes:',
                          doc
                        )
                        return null
                      }

                      return (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
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
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {doc.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {doc.tamañoFormateado} •{' '}
                                {doc.uploadDate
                                  ? new Date(doc.uploadDate).toLocaleDateString(
                                      'es-ES'
                                    )
                                  : ''}
                              </p>
                            </div>
                          </div>
                          {/* Botón Anular para contratos de Coches R, Eliminar para otros documentos */}
                          {doc.name &&
                          doc.name
                            .toLowerCase()
                            .includes('contrato-coche-r') ? (
                            <button
                              onClick={() => handleAnularContrato(doc.id)}
                              className="px-3 py-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded transition-colors text-sm font-medium border border-orange-200"
                            >
                              Anular
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeleteFile(doc.id)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
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
                      )
                    })
                  )}
                </div>
              </div>

              {/* Recordatorios - Solo visible en pantallas < 1500px */}
              <div className="block 2xl:hidden bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                    Recordatorios ({recordatorios.length})
                  </h2>
                  {!showAddRecordatorioForm && (
                    <button
                      onClick={() => setShowAddRecordatorioForm(true)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors flex items-center space-x-1"
                    >
                      <svg
                        className="w-2 h-2 xl:w-3 xl:h-3"
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
                      <span>Agregar recordatorio</span>
                    </button>
                  )}
                </div>

                {/* Formulario para agregar recordatorio */}
                {showAddRecordatorioForm && (
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="text-sm font-semibold text-blue-900 mb-3">
                      Nuevo Recordatorio
                    </h3>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={nuevoRecordatorio.titulo}
                        onChange={(e) =>
                          setNuevoRecordatorio({
                            ...nuevoRecordatorio,
                            titulo: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Título del recordatorio"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={nuevoRecordatorio.tipo}
                          onChange={(e) =>
                            setNuevoRecordatorio({
                              ...nuevoRecordatorio,
                              tipo: e.target.value as any,
                            })
                          }
                          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="itv">ITV</option>
                          <option value="seguro">Seguro</option>
                          <option value="revision">Revisión</option>
                          <option value="documentacion">Documentación</option>
                          <option value="otro">Otro</option>
                        </select>
                        <select
                          value={nuevoRecordatorio.prioridad}
                          onChange={(e) =>
                            setNuevoRecordatorio({
                              ...nuevoRecordatorio,
                              prioridad: e.target.value as any,
                            })
                          }
                          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="baja">Baja</option>
                          <option value="media">Media</option>
                          <option value="alta">Alta</option>
                        </select>
                      </div>
                      <input
                        type="datetime-local"
                        value={nuevoRecordatorio.fechaRecordatorio}
                        onChange={(e) =>
                          setNuevoRecordatorio({
                            ...nuevoRecordatorio,
                            fechaRecordatorio: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <textarea
                        value={nuevoRecordatorio.descripcion}
                        onChange={(e) =>
                          setNuevoRecordatorio({
                            ...nuevoRecordatorio,
                            descripcion: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Descripción del recordatorio"
                        rows={3}
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={handleAgregarRecordatorio}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setShowAddRecordatorioForm(false)}
                          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors text-sm font-medium"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lista de Recordatorios */}
                {recordatorios.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    No hay recordatorios
                  </p>
                ) : (
                  <div className="space-y-3">
                    {recordatorios.map((recordatorio) => (
                      <div
                        key={recordatorio.id}
                        className={`p-3 rounded-lg border ${
                          recordatorio.completado
                            ? 'bg-gray-50 border-gray-200'
                            : 'bg-white border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4
                                className={`text-sm font-medium ${
                                  recordatorio.completado
                                    ? 'text-gray-500 line-through'
                                    : 'text-gray-900'
                                }`}
                              >
                                {recordatorio.titulo}
                              </h4>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  recordatorio.prioridad === 'alta'
                                    ? 'bg-red-100 text-red-800'
                                    : recordatorio.prioridad === 'media'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-green-100 text-green-800'
                                }`}
                              >
                                {recordatorio.prioridad}
                              </span>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  recordatorio.tipo === 'itv'
                                    ? 'bg-red-100 text-red-800'
                                    : recordatorio.tipo === 'seguro'
                                      ? 'bg-blue-100 text-blue-800'
                                      : recordatorio.tipo === 'revision'
                                        ? 'bg-orange-100 text-orange-800'
                                        : recordatorio.tipo === 'documentacion'
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {recordatorio.tipo}
                              </span>
                            </div>
                            <p
                              className={`text-xs text-gray-600 mb-2 ${
                                recordatorio.completado ? 'line-through' : ''
                              }`}
                            >
                              {recordatorio.descripcion}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDate(recordatorio.fecha_recordatorio)}
                            </p>
                          </div>
                          <div className="flex items-center space-x-1 ml-2">
                            <button
                              onClick={() =>
                                handleCompletarRecordatorio(recordatorio)
                              }
                              className={`p-1 rounded transition-colors ${
                                recordatorio.completado
                                  ? 'text-green-600 hover:bg-green-100'
                                  : 'text-gray-400 hover:bg-gray-100'
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
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() =>
                                handleEditarRecordatorio(recordatorio)
                              }
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
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
                            </button>
                            <button
                              onClick={() =>
                                handleEliminarRecordatorio(recordatorio.id)
                              }
                              className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
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
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Derecha */}
            <div className="hidden 2xl:block 2xl:col-span-3 space-y-2 sm:space-y-4 lg:space-y-6 max-w-[400px]">
              {/* Estado del Vehículo - Solo visible en pantallas >= 1500px */}
              <div className="hidden 2xl:block bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-6 lg:h-6 sm:w-8 sm:h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-3 h-3 sm:w-4 sm:h-4 text-white"
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
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                    Estado
                  </h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estado Actual
                    </label>
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-3 py-2 rounded-lg text-sm font-medium ${getEstadoColor(vehiculo.estado || 'inicial')}`}
                      >
                        {(vehiculo.estado || 'inicial').toUpperCase()}
                      </span>

                      {/* Botones de cambio de condición (Solo Admin) */}
                      {isAdmin && (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-600 font-medium">
                            Marcar como:
                          </p>
                          <div className="flex flex-col space-y-2 xl:flex-row xl:space-y-0 xl:space-x-2">
                            {getCondicionVehiculo() !== 'reservado' && (
                              <button
                                onClick={() =>
                                  cambiarCondicionVehiculo('reservado')
                                }
                                className="px-2 py-1 xl:px-3 xl:py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-xs xl:text-sm font-medium flex items-center space-x-1"
                              >
                                <svg
                                  className="w-2 h-2 xl:w-3 xl:h-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                  />
                                </svg>
                                <span>Reservado</span>
                              </button>
                            )}

                            {getCondicionVehiculo() !== 'vendido' && (
                              <button
                                onClick={() =>
                                  cambiarCondicionVehiculo('vendido')
                                }
                                className="px-2 py-1 xl:px-3 xl:py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-xs xl:text-sm font-medium flex items-center space-x-1"
                              >
                                <svg
                                  className="w-2 h-2 xl:w-3 xl:h-3"
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
                                <span>Vendido</span>
                              </button>
                            )}

                            {getCondicionVehiculo() !== 'disponible' && (
                              <button
                                onClick={() =>
                                  cambiarCondicionVehiculo('disponible')
                                }
                                className="px-2 py-1 xl:px-3 xl:py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-xs xl:text-sm font-medium flex items-center space-x-1"
                              >
                                <svg
                                  className="w-2 h-2 xl:w-3 xl:h-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  />
                                </svg>
                                <span>Disponible</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Condición del Vehículo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Condición
                    </label>
                    <div className="flex items-center space-x-3">
                      <span
                        className={`px-3 py-2 rounded-lg text-sm font-medium ${getCondicionColor(getCondicionVehiculo())}`}
                      >
                        {getCondicionVehiculo().toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Alerta de ITV vencida */}
                  {vehiculo.itv === 'No' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-1.5 sm:p-2 lg:p-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 sm:w-4 sm:h-4 lg:w-6 lg:h-6 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-1.5 h-1.5 sm:w-2 sm:h-2 lg:w-3 lg:h-3 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                            />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-red-900">
                            ⚠️ ITV Vencida
                          </h3>
                          <p className="text-xs text-red-700 mt-1">
                            Este vehículo necesita pasar la ITV antes de poder
                            ser vendido
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {vehiculo.ubicacion && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ubicación
                      </label>
                      <p className="text-gray-900 text-sm bg-gray-50 rounded-lg p-2">
                        {vehiculo.ubicacion}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Información de Venta */}
              {vehiculo?.venta && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                  <div className="flex items-center space-x-2 mb-4">
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
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg text-xs sm:text-sm lg:text-base font-semibold text-orange-900">
                      Información de Venta
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Cliente */}
                    <div className="bg-white rounded-lg p-1.5 sm:p-2 lg:p-4 border border-green-200">
                      <h4 className="font-medium text-green-800 mb-3 flex items-center">
                        <svg
                          className="w-4 h-4 mr-2"
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
                        Cliente
                      </h4>
                      <div className="space-y-2">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Nombre:</span>{' '}
                          <Link
                            href={`/clientes/${vehiculo.venta.cliente.id}`}
                            className="text-green-600 hover:text-green-800 font-medium"
                          >
                            {vehiculo.venta.cliente.nombre}{' '}
                            {vehiculo.venta.cliente.apellidos}
                          </Link>
                        </p>
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Email:</span>{' '}
                          {vehiculo.venta.cliente.email}
                        </p>
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Teléfono:</span>{' '}
                          {vehiculo.venta.cliente.telefono}
                        </p>
                      </div>
                    </div>

                    {/* Deal */}
                    <div className="bg-white rounded-lg p-1.5 sm:p-2 lg:p-4 border border-green-200">
                      <h4 className="font-medium text-green-800 mb-3 flex items-center">
                        <svg
                          className="w-4 h-4 mr-2"
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
                        Deal de Venta
                      </h4>
                      <div className="space-y-2">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Número:</span>{' '}
                          <Link
                            href={`/deals/${vehiculo.venta.dealId}`}
                            className="text-green-600 hover:text-green-800 font-medium"
                          >
                            {vehiculo.venta.dealNumero}
                          </Link>
                        </p>
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Fecha de Venta:</span>{' '}
                          {vehiculo.venta.fechaVenta
                            ? formatDate(vehiculo.venta.fechaVenta)
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Botón de Contrato para Coches R - Solo visible en pantallas >= 1500px */}
              {vehiculo?.tipo === 'R' && (
                <div className="hidden 2xl:block bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
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
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                      Contrato de Venta
                    </h2>
                  </div>
                  <button
                    onClick={async () => {
                      setShowContratoModal(true)
                      // Cargar últimos 5 clientes al abrir el modal (igual que en deals)
                      try {
                        const response = await fetch('/api/clientes?limit=5')
                        if (response.ok) {
                          const data = await response.json()
                          setClientes(data)
                        }
                      } catch (error) {
                        console.error('Error cargando clientes:', error)
                      }
                    }}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    <svg
                      className="w-5 h-5"
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
                    <span>GENERAR CONTRATO VENTA</span>
                  </button>
                </div>
              )}

              {/* Documentos del Vehículo - Solo visible en pantallas >= 1500px */}
              <div className="hidden 2xl:block bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
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
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                      Documentos
                    </h2>
                  </div>
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
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recordatorios */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                    Recordatorios ({recordatorios.length})
                  </h2>
                  {!showAddRecordatorioForm && (
                    <button
                      onClick={() => setShowAddRecordatorioForm(true)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors flex items-center space-x-1"
                    >
                      <svg
                        className="w-2 h-2 xl:w-3 xl:h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      <span>Agregar recordatorio</span>
                    </button>
                  )}
                </div>

                {/* Formulario para Agregar Nuevo Recordatorio - Solo visible cuando showAddRecordatorioForm es true */}
                {showAddRecordatorioForm && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-gray-700">
                        Nuevo Recordatorio
                      </h3>
                      <button
                        onClick={() => {
                          setShowAddRecordatorioForm(false)
                          setNuevoRecordatorio({
                            titulo: '',
                            descripcion: '',
                            fechaRecordatorio: '',
                            tipo: 'otro',
                            prioridad: 'media',
                          })
                        }}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <svg
                          className="w-5 h-5"
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
                    <div className="space-y-3">
                      <div>
                        <input
                          type="text"
                          value={nuevoRecordatorio.titulo}
                          onChange={(e) =>
                            setNuevoRecordatorio({
                              ...nuevoRecordatorio,
                              titulo: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          placeholder="Título del recordatorio..."
                        />
                      </div>
                      <div>
                        <input
                          type="datetime-local"
                          value={nuevoRecordatorio.fechaRecordatorio}
                          onChange={(e) =>
                            setNuevoRecordatorio({
                              ...nuevoRecordatorio,
                              fechaRecordatorio: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={nuevoRecordatorio.tipo}
                          onChange={(e) =>
                            setNuevoRecordatorio({
                              ...nuevoRecordatorio,
                              tipo: e.target.value as any,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                          <option value="itv">ITV</option>
                          <option value="seguro">Seguro</option>
                          <option value="revision">Revisión</option>
                          <option value="documentacion">Documentación</option>
                          <option value="otro">Otro</option>
                        </select>
                        <select
                          value={nuevoRecordatorio.prioridad}
                          onChange={(e) =>
                            setNuevoRecordatorio({
                              ...nuevoRecordatorio,
                              prioridad: e.target.value as any,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                          <option value="baja">Baja</option>
                          <option value="media">Media</option>
                          <option value="alta">Alta</option>
                        </select>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={handleAgregarRecordatorio}
                          disabled={
                            !nuevoRecordatorio.titulo.trim() ||
                            !nuevoRecordatorio.fechaRecordatorio
                          }
                          className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg disabled:cursor-not-allowed"
                        >
                          Agregar Recordatorio
                        </button>
                        <button
                          onClick={() => {
                            setShowAddRecordatorioForm(false)
                            setNuevoRecordatorio({
                              titulo: '',
                              descripcion: '',
                              fechaRecordatorio: '',
                              tipo: 'otro',
                              prioridad: 'media',
                            })
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lista de Recordatorios */}
                {recordatorios.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    No hay recordatorios
                  </p>
                ) : (
                  <div className="space-y-3">
                    {recordatorios.map((recordatorio) => (
                      <div
                        key={recordatorio.id}
                        className={`border rounded-lg p-3 ${
                          recordatorio.completado
                            ? 'bg-green-50 border-green-200'
                            : 'bg-yellow-50 border-yellow-200'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {editingRecordatorioId === recordatorio.id ? (
                              <div className="space-y-3">
                                <input
                                  type="text"
                                  value={editingRecordatorioData.titulo}
                                  onChange={(e) =>
                                    setEditingRecordatorioData({
                                      ...editingRecordatorioData,
                                      titulo: e.target.value,
                                    })
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="Título del recordatorio"
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <select
                                    value={editingRecordatorioData.tipo}
                                    onChange={(e) =>
                                      setEditingRecordatorioData({
                                        ...editingRecordatorioData,
                                        tipo: e.target.value as any,
                                      })
                                    }
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  >
                                    <option value="itv">ITV</option>
                                    <option value="seguro">Seguro</option>
                                    <option value="revision">Revisión</option>
                                    <option value="documentacion">
                                      Documentación
                                    </option>
                                    <option value="otro">Otro</option>
                                  </select>
                                  <select
                                    value={editingRecordatorioData.prioridad}
                                    onChange={(e) =>
                                      setEditingRecordatorioData({
                                        ...editingRecordatorioData,
                                        prioridad: e.target.value as any,
                                      })
                                    }
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  >
                                    <option value="baja">Baja</option>
                                    <option value="media">Media</option>
                                    <option value="alta">Alta</option>
                                  </select>
                                </div>
                                <input
                                  type="date"
                                  value={
                                    editingRecordatorioData.fechaRecordatorio
                                  }
                                  onChange={(e) =>
                                    setEditingRecordatorioData({
                                      ...editingRecordatorioData,
                                      fechaRecordatorio: e.target.value,
                                    })
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <textarea
                                  value={editingRecordatorioData.descripcion}
                                  onChange={(e) =>
                                    setEditingRecordatorioData({
                                      ...editingRecordatorioData,
                                      descripcion: e.target.value,
                                    })
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                  rows={2}
                                  placeholder="Descripción del recordatorio"
                                />
                                <div className="flex space-x-2">
                                  <button
                                    onClick={handleGuardarEdicionRecordatorio}
                                    className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                  >
                                    Guardar
                                  </button>
                                  <button
                                    onClick={handleCancelarEdicionRecordatorio}
                                    className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center space-x-2 mb-2">
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      recordatorio.tipo === 'itv'
                                        ? 'bg-red-100 text-red-800'
                                        : recordatorio.tipo === 'seguro'
                                          ? 'bg-blue-100 text-blue-800'
                                          : recordatorio.tipo === 'revision'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-gray-100 text-gray-800'
                                    }`}
                                  >
                                    {recordatorio.tipo}
                                  </span>
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(recordatorio.prioridad)}`}
                                  >
                                    {recordatorio.prioridad}
                                  </span>
                                </div>

                                <h4
                                  className={`font-medium text-sm mb-1 ${recordatorio.completado ? 'line-through text-gray-500' : 'text-gray-900'}`}
                                >
                                  {recordatorio.titulo}
                                </h4>

                                {recordatorio.descripcion && (
                                  <p
                                    className={`text-xs mb-2 ${recordatorio.completado ? 'text-gray-400' : 'text-gray-600'}`}
                                  >
                                    {recordatorio.descripcion}
                                  </p>
                                )}

                                <p className="text-xs text-gray-500">
                                  📅{' '}
                                  {formatDate(recordatorio.fecha_recordatorio)}
                                </p>
                              </>
                            )}
                          </div>

                          {editingRecordatorioId !== recordatorio.id && (
                            <div className="flex space-x-1 ml-2">
                              <button
                                onClick={() =>
                                  handleCompletarRecordatorio(recordatorio)
                                }
                                className={`p-1 rounded transition-colors ${
                                  recordatorio.completado
                                    ? 'text-green-600 hover:text-green-700'
                                    : 'text-gray-400 hover:text-green-600'
                                }`}
                                title={
                                  recordatorio.completado
                                    ? 'Marcar como pendiente'
                                    : 'Marcar como completado'
                                }
                              >
                                {recordatorio.completado ? '✅' : '⏳'}
                              </button>
                              <button
                                onClick={() =>
                                  handleEditarRecordatorio(recordatorio)
                                }
                                className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Editar recordatorio"
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
                                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"
                                  />
                                </svg>
                              </button>
                              <button
                                onClick={() =>
                                  handleEliminarRecordatorio(recordatorio.id)
                                }
                                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                title="Eliminar recordatorio"
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
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal de Generación de Contrato para Coches R */}
        {showContratoModal && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Generar Contrato de Venta
                  </h3>
                  <button
                    onClick={() => {
                      setShowContratoModal(false)
                      setSelectedCliente(null)
                      setClienteSearchTerm('')
                      setPrecioVenta('')
                      setClientes([])
                      setShowClienteDropdown(false)
                    }}
                    className="text-gray-400 hover:text-gray-600"
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

                <div className="space-y-4">
                  {/* Selección de Cliente - Mismo diseño que deals */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Cliente *
                    </label>
                    <div className="relative dropdown-container">
                      <input
                        type="text"
                        value={clienteSearchTerm}
                        onChange={(e) => {
                          setClienteSearchTerm(e.target.value)
                          setShowClienteDropdown(true)
                          handleClienteSearch(e.target.value)
                        }}
                        onFocus={() => setShowClienteDropdown(true)}
                        placeholder="Buscar cliente por nombre, apellidos, teléfono, email o DNI..."
                        className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        required
                      />
                      <svg
                        className="absolute right-3 top-3.5 h-5 w-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>

                      {/* Dropdown de clientes */}
                      {showClienteDropdown && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredClientes.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500">
                              {clienteSearchTerm
                                ? 'No se encontraron clientes'
                                : 'Escribe para buscar clientes'}
                            </div>
                          ) : (
                            filteredClientes.map((cliente) => (
                              <button
                                key={cliente.id}
                                type="button"
                                onClick={() => {
                                  handleSelectCliente(cliente)
                                  setClienteSearchTerm(
                                    `${capitalizeText(cliente.nombre)} ${capitalizeText(cliente.apellidos)}`
                                  )
                                  setShowClienteDropdown(false)
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                              >
                                <div className="font-medium text-gray-900">
                                  {capitalizeText(cliente.nombre)}{' '}
                                  {capitalizeText(cliente.apellidos)}
                                </div>
                                <div className="text-gray-500">
                                  {cliente.telefono}{' '}
                                  {cliente.email && `• ${cliente.email}`}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {selectedCliente && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-green-800">
                            Cliente seleccionado:{' '}
                            {capitalizeText(selectedCliente.nombre)}{' '}
                            {capitalizeText(selectedCliente.apellidos)}
                          </p>
                          <button
                            onClick={() => {
                              setSelectedCliente(null)
                              setClienteSearchTerm('')
                            }}
                            className="text-red-500 hover:text-red-700 ml-2"
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
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Precio de Venta */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Precio de Venta (€) *
                    </label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={precioVenta}
                      onChange={(e) => setPrecioVenta(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  {/* Botones */}
                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => {
                        setShowContratoModal(false)
                        setSelectedCliente(null)
                        setClienteSearchTerm('')
                        setPrecioVenta('')
                        setClientes([])
                        setShowClienteDropdown(false)
                      }}
                      className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleGenerarContrato}
                      disabled={
                        isGeneratingContrato || !selectedCliente || !precioVenta
                      }
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {isGeneratingContrato ? (
                        <>
                          <svg
                            className="w-4 h-4 animate-spin"
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
                          <span>Generando...</span>
                        </>
                      ) : (
                        'Generar Contrato'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showMatriculaModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Cambiar matrícula
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Las facturas, carpetas y filas de CB ya emitidas se quedan con la
                matrícula anterior ({vehiculo.matricula}); el CRM las sigue
                cruzando con este coche.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Matrícula nueva
              </label>
              <input
                type="text"
                value={nuevaMatricula}
                onChange={(e) => setNuevaMatricula(e.target.value)}
                placeholder="5439NNW"
                className="w-full border border-gray-300 rounded px-3 py-2 font-mono uppercase mb-3"
              />
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motivo
              </label>
              <textarea
                value={motivoMatricula}
                onChange={(e) => setMotivoMatricula(e.target.value)}
                rows={2}
                placeholder="matrícula provisional sustituida por definitiva"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-3"
              />
              {errorMatricula && (
                <p className="text-sm text-red-600 mb-3">{errorMatricula}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMatriculaModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!nuevaMatricula.trim() || guardandoMatricula}
                  onClick={guardarCambioMatricula}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {guardandoMatricula ? 'Guardando...' : 'Guardar cambio'}
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModalComponent />
      </div>
    </ProtectedRoute>
  )
}
