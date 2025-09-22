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

  // Estados para documentos
  const [documentos, setDocumentos] = useState<
    Array<{
      id: string
      nombre: string
      tamaño: string
      fechaSubida: string
      tipo: string
      ruta?: string
    }>
  >([])

  // Estados para edición
  const [isEditingGeneral, setIsEditingGeneral] = useState(false)
  const [isEditingDocumentacion, setIsEditingDocumentacion] = useState(false)
  const [isEditingFinanciero, setIsEditingFinanciero] = useState(false)
  const [editingData, setEditingData] = useState({
    marca: '',
    modelo: '',
    matricula: '',
    bastidor: '',
    kms: 0,
    color: '',
    fechaMatriculacion: '',
    año: 0,
    itv: '',
    seguro: '',
    segundaLlave: '',
    carpeta: '',
    master: '',
    hojasA: '',
    documentacion: '',
    precioCompra: 0,
    gastosTransporte: 0,
    gastosTasas: 0,
    gastosMecanica: 0,
    gastosPintura: 0,
    gastosLimpieza: 0,
    gastosOtros: 0,
    precioVenta: 0,
  })

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

  // Helper function para mostrar valores de documentación legal
  const getDocumentacionValue = (value: string | null | undefined): string => {
    if (!value || value === '' || value === 'null' || value === 'undefined') {
      return 'Chequear'
    }
    return value
  }

  // Función para obtener datos del vehículo
  const fetchVehiculo = async () => {
    console.log('🔍 [FETCH] ===== INICIANDO CARGA DE VEHÍCULO =====')
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
        console.log(`✅ [FETCH] Estado del vehículo:`, {
          estado: data.estado,
          tipo: typeof data.estado,
          esNull: data.estado === null,
          esUndefined: data.estado === undefined,
        })
        console.log(`✅ [FETCH] Datos completos del vehículo:`, data)

        // Actualizar estado del vehículo
        console.log('🔄 [FETCH] Actualizando estado del vehículo...')
        console.log('🔄 [FETCH] Datos recibidos del servidor:', {
          id: data.id,
          marca: data.marca,
          modelo: data.modelo,
          color: data.color,
          estado: data.estado,
        })
        setVehiculo(data)
        setError(null)
        console.log('✅ [FETCH] Estado del vehículo actualizado')
        console.log('✅ [FETCH] Color actualizado a:', data.color)

        // Verificar si la URL es correcta y redirigir si es necesario
        const correctSlug = generateVehicleSlug(data)
        console.log(`🔗 [FETCH] Slug correcto calculado: "${correctSlug}"`)
        console.log(`🔗 [FETCH] Slug actual: "${vehiculoSlug}"`)

        if (vehiculoSlug !== correctSlug) {
          console.log(
            `🔄 [FETCH] Redirigiendo a slug correcto: /vehiculos/${correctSlug}`
          )
          router.replace(`/vehiculos/${correctSlug}`)
        } else {
          console.log(
            `✅ [FETCH] URL es correcta, mostrando página del vehículo`
          )
        }

        console.log(
          '✅ [FETCH] ===== CARGA DE VEHÍCULO COMPLETADA EXITOSAMENTE ====='
        )
        return data
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error(`❌ [FETCH] Error al cargar el vehículo:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        })
        console.log(`🔄 [FETCH] Redirigiendo a /vehiculos`)
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
    } else {
      console.log(`⚠️ [VEHICULO PAGE] No hay ID para buscar`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculoId])

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

      showToast(`Descargando ${documento.nombre}`, 'success')
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

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Funciones para edición
  const startEditingGeneral = () => {
    console.log('🔧 [EDIT] ===== INICIANDO EDICIÓN GENERAL =====')
    console.log('🔧 [EDIT] Vehículo actual:', vehiculo)
    console.log('🔧 [EDIT] ID del vehículo:', vehiculo?.id)
    console.log('🔧 [EDIT] Estado actual del vehículo:', vehiculo?.estado)

    if (vehiculo) {
      const newEditingData = {
        marca: vehiculo.marca || '',
        modelo: vehiculo.modelo || '',
        matricula: vehiculo.matricula || '',
        bastidor: vehiculo.bastidor || '',
        kms: vehiculo.kms || 0,
        color: vehiculo.color || '',
        fechaMatriculacion: vehiculo.fechaMatriculacion || '',
        año: vehiculo.año || 0,
        itv: vehiculo.itv || '',
        seguro: vehiculo.seguro || '',
        segundaLlave: vehiculo.segundaLlave || '',
        carpeta: vehiculo.carpeta || '',
        master: vehiculo.master || '',
        hojasA: vehiculo.hojasA || '',
        documentacion: vehiculo.documentacion || '',
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

      console.log('🔄 [EDIT] Actualizando estado de edición...')
      setEditingData(newEditingData)
      setIsEditingGeneral(true)
      console.log('✅ [EDIT] Modo edición general activado')
      console.log('✅ [EDIT] ===== EDICIÓN GENERAL INICIADA EXITOSAMENTE =====')
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
    console.log('🔧 [SAVE] ===== INICIANDO GUARDADO =====')
    console.log('🔧 [SAVE] ID del vehículo:', vehiculo?.id)
    console.log('🔧 [SAVE] Datos a guardar:', editingData)
    console.log('🔧 [SAVE] Campos específicos a guardar:', {
      marca: editingData.marca,
      modelo: editingData.modelo,
      color: editingData.color,
      kms: editingData.kms,
      fechaMatriculacion: editingData.fechaMatriculacion,
      itv: editingData.itv,
      seguro: editingData.seguro,
      segundaLlave: editingData.segundaLlave,
      documentacion: editingData.documentacion,
    })
    console.log('🔧 [SAVE] Modo edición general:', isEditingGeneral)
    console.log('🔧 [SAVE] Modo edición documentación:', isEditingDocumentacion)
    console.log('🔧 [SAVE] Modo edición financiero:', isEditingFinanciero)
    console.log(
      '🔧 [SAVE] ¿Hay datos para guardar?',
      Object.keys(editingData).length > 0
    )

    if (!vehiculo?.id) {
      console.error('❌ [SAVE] No hay ID de vehículo')
      showToast('Error: No hay ID de vehículo', 'error')
      return
    }

    // Filtrar solo los campos que están siendo editados
    const camposAGuardar: any = {}

    if (isEditingGeneral) {
      // Campos de información general
      if (editingData.marca !== undefined)
        camposAGuardar.marca = editingData.marca
      if (editingData.modelo !== undefined)
        camposAGuardar.modelo = editingData.modelo
      if (editingData.matricula !== undefined)
        camposAGuardar.matricula = editingData.matricula
      if (editingData.bastidor !== undefined)
        camposAGuardar.bastidor = editingData.bastidor
      if (editingData.kms !== undefined) camposAGuardar.kms = editingData.kms
      if (editingData.fechaMatriculacion !== undefined)
        camposAGuardar.fechaMatriculacion = editingData.fechaMatriculacion
      if (editingData.color !== undefined)
        camposAGuardar.color = editingData.color
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
      showToast('No hay cambios para guardar', 'warning')
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
        console.log('✅ [SAVE] Respuesta exitosa del servidor:', responseData)
        console.log('✅ [SAVE] Cambios guardados en base de datos')

        // Recargar datos del vehículo
        console.log('🔄 [SAVE] Recargando datos del vehículo...')
        const vehiculoActualizado = await fetchVehiculo()

        if (vehiculoActualizado) {
          console.log('✅ [SAVE] Datos del vehículo recargados exitosamente')
          console.log(
            '✅ [SAVE] Nuevo estado del vehículo:',
            vehiculoActualizado.estado
          )
          console.log('✅ [SAVE] Nueva marca:', vehiculoActualizado.marca)
          console.log('✅ [SAVE] Nuevo modelo:', vehiculoActualizado.modelo)
          console.log('✅ [SAVE] Nuevo color:', vehiculoActualizado.color)
          console.log('✅ [SAVE] Datos completos recargados:', {
            id: vehiculoActualizado.id,
            marca: vehiculoActualizado.marca,
            modelo: vehiculoActualizado.modelo,
            color: vehiculoActualizado.color,
            estado: vehiculoActualizado.estado,
          })
        } else {
          console.warn(
            '⚠️ [SAVE] No se pudieron recargar los datos del vehículo'
          )
        }

        // Desactivar modo edición
        console.log('🔧 [SAVE] Desactivando modo edición...')
        setIsEditingGeneral(false)
        setIsEditingDocumentacion(false)
        setIsEditingFinanciero(false)
        console.log('✅ [SAVE] Modo edición desactivado')

        showToast('Cambios guardados exitosamente', 'success')
        console.log('✅ [SAVE] ===== GUARDADO COMPLETADO EXITOSAMENTE =====')
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('❌ [SAVE] Error en respuesta del servidor:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        })
        showToast(`Error al guardar cambios: ${response.status}`, 'error')
      }
    } catch (error) {
      console.error('❌ [SAVE] Error al guardar:', error)
      console.error('❌ [SAVE] Tipo de error:', typeof error)
      console.error(
        '❌ [SAVE] Mensaje de error:',
        error instanceof Error ? error.message : 'Error desconocido'
      )
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

  // Función para determinar la condición del vehículo basada en el deal
  const getCondicionVehiculo = () => {
    // Si tiene dealActivoId, significa que está en proceso de venta
    if (vehiculo?.dealActivoId) {
      // Aquí podrías hacer una consulta adicional para obtener el estado del deal
      // Por ahora, asumimos que si tiene deal activo, está "reservado"
      return 'reservado'
    }

    // Si no tiene deal activo, está disponible
    return 'disponible'
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
    console.log(`⚠️ [VEHICULO PAGE] No hay datos de vehículo para mostrar`)
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
    `🎯 [VEHICULO PAGE] Renderizando página del vehículo: ${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.referencia})`
  )

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => router.push('/vehiculos')}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    {formatVehicleReference(vehiculo.referencia, vehiculo.tipo)}{' '}
                    - {vehiculo.marca} {vehiculo.modelo}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {vehiculo.matricula} • {vehiculo.kms?.toLocaleString()} km •{' '}
                    {vehiculo.fechaMatriculacion
                      ? new Date(vehiculo.fechaMatriculacion).getFullYear()
                      : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${getEstadoColor(vehiculo.estado || 'inicial')}`}
                >
                  {(vehiculo.estado || 'inicial').toUpperCase()}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium border ${getTipoColor(vehiculo.tipo)}`}
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

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Panel Principal */}
            <div className="lg:col-span-2 space-y-6">
              {/* Tabs de Información */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                {/* Tab Headers */}
                <div className="border-b border-gray-200">
                  <nav className="flex space-x-8 px-6">
                    <button
                      onClick={() => setActiveTab('general')}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
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
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
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
                <div className="p-6">
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

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Marca y Modelo */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-center space-x-2 mb-3">
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
                                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                />
                              </svg>
                            </div>
                            <h3 className="font-semibold text-blue-900">
                              Identificación
                            </h3>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-1">
                                Marca
                              </label>
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
                                  className="w-full text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-sm font-medium"
                                />
                              ) : (
                                <p className="text-blue-900 font-semibold">
                                  {vehiculo.marca}
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-blue-700 mb-1">
                                Modelo
                              </label>
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
                                  className="w-full text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-sm font-medium"
                                />
                              ) : (
                                <p className="text-blue-900 font-semibold">
                                  {vehiculo.modelo}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Matrícula y Bastidor */}
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center space-x-2 mb-3">
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
                            <h3 className="font-semibold text-green-900">
                              Documentación
                            </h3>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-green-700 mb-1">
                                Matrícula
                              </label>
                              {isEditingGeneral ? (
                                <input
                                  type="text"
                                  value={editingData.matricula}
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      matricula: e.target.value,
                                    }))
                                  }
                                  className="w-full text-green-900 bg-white border border-green-300 rounded px-2 py-1 text-sm font-medium font-mono"
                                />
                              ) : (
                                <p className="text-green-900 font-mono font-semibold">
                                  {vehiculo.matricula}
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-green-700 mb-1">
                                Bastidor
                              </label>
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
                                  className="w-full text-green-900 bg-white border border-green-300 rounded px-2 py-1 text-sm font-medium font-mono"
                                />
                              ) : (
                                <p className="text-green-900 font-mono text-sm break-all">
                                  {vehiculo.bastidor}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* KMs, Fecha y Color */}
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                          <div className="flex items-center space-x-2 mb-3">
                            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
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
                                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </div>
                            <h3 className="font-semibold text-orange-900">
                              Características
                            </h3>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-orange-700 mb-1">
                                Kilómetros
                              </label>
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
                                  className="w-full text-orange-900 bg-white border border-orange-300 rounded px-2 py-1 text-sm font-medium"
                                  placeholder="Ingrese kilómetros"
                                />
                              ) : (
                                <p className="text-orange-900 font-semibold">
                                  {vehiculo.kms?.toLocaleString() || 'N/A'} km
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-orange-700 mb-1">
                                Fecha Matriculación
                              </label>
                              {isEditingGeneral ? (
                                <input
                                  type="date"
                                  value={editingData.fechaMatriculacion}
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      fechaMatriculacion: e.target.value,
                                    }))
                                  }
                                  className="w-full text-orange-900 bg-white border border-orange-300 rounded px-2 py-1 text-sm font-medium"
                                />
                              ) : (
                                <p className="text-orange-900 font-medium">
                                  {vehiculo.fechaMatriculacion
                                    ? formatDate(vehiculo.fechaMatriculacion)
                                    : 'N/A'}
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-orange-700 mb-1">
                                Color
                              </label>
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
                                  className="w-full text-orange-900 bg-white border border-orange-300 rounded px-2 py-1 text-sm font-medium"
                                  placeholder="Ingrese color"
                                />
                              ) : (
                                <p className="text-orange-900 font-medium">
                                  {vehiculo.color || 'N/A'}
                                </p>
                              )}
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
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                          <svg
                            className="w-6 h-6 mr-3 text-blue-600"
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
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              {/* Total Invertido */}
                              <div className="bg-white rounded-lg p-4 border border-gray-200">
                                <div className="flex items-center mb-2">
                                  <svg
                                    className="w-5 h-5 text-red-500 mr-2"
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
                                    Total Invertido
                                  </span>
                                </div>
                                <p className="text-2xl font-bold text-gray-900">
                                  {formatCurrency(totalInvertido)}
                                </p>
                              </div>

                              {/* Precio de Venta */}
                              <div className="bg-white rounded-lg p-4 border border-gray-200">
                                <div className="flex items-center mb-2">
                                  <svg
                                    className="w-5 h-5 text-green-500 mr-2"
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
                                    Precio de Venta
                                  </span>
                                </div>
                                <p className="text-2xl font-bold text-gray-900">
                                  {formatCurrency(precioVenta)}
                                </p>
                              </div>

                              {/* IVA */}
                              <div className="bg-white rounded-lg p-4 border border-gray-200">
                                <div className="flex items-center mb-2">
                                  <svg
                                    className="w-5 h-5 text-yellow-500 mr-2"
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
                                    IVA (21%)
                                  </span>
                                </div>
                                <p className="text-2xl font-bold text-gray-900">
                                  {formatCurrency(iva)}
                                </p>
                              </div>

                              {/* Beneficio Neto */}
                              <div className="bg-white rounded-lg p-4 border border-gray-200">
                                <div className="flex items-center mb-2">
                                  <svg
                                    className="w-5 h-5 text-blue-500 mr-2"
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
                                    Beneficio Neto
                                  </span>
                                </div>
                                <p
                                  className={`text-2xl font-bold ${beneficio >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                >
                                  {formatCurrency(beneficio)}
                                </p>
                              </div>
                            </div>
                          )
                        })()}
                      </div>

                      {/* Desglose Detallado */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Costos de Adquisición */}
                        <div className="bg-gray-50 rounded-lg p-6">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
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
                                  type="number"
                                  value={editingData.precioCompra}
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      precioCompra:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder="0"
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
                                  type="number"
                                  value={editingData.gastosTransporte}
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosTransporte:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder="0"
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
                                  type="number"
                                  value={editingData.gastosTasas}
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosTasas:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder="0"
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
                                  type="number"
                                  value={editingData.gastosMecanica}
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosMecanica:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder="0"
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
                                  type="number"
                                  value={editingData.gastosPintura}
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosPintura:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder="0"
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
                                  type="number"
                                  value={editingData.gastosLimpieza}
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosLimpieza:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder="0"
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
                                  type="number"
                                  value={editingData.gastosOtros}
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      gastosOtros:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-24 text-right font-semibold border border-gray-300 rounded px-2 py-1 text-sm"
                                  placeholder="0"
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
                          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
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
                                  type="number"
                                  value={editingData.precioVenta}
                                  onChange={(e) =>
                                    setEditingData((prev) => ({
                                      ...prev,
                                      precioVenta:
                                        parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-32 text-right font-semibold text-lg border border-gray-300 rounded px-2 py-1"
                                  placeholder="0"
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
                    <h2 className="text-lg font-semibold text-gray-900">
                      Documentación Legal
                    </h2>
                  </div>
                  {!isEditingDocumentacion ? (
                    <button
                      onClick={startEditingDocumentacion}
                      className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center space-x-1"
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
                        <span>Cancelar</span>
                      </button>
                      <button
                        onClick={saveEditing}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm flex items-center space-x-1"
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span>Guardar</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* ITV */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-white"
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
                      <h3 className="font-semibold text-red-900">ITV</h3>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-red-700 mb-1">
                          Estado
                        </label>
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
                            className="w-full text-red-900 bg-white border border-red-300 rounded px-2 py-1 text-sm font-medium"
                          >
                            <option value="chequear">Chequear</option>
                            <option value="si">Sí</option>
                            <option value="no">No</option>
                          </select>
                        ) : (
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              vehiculo.itv === 'Sí' || vehiculo.itv === 'si'
                                ? 'bg-green-100 text-green-800'
                                : vehiculo.itv === 'No' || vehiculo.itv === 'no'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {vehiculo.itv || 'Chequear'}
                          </span>
                        )}
                      </div>
                      {vehiculo.fechaVencimientoItv && (
                        <div>
                          <label className="block text-xs font-medium text-red-700 mb-1">
                            Vencimiento
                          </label>
                          <p className="text-red-900 text-sm font-medium">
                            {formatDate(vehiculo.fechaVencimientoItv)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Seguro */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-white"
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
                      <h3 className="font-semibold text-blue-900">Seguro</h3>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-700 mb-1">
                        Estado
                      </label>
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
                                seguro: e.target.value === 'si' ? 'Sí' : 'No',
                              }))
                            }
                          }}
                          className="w-full text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-sm font-medium"
                        >
                          <option value="chequear">Chequear</option>
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            vehiculo.seguro === 'Sí' || vehiculo.seguro === 'si'
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
                    </div>
                  </div>

                  {/* Segunda Llave */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-white"
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
                      <h3 className="font-semibold text-yellow-900">
                        2ª Llave
                      </h3>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-yellow-700 mb-1">
                        Disponible
                      </label>
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
                          className="w-full text-yellow-900 bg-white border border-yellow-300 rounded px-2 py-1 text-sm font-medium"
                        >
                          <option value="chequear">Chequear</option>
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                    </div>
                  </div>

                  {/* Documentación */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-white"
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
                      <h3 className="font-semibold text-green-900">
                        Documentación
                      </h3>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-green-700 mb-1">
                        Estado
                      </label>
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
                          className="w-full text-green-900 bg-white border border-green-300 rounded px-2 py-1 text-sm font-medium"
                        >
                          <option value="chequear">Chequear</option>
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                    </div>
                  </div>

                  {/* Master */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-white"
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
                      <h3 className="font-semibold text-indigo-900">Master</h3>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-indigo-700 mb-1">
                        Estado
                      </label>
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
                                master: e.target.value === 'si' ? 'Sí' : 'No',
                              }))
                            }
                          }}
                          className="w-full text-indigo-900 bg-white border border-indigo-300 rounded px-2 py-1 text-sm font-medium"
                        >
                          <option value="chequear">Chequear</option>
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            vehiculo.master === 'Sí' || vehiculo.master === 'si'
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
                    </div>
                  </div>

                  {/* Carpeta */}
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-white"
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
                      <h3 className="font-semibold text-orange-900">Carpeta</h3>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-orange-700 mb-1">
                        Estado
                      </label>
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
                          className="w-full text-orange-900 bg-white border border-orange-300 rounded px-2 py-1 text-sm font-medium"
                        >
                          <option value="chequear">Chequear</option>
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                  <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-white"
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
                      <h3 className="font-semibold text-pink-900">Hojas A</h3>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-pink-700 mb-1">
                        Estado
                      </label>
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
                          className="w-full text-pink-900 bg-white border border-pink-300 rounded px-2 py-1 text-sm font-medium"
                        >
                          <option value="chequear">Chequear</option>
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
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

              {/* Notas */}
              {vehiculo?.id ? (
                <NotasSection
                  notas={notas}
                  onNotasChange={setNotas}
                  entityId={vehiculo.id}
                  entityType="vehiculo"
                />
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Notas
                  </h2>
                  <p className="text-gray-500 text-center py-4">Cargando...</p>
                </div>
              )}
            </div>

            {/* Sidebar Derecha */}
            <div className="space-y-6">
              {/* Estado del Vehículo */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
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
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Estado
                  </h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estado Actual
                    </label>
                    <div className="flex items-center space-x-3">
                      <span
                        className={`px-3 py-2 rounded-lg text-sm font-medium ${getEstadoColor(vehiculo.estado || 'inicial')}`}
                      >
                        {(vehiculo.estado || 'inicial').toUpperCase()}
                      </span>
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
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-3 h-3 text-white"
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

              {/* Documentos del Vehículo */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
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
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Recordatorios ({recordatorios.length})
                  </h2>
                  {!showAddRecordatorioForm && (
                    <button
                      onClick={() => setShowAddRecordatorioForm(true)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors flex items-center space-x-1"
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

        <ConfirmModalComponent />
      </div>
    </ProtectedRoute>
  )
}
