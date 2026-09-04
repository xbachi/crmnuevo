'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import { useConfirmModal } from '@/components/ConfirmModal'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import { addReminder, createDocumentacionReminder } from '@/lib/reminders'
import { formatCurrency, generateClienteSlug } from '@/lib/utils'
import DealVentaInfo from '@/components/DealVentaInfo'
import CondicionesPagoModal from '@/components/CondicionesPagoModal'
import type { CondicionesPago } from '@/lib/ventaCondicionesPago'
import DealInvoiceSection from '@/components/invoicing/DealInvoiceSection'
import NotasSection from '@/components/NotasSection'
import EstadoBadge from '@/components/EstadoBadge'
import DealNextStep, {
  DEAL_ANCHOR_CAMBIO_NOMBRE,
  DEAL_ANCHOR_DOCUMENTOS,
  DEAL_ANCHOR_FACTURACION,
} from '@/components/DealNextStep'
import { normalizarDealEstado } from '@/lib/dealEstado'
import DealMensajes from '@/components/DealMensajes'

interface Deal {
  id: number
  numero: string
  clienteId: number
  vehiculoId: number
  cliente?: {
    id: number
    nombre: string
    apellidos: string
    email?: string
    telefono?: string
    dni?: string
    calle?: string
    ciudad?: string
    provincia?: string
    codPostal?: string
  }
  vehiculo?: {
    id: number
    referencia: string
    tipo?: string
    marca: string
    modelo: string
    matricula: string
    bastidor: string
    kms: number
    precioPublicacion?: number
    estado: string
    fechaMatriculacion?: string
    año?: number
  }
  estado: string
  resultado?: string
  motivo?: string
  importeTotal?: number
  importeSena?: number
  formaPagoSena?: string
  restoAPagar?: number
  financiacion: boolean
  entidadFinanciera?: string
  fechaCreacion: Date
  fechaReservaDesde?: Date
  fechaReservaExpira?: Date
  fechaVentaFirmada?: Date
  fechaFacturada?: Date
  fechaEntrega?: Date
  contratoReserva?: string
  contratoVenta?: string
  factura?: string
  recibos?: string
  pagosSena?: string
  pagosResto?: string
  observaciones?: string
  responsableComercial?: string
  // Cambio de nombre
  cambioNombreSolicitado: boolean
  documentacionRecibida: boolean
  clienteAvisado: boolean
  documentacionRetirada: boolean
  // Timestamps individuales
  cambioNombreSolicitadoAt?: Date
  documentacionRecibidaAt?: Date
  documentacionRetiradaAt?: Date
  clienteAvisadoAt?: Date
  logHistorial?: string
  createdAt: Date
  updatedAt: Date
}

interface Nota {
  id: number
  contenido: string
  usuario_nombre: string
  fecha_creacion: string
}

interface Recordatorio {
  id: number
  fecha: Date
  titulo: string
  descripcion: string
  completado: boolean
}

interface AccionHistorial {
  accion: string
  fecha: Date
  usuario?: string
}

// Función para generar el historial de acciones basado en los datos del deal
function getHistorialAcciones(
  deal: Deal,
  currentUser?: any
): AccionHistorial[] {
  const historial: AccionHistorial[] = []

  // Determinar el nombre del usuario según el login
  let usuario = 'Usuario'
  if (currentUser?.username === 'admin') {
    usuario = 'Sebastian'
  } else if (currentUser?.username === 'asesor') {
    usuario = 'asesor'
  } else {
    usuario = deal.responsableComercial || 'Usuario'
  }

  // Creación del deal
  historial.push({
    accion: 'Deal creado',
    fecha: new Date(deal.fechaCreacion),
    usuario: usuario,
  })

  // Contrato de reserva generado
  if (deal.contratoReserva) {
    historial.push({
      accion: 'Contrato de reserva generado',
      fecha: new Date(deal.fechaReservaDesde || deal.fechaCreacion),
      usuario: usuario,
    })
  }

  // Contrato de venta generado
  if (deal.contratoVenta) {
    historial.push({
      accion: 'Contrato de venta generado',
      fecha: new Date(deal.fechaVentaFirmada || deal.fechaCreacion),
      usuario: usuario,
    })
  }

  // Factura generada
  if (deal.factura) {
    historial.push({
      accion: 'Factura generada',
      fecha: new Date(deal.fechaFacturada || deal.fechaCreacion),
      usuario: usuario,
    })
  }

  // Usar timestamps individuales para orden cronológico real
  // Cambio de nombre solicitado
  if (deal.cambioNombreSolicitado && deal.cambioNombreSolicitadoAt) {
    historial.push({
      accion: 'Cambio de nombre solicitado',
      fecha: new Date(deal.cambioNombreSolicitadoAt),
      usuario: usuario,
    })
  }

  // Documentación recibida
  if (deal.documentacionRecibida && deal.documentacionRecibidaAt) {
    historial.push({
      accion: 'Documentación recibida',
      fecha: new Date(deal.documentacionRecibidaAt),
      usuario: usuario,
    })
  }

  // Documentación retirada
  if (deal.documentacionRetirada && deal.documentacionRetiradaAt) {
    historial.push({
      accion: 'Documentación retirada',
      fecha: new Date(deal.documentacionRetiradaAt),
      usuario: usuario,
    })
  }

  // Cliente avisado
  if (deal.clienteAvisado && deal.clienteAvisadoAt) {
    historial.push({
      accion: 'Cliente avisado',
      fecha: new Date(deal.clienteAvisadoAt),
      usuario: usuario,
    })
  }

  // Ordenar por fecha descendente (más reciente primero) para que la última acción esté arriba
  return historial.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
}

export default function DealDetail() {
  const params = useParams()
  const router = useRouter()
  const { showToast, ToastContainer } = useToast()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()
  const { user } = useAuth()

  const [deal, setDeal] = useState<Deal | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isGeneratingReserva, setIsGeneratingReserva] = useState(false)
  const [isGeneratingVenta, setIsGeneratingVenta] = useState(false)
  const [notas, setNotas] = useState<Nota[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [documentacionFiles, setDocumentacionFiles] = useState<any[]>([])
  const [showAllHistorial, setShowAllHistorial] = useState(false)

  // Estados para los formularios
  const [nuevaNota, setNuevaNota] = useState('')
  const [nuevoRecordatorio, setNuevoRecordatorio] = useState({
    titulo: '',
    descripcion: '',
    fecha: '',
  })
  const [showRecordatorioForm, setShowRecordatorioForm] = useState(false)

  // Estado para el modal de confirmación
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showCondicionesPago, setShowCondicionesPago] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchDeal()
      fetchDocumentacionFiles()
    }
  }, [params.id])

  const fetchDocumentacionFiles = async () => {
    try {
      const response = await fetch('/api/documentacion/files')
      if (response.ok) {
        const files = await response.json()
        setDocumentacionFiles(files)
      }
    } catch (error) {
      console.error('Error loading documentation files:', error)
    }
  }

  const getDocumentFile = (type: string) => {
    return documentacionFiles.find((file) => file.type === type)
  }

  const fetchDeal = async (opts: { silent?: boolean } = {}) => {
    try {
      // Spinner de página solo en la primera carga: los refetch posteriores
      // (contratos, anulaciones, checkboxes) no desmontan la ficha.
      if (!opts.silent && !deal) setIsLoading(true)
      const response = await fetch(`/api/deals/${params.id}`)
      if (response.ok) {
        const dealData = await response.json()

        // Asegurar que los campos de cambio de nombre tengan valores por defecto
        const dealWithDefaults = {
          ...dealData,
          cambioNombreSolicitado: dealData.cambioNombreSolicitado ?? false,
          documentacionRecibida: dealData.documentacionRecibida ?? false,
          clienteAvisado: dealData.clienteAvisado ?? false,
          documentacionRetirada: dealData.documentacionRetirada ?? false,
        }

        setDeal(dealWithDefaults)

        // Cargar notas y recordatorios desde la API (independientes)
        await Promise.all([fetchNotas(), fetchRecordatorios()])
      } else {
        showToast('Error al cargar el deal', 'error')
        router.push('/deals')
      }
    } catch (error) {
      console.error('Error cargando deal:', error)
      showToast('Error al cargar el deal', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Alias para recargar el deal (usado después de generar documentos)
  const loadDeal = fetchDeal

  const fetchNotas = async () => {
    try {
      // console.log(`📝 [DEAL] Obteniendo notas para deal ${params.id}`)
      const response = await fetch(`/api/deals/${params.id}/notas`)
      if (response.ok) {
        const data = await response.json()
        setNotas(data)
        // console.log(`✅ [DEAL] Notas cargadas:`, data.length)
      } else {
        console.error('Error al obtener notas:', response.statusText)
        setNotas([])
      }
    } catch (error) {
      console.error('Error al obtener notas:', error)
      setNotas([])
    }
  }

  const fetchRecordatorios = async () => {
    try {
      console.log(
        `🔍 [DEAL RECORDATORIO] Cargando recordatorios para deal ${params.id}`
      )
      const response = await fetch(`/api/deals/${params.id}/recordatorios`)
      console.log(`📊 [DEAL RECORDATORIO] Response status:`, response.status)

      if (response.ok) {
        const recordatorios = await response.json()
        console.log(
          `✅ [DEAL RECORDATORIO] Recordatorios cargados:`,
          recordatorios
        )
        // Convertir las fechas de string a Date
        const recordatoriosWithDates = recordatorios.map((r: any) => ({
          ...r,
          fecha: new Date(r.fecha_recordatorio),
        }))
        setRecordatorios(recordatoriosWithDates)
      } else {
        const errorData = await response.json()
        console.error(`❌ [DEAL RECORDATORIO] Error response:`, errorData)
        showToast(
          `Error cargando recordatorios: ${errorData.details || errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error(
        '❌ [DEAL RECORDATORIO] Error cargando recordatorios:',
        error
      )
      showToast('Error de conexión al cargar recordatorios', 'error')
    }
  }

  const handleGenerarContratoReserva = async () => {
    try {
      setIsGeneratingReserva(true)

      if (!deal) {
        showToast('No hay datos del deal disponibles', 'error')
        return
      }

      // Siempre generar un nuevo contrato (no usar caché)
      // Log de datos del vehículo para debug
      console.log('🔍 [DEAL] Datos del vehículo que se envían:', {
        marca: deal.vehiculo?.marca,
        modelo: deal.vehiculo?.modelo,
        matricula: deal.vehiculo?.matricula,
        bastidor: deal.vehiculo?.bastidor,
        kms: deal.vehiculo?.kms,
        fechaMatriculacion: deal.vehiculo?.fechaMatriculacion,
      })

      // Generar el contrato
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dealId: deal.id,
          documentType: 'contrato-reserva',
          dealNumber: deal.numero,
          dealData: {
            numero: deal.numero,
            fechaCreacion: deal.fechaCreacion,
            cliente: deal.cliente,
            vehiculo: deal.vehiculo,
            importeTotal: deal.importeTotal,
            importeSena: deal.importeSena,
            formaPagoSena: deal.formaPagoSena,
            fechaReservaDesde: deal.fechaReservaDesde,
            fechaReservaExpira: deal.fechaReservaExpira,
          },
        }),
      })

      if (response.ok) {
        // Detectar si la respuesta es PDF directo o JSON
        const contentType = response.headers.get('content-type')

        if (contentType?.includes('application/pdf')) {
          // Respuesta directa de PDF (Vercel)
          console.log('📄 [DEAL] Recibiendo PDF directo de Vercel')

          // Crear blob y descargar directamente
          const pdfBlob = await response.blob()
          const url = window.URL.createObjectURL(pdfBlob)
          const link = document.createElement('a')
          link.href = url
          link.download = `contrato-reserva-${deal.numero}.pdf`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)

          // Calcular fecha de expiración (7 días desde hoy)
          const fechaReservaDesde = new Date()
          const fechaReservaExpira = new Date()
          fechaReservaExpira.setDate(fechaReservaExpira.getDate() + 7)

          // Actualizar el deal para marcar que tiene contrato de reserva
          const timestamp = Date.now()
          const updatedDeal = {
            ...deal,
            contratoReserva: `contrato-reserva-${deal.numero}-${timestamp}.pdf`,
            estado: 'reservado',
            fechaReservaDesde: fechaReservaDesde,
            fechaReservaExpira: fechaReservaExpira,
          }
          setDeal(updatedDeal)

          // Actualizar en la base de datos
          try {
            await fetch(`/api/deals/${deal.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                estado: 'reservado',
                contratoReserva: `contrato-reserva-${deal.numero}.pdf`,
                fechaReservaDesde: fechaReservaDesde.toISOString(),
                fechaReservaExpira: fechaReservaExpira.toISOString(),
              }),
            })

            showToast(
              'Contrato de reserva generado y descargado exitosamente',
              'success'
            )

            // Recargar el deal para actualizar el estado
            await loadDeal()
          } catch (error) {
            console.error('Error actualizando estado:', error)
            showToast(
              'Contrato generado pero error actualizando estado',
              'error'
            )
          }
        } else {
          // Respuesta JSON (desarrollo local)
          const result = await response.json()

          // Calcular fecha de expiración (7 días desde hoy)
          const fechaReservaDesde = new Date()
          const fechaReservaExpira = new Date()
          fechaReservaExpira.setDate(fechaReservaExpira.getDate() + 7)

          // Actualizar el deal para marcar que tiene contrato de reserva
          // Usar timestamp para evitar caché del navegador
          const timestamp = Date.now()
          const updatedDeal = {
            ...deal,
            contratoReserva: `contrato-reserva-${deal.numero}-${timestamp}.pdf`,
            estado: 'reservado',
            fechaReservaDesde: fechaReservaDesde,
            fechaReservaExpira: fechaReservaExpira,
          }
          setDeal(updatedDeal)

          // Actualizar en la base de datos
          try {
            await fetch(`/api/deals/${deal.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                estado: 'reservado',
                contratoReserva: `contrato-reserva-${deal.numero}.pdf`,
                fechaReservaDesde: fechaReservaDesde.toISOString(),
                fechaReservaExpira: fechaReservaExpira.toISOString(),
              }),
            })

            showToast('Contrato de reserva generado exitosamente', 'success')

            // Recargar el deal para actualizar el estado
            await loadDeal()

            // Descargar el documento
            window.open(result.url, '_blank')
          } catch (error) {
            console.error('Error actualizando estado:', error)
          }
        }
      } else {
        const error = await response.json()
        showToast(error.error || 'Error generando contrato de reserva', 'error')
      }
    } catch (error) {
      console.error('Error generando contrato:', error)
      showToast('Error al generar el contrato de reserva', 'error')
    } finally {
      setIsGeneratingReserva(false)
    }
  }

  // El contrato de venta exige capturar antes las condiciones de pago:
  // el botón solo abre el modal; la generación real ocurre al confirmar.
  const handleGenerarContratoVenta = () => {
    if (!deal) {
      showToast('No hay datos del deal disponibles', 'error')
      return
    }
    setShowCondicionesPago(true)
  }

  const handleCondicionesPagoConfirmadas = async (
    condiciones: CondicionesPago
  ) => {
    if (!deal) return
    try {
      setIsGeneratingVenta(true)

      // Guardar condiciones de pago. Si falla, el contrato NO se genera.
      const condRes = await fetch(`/api/deals/${deal.id}/condiciones-pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(condiciones),
      })
      if (!condRes.ok) {
        const err = await condRes.json().catch(() => ({}))
        showToast(
          err.error || 'Error guardando las condiciones de pago',
          'error'
        )
        return
      }
      setShowCondicionesPago(false)

      // Siempre generar un nuevo contrato (no usar caché)
      // Generar el contrato
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dealId: deal.id,
          documentType: 'contrato-venta',
          dealNumber: deal.numero,
          dealData: {
            numero: deal.numero,
            fechaCreacion: deal.fechaCreacion,
            cliente: deal.cliente,
            vehiculo: deal.vehiculo,
            importeTotal: deal.importeTotal,
            importeSena: deal.importeSena,
            formaPagoSena: deal.formaPagoSena,
            fechaReservaDesde: deal.fechaReservaDesde,
            fechaReservaExpira: deal.fechaReservaExpira,
            condicionesPago: condiciones,
          },
        }),
      })

      if (response.ok) {
        // Detectar si la respuesta es PDF directo o JSON
        const contentType = response.headers.get('content-type')

        if (contentType?.includes('application/pdf')) {
          // Respuesta directa de PDF (Vercel)
          console.log('📄 [DEAL] Recibiendo PDF directo de Vercel')

          // Crear blob y descargar directamente
          const pdfBlob = await response.blob()
          const url = window.URL.createObjectURL(pdfBlob)
          const link = document.createElement('a')
          link.href = url
          link.download = `contrato-venta-${deal.numero}.pdf`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)

          // Actualizar el deal con timestamp para evitar caché
          const timestamp = Date.now()
          const updatedDeal = {
            ...deal,
            contratoVenta: `contrato-venta-${deal.numero}-${timestamp}.pdf`,
            estado: 'vendido',
            fechaVentaFirmada: new Date(),
          }
          setDeal(updatedDeal)

          // Actualizar en la base de datos
          try {
            const putRes = await fetch(`/api/deals/${deal.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                estado: 'vendido',
                contratoVenta: `contrato-venta-${deal.numero}-${timestamp}.pdf`,
                fechaVentaFirmada: new Date().toISOString(),
              }),
            })
            if (!putRes.ok) {
              const errBody = await putRes.json().catch(() => ({}))
              throw new Error(errBody?.error || `PUT failed: ${putRes.status}`)
            }

            showToast(
              'Contrato de venta generado y descargado exitosamente',
              'success'
            )

            // Recargar el deal para actualizar el estado
            await loadDeal()
          } catch (error) {
            console.error('Error actualizando estado:', error)
            showToast(
              'Contrato generado pero error actualizando estado',
              'error'
            )
          }
        } else {
          // Respuesta JSON (desarrollo local)
          const result = await response.json()

          // Actualizar el deal con timestamp para evitar caché
          const timestamp = Date.now()
          const updatedDeal = {
            ...deal,
            contratoVenta: `contrato-venta-${deal.numero}-${timestamp}.pdf`,
            estado: 'vendido',
            fechaVentaFirmada: new Date(),
          }
          setDeal(updatedDeal)

          // Actualizar en la base de datos
          try {
            await fetch(`/api/deals/${deal.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                estado: 'vendido',
                contratoVenta: `contrato-venta-${deal.numero}-${timestamp}.pdf`,
                fechaVentaFirmada: new Date().toISOString(),
              }),
            })

            showToast('Contrato de venta generado exitosamente', 'success')

            // Recargar el deal para actualizar el estado
            await loadDeal()

            // Descargar el documento
            window.open(result.url, '_blank')
          } catch (error) {
            console.error('Error actualizando estado:', error)
          }
        }
      } else {
        const error = await response.json()
        showToast(error.error || 'Error generando contrato de venta', 'error')
      }
    } catch (error) {
      console.error('Error generando contrato de venta:', error)
      showToast('Error al generar el contrato de venta', 'error')
    } finally {
      setIsGeneratingVenta(false)
    }
  }

  // Funciones de descarga para el bloque Documentación
  const handleDescargarContratoReserva = async () => {
    if (!deal?.contratoReserva) return

    try {
      const downloadUrl = `/api/documents/${deal.id}/contrato-reserva?dealNumber=${deal.numero}`
      window.open(downloadUrl, '_blank')
    } catch (error) {
      console.error('Error descargando contrato de reserva:', error)
      showToast('Error al descargar el contrato de reserva', 'error')
    }
  }

  const handleDescargarContratoVenta = async () => {
    if (!deal?.contratoVenta) return

    try {
      const downloadUrl = `/api/documents/${deal.id}/contrato-venta?dealNumber=${deal.numero}`
      window.open(downloadUrl, '_blank')
    } catch (error) {
      console.error('Error descargando contrato de venta:', error)
      showToast('Error al descargar el contrato de venta', 'error')
    }
  }

  const handleDescargarFactura = async () => {
    if (!deal?.factura) return

    const { downloadPdf } = await import('@/lib/pdf/download')
    await downloadPdf({
      url: `/api/documents/${deal.id}/factura?dealNumber=${deal.numero}`,
      filename: `factura-${deal.factura}`,
      onError: (msg) => showToast(msg, 'error'),
    })
  }

  // Funciones para anular documentos
  const handleAnularContratoReserva = () => {
    if (!deal?.contratoReserva) return

    showConfirm(
      'Anular contrato de reserva',
      `Se eliminará el PDF del contrato de reserva del deal ${deal.numero}. Esta acción no se puede deshacer.`,
      async () => {
        setIsUpdating(true)
        try {
          // Eliminar archivo físico del servidor
          await fetch(`/api/documents/${deal.id}/contrato-reserva`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dealNumber: deal.numero }),
          })

          // Actualizar base de datos
          const response = await fetch(`/api/deals/${deal.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contratoReserva: null,
              estado: deal.contratoVenta ? 'vendido' : 'nuevo', // Si tiene contrato de venta, mantener vendido
            }),
          })

          if (response.ok) {
            showToast('Contrato de reserva anulado exitosamente', 'success')
            await loadDeal()
          } else {
            showToast('Error al anular el contrato de reserva', 'error')
          }
        } catch (error) {
          console.error('Error anulando contrato de reserva:', error)
          showToast('Error al anular el contrato de reserva', 'error')
        } finally {
          setIsUpdating(false)
        }
      },
      'danger'
    )
  }

  const handleAnularContratoVenta = () => {
    if (!deal?.contratoVenta) return

    showConfirm(
      'Anular contrato de venta',
      `Se eliminará el PDF del contrato de venta del deal ${deal.numero} y el deal volverá a estado reservado. Esta acción no se puede deshacer.`,
      async () => {
        setIsUpdating(true)
        try {
          // Eliminar archivo físico del servidor
          await fetch(`/api/documents/${deal.id}/contrato-venta`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dealNumber: deal.numero }),
          })

          // Actualizar base de datos
          const response = await fetch(`/api/deals/${deal.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contratoVenta: null,
              estado: deal.factura ? 'facturado' : 'reservado', // Si tiene factura, mantener facturado
            }),
          })

          if (response.ok) {
            showToast('Contrato de venta anulado exitosamente', 'success')
            await loadDeal()
          } else {
            showToast('Error al anular el contrato de venta', 'error')
          }
        } catch (error) {
          console.error('Error anulando contrato de venta:', error)
          showToast('Error al anular el contrato de venta', 'error')
        } finally {
          setIsUpdating(false)
        }
      },
      'danger'
    )
  }

  const handleCambioNombreChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!deal) return

    const field = e.target.id as keyof Pick<
      Deal,
      | 'cambioNombreSolicitado'
      | 'documentacionRecibida'
      | 'clienteAvisado'
      | 'documentacionRetirada'
    >
    const value = e.target.checked

    try {
      setIsUpdating(true)

      // Actualizar el estado local
      const updatedDeal = {
        ...deal,
        [field]: value,
      }
      setDeal(updatedDeal)

      // Actualizar en la base de datos
      await fetch(`/api/deals/${deal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [field]: value,
        }),
      })

      // Si se marca "cambio de nombre solicitado", eliminar el recordatorio del dashboard
      if (field === 'cambioNombreSolicitado' && value) {
        try {
          // Eliminar recordatorio de la base de datos
          await fetch(`/api/recordatorios/eliminar-cambio-nombre/${deal.id}`, {
            method: 'DELETE',
          })

          // Eliminar recordatorio del dashboard directamente
          if (typeof window !== 'undefined') {
            // Buscar y eliminar el recordatorio "Cambio de Nombre Pendiente" que contenga este deal
            const dashboardReminder = document.querySelector(
              '[data-reminder-type="cambio_nombre_pendiente"]'
            )
            if (dashboardReminder) {
              // Buscar el item específico del deal dentro del recordatorio
              const dealItem = dashboardReminder.querySelector(
                `[data-deal-id="${deal.id}"]`
              )
              if (dealItem) {
                dealItem.remove()

                // Actualizar el contador si existe
                const countElement =
                  dashboardReminder.querySelector('[data-count]')
                if (countElement) {
                  const currentCount = parseInt(countElement.textContent || '0')
                  const newCount = Math.max(0, currentCount - 1)
                  countElement.textContent = newCount.toString()

                  // Si no quedan items, ocultar o actualizar el recordatorio
                  if (newCount === 0) {
                    ;(dashboardReminder as HTMLElement).style.display = 'none'
                  }
                }
              }
            }
          }

          showToast('Recordatorio de cambio de nombre eliminado', 'success')
        } catch (error) {
          console.error('Error eliminando recordatorio:', error)
        }
      }

      showToast('Cambio de nombre actualizado', 'success')
    } catch (error) {
      console.error('Error actualizando cambio de nombre:', error)
      showToast('Error al actualizar cambio de nombre', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleAnularReserva = async () => {
    if (!deal) return

    try {
      setIsUpdating(true)

      // Eliminar el deal (esto también liberará el vehículo automáticamente)
      const response = await fetch(`/api/deals/${deal.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        showToast('Reserva anulada y vehículo liberado', 'success')

        // Redirigir a la lista de deals
        setTimeout(() => {
          router.push('/deals')
        }, 1500)
      } else {
        throw new Error('Error al anular la reserva')
      }
    } catch (error) {
      console.error('Error anulando reserva:', error)
      showToast('Error anulando la reserva', 'error')
    } finally {
      setIsUpdating(false)
      setShowCancelModal(false)
    }
  }

  const handleAgregarNota = async () => {
    if (!nuevaNota.trim() || !params.id) return

    try {
      // console.log(`📝 [DEAL NOTA] Agregando nota para deal ${params.id}`)
      const response = await fetch(`/api/deals/${params.id}/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contenido: nuevaNota,
          usuario_nombre: 'Admin',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ [DEAL NOTA] Error agregando nota:', errorData)
        showToast(`Error al agregar la nota: ${errorData.error}`, 'error')
        return
      }

      const nuevaNotaData = await response.json()
      console.log(`✅ [DEAL NOTA] Nota agregada:`, nuevaNotaData)

      // Recargar notas desde la API
      await fetchNotas()
      setNuevaNota('')
      showToast('Nota agregada correctamente', 'success')
    } catch (error) {
      console.error('❌ [DEAL NOTA] Error agregando nota:', error)
      showToast('Error al agregar la nota', 'error')
    }
  }

  const handleAgregarRecordatorio = async () => {
    if (!nuevoRecordatorio.titulo.trim() || !nuevoRecordatorio.fecha) return

    try {
      console.log(
        `📝 [DEAL RECORDATORIO] Agregando recordatorio para deal ${params.id}`
      )
      setIsUpdating(true)

      const response = await fetch(`/api/deals/${params.id}/recordatorios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          titulo: nuevoRecordatorio.titulo.trim(),
          descripcion: nuevoRecordatorio.descripcion.trim(),
          tipo: 'general',
          prioridad: 'media',
          fecha_recordatorio: nuevoRecordatorio.fecha,
        }),
      })

      console.log(`📊 [DEAL RECORDATORIO] Response status:`, response.status)

      if (response.ok) {
        const nuevoRecordatorioData = await response.json()
        console.log(
          `✅ [DEAL RECORDATORIO] Recordatorio agregado:`,
          nuevoRecordatorioData
        )

        // Recargar recordatorios desde la API
        await fetchRecordatorios()
        setNuevoRecordatorio({ titulo: '', descripcion: '', fecha: '' })
        setShowRecordatorioForm(false) // Ocultar formulario después de agregar
        showToast('Recordatorio agregado correctamente', 'success')
      } else {
        const errorData = await response.json()
        console.error(`❌ [DEAL RECORDATORIO] Error response:`, errorData)
        showToast(
          `Error al agregar recordatorio: ${errorData.details || errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error(
        '❌ [DEAL RECORDATORIO] Error agregando recordatorio:',
        error
      )
      showToast('Error de conexión al agregar recordatorio', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleCompletarRecordatorio = async (id: number) => {
    try {
      console.log(
        `✅ [DEAL RECORDATORIO] Completando recordatorio ${id} del deal ${params.id}`
      )
      setIsUpdating(true)

      // Encontrar el recordatorio actual
      const recordatorio = recordatorios.find((r) => r.id === id)
      if (!recordatorio) return

      const response = await fetch(`/api/deals/${params.id}/recordatorios`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: id,
          titulo: recordatorio.titulo,
          descripcion: recordatorio.descripcion,
          tipo: 'general',
          prioridad: 'media',
          fecha_recordatorio: recordatorio.fecha.toISOString(),
          completado: !recordatorio.completado,
        }),
      })

      console.log(`📊 [DEAL RECORDATORIO] Response status:`, response.status)

      if (response.ok) {
        console.log(`✅ [DEAL RECORDATORIO] Recordatorio completado`)
        // Recargar recordatorios desde la API
        await fetchRecordatorios()
        showToast('Recordatorio actualizado', 'success')
      } else {
        const errorData = await response.json()
        console.error(`❌ [DEAL RECORDATORIO] Error response:`, errorData)
        showToast(
          `Error al actualizar recordatorio: ${errorData.details || errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error(
        '❌ [DEAL RECORDATORIO] Error completando recordatorio:',
        error
      )
      showToast('Error de conexión al actualizar recordatorio', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleEliminarRecordatorio = (id: number) => {
    if (!deal) return

    showConfirm(
      'Eliminar Recordatorio',
      '¿Estás seguro de que deseas eliminar este recordatorio? Esta acción no se puede deshacer.',
      async () => {
        try {
          console.log(
            `🗑️ [DEAL RECORDATORIO] Eliminando recordatorio ${id} del deal ${deal.id}`
          )
          setIsUpdating(true)

          const response = await fetch(
            `/api/deals/${deal.id}/recordatorios?recordatorioId=${id}`,
            {
              method: 'DELETE',
            }
          )

          console.log(
            `📊 [DEAL RECORDATORIO] Response status:`,
            response.status
          )

          if (response.ok) {
            const result = await response.json()
            console.log(
              `✅ [DEAL RECORDATORIO] Recordatorio eliminado:`,
              result
            )
            // Recargar recordatorios desde la API
            await fetchRecordatorios()
            showToast('Recordatorio eliminado correctamente', 'success')
          } else {
            let errorMessage = 'Error al eliminar recordatorio'
            try {
              const errorData = await response.json()
              console.error(`❌ [DEAL RECORDATORIO] Error response:`, errorData)
              if (errorData && (errorData.details || errorData.error)) {
                errorMessage = `Error al eliminar recordatorio: ${errorData.details || errorData.error}`
              } else {
                errorMessage = `Error al eliminar recordatorio (${response.status}): ${response.statusText}`
              }
            } catch (parseError) {
              console.error(
                `❌ [DEAL RECORDATORIO] Error parsing response:`,
                parseError
              )
              errorMessage = `Error al eliminar recordatorio (${response.status}): ${response.statusText}`
            }
            showToast(errorMessage, 'error')
          }
        } catch (error) {
          console.error(
            '❌ [DEAL RECORDATORIO] Error eliminando recordatorio:',
            error
          )
          showToast('Error de conexión al eliminar recordatorio', 'error')
        } finally {
          setIsUpdating(false)
        }
      },
      'danger'
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando deal...</p>
        </div>
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Deal no encontrado
          </h1>
          <button
            onClick={() => router.push('/deals')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Volver a Deals
          </button>
        </div>
      </div>
    )
  }

  const canGenerateContratoVenta =
    deal.contratoReserva && deal.estado === 'reservado'
  const canGenerateFactura = deal.contratoVenta && deal.estado === 'vendido'

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        <ToastContainer />

        {showCondicionesPago && (
          <CondicionesPagoModal
            precioVenta={deal.importeTotal || 0}
            isSubmitting={isGeneratingVenta}
            onConfirm={handleCondicionesPagoConfirmadas}
            onClose={() => setShowCondicionesPago(false)}
          />
        )}

        {/* Header */}
        <div className="bg-white shadow-sm border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => router.push('/deals')}
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
                    {deal.numero}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {deal.cliente?.nombre} {deal.cliente?.apellidos} •{' '}
                    {deal.vehiculo?.marca} {deal.vehiculo?.modelo}
                  </p>
                </div>
              </div>
              <EstadoBadge entidad="deal" valor={deal.estado} size="md" />
            </div>
          </div>
        </div>

        {/* Siguiente paso del flujo de venta */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <DealNextStep
            estado={deal.estado}
            tieneContratoReserva={Boolean(deal.contratoReserva)}
            tieneContratoVenta={Boolean(deal.contratoVenta)}
            // El backend pone estado=facturado al emitir y lo devuelve a vendido
            // al rectificar: el estado es la única señal fiable de factura activa.
            tieneFacturaActiva={
              normalizarDealEstado(deal.estado) === 'facturado'
            }
            fechaReservaExpira={deal.fechaReservaExpira ?? null}
            cambioNombre={{
              solicitado: deal.cambioNombreSolicitado,
              documentacionRecibida: deal.documentacionRecibida,
              clienteAvisado: deal.clienteAvisado,
              documentacionRetirada: deal.documentacionRetirada,
            }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Panel Principal */}
            <div className="lg:col-span-2 space-y-6">
              {/* Documentos */}
              <div
                id={DEAL_ANCHOR_DOCUMENTOS}
                className="scroll-mt-4 bg-white rounded-xl shadow-sm border border-slate-200 p-6"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Documentos
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Generar Contrato de Reserva */}
                  <div className="text-center">
                    <button
                      onClick={handleGenerarContratoReserva}
                      disabled={Boolean(
                        isGeneratingReserva || deal.contratoReserva
                      )}
                      className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
                        deal.contratoReserva
                          ? 'bg-green-100 text-green-700 cursor-not-allowed'
                          : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                      }`}
                    >
                      {deal.contratoReserva ? (
                        <div className="flex items-center justify-center space-x-2">
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
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>Contrato Generado</span>
                        </div>
                      ) : isGeneratingReserva ? (
                        <div className="flex items-center justify-center space-x-2">
                          <svg
                            className="w-5 h-5 animate-spin"
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
                          <span>Generando...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-2">
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
                          <span>Generar Contrato de Reserva</span>
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Generar Contrato de Venta */}
                  <div className="text-center">
                    <button
                      onClick={handleGenerarContratoVenta}
                      disabled={Boolean(
                        isGeneratingVenta ||
                          !canGenerateContratoVenta ||
                          deal.contratoVenta
                      )}
                      className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
                        deal.contratoVenta
                          ? 'bg-green-100 text-green-700 cursor-not-allowed'
                          : !canGenerateContratoVenta
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                    >
                      {deal.contratoVenta ? (
                        <div className="flex items-center justify-center space-x-2">
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
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>Contrato Generado</span>
                        </div>
                      ) : isGeneratingVenta ? (
                        <div className="flex items-center justify-center space-x-2">
                          <svg
                            className="w-5 h-5 animate-spin"
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
                          <span>Generando...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-2">
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
                          <span>Generar Contrato de Venta</span>
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* New invoicing module — fiscal sequence, audit, history */}
              <div id={DEAL_ANCHOR_FACTURACION} className="scroll-mt-4">
                <DealInvoiceSection
                  saleId={deal.id}
                  legacyFacturaName={deal.factura ?? null}
                  legacyFacturaDate={
                    deal.fechaFacturada
                      ? new Date(deal.fechaFacturada).toISOString()
                      : null
                  }
                  // Refresco silencioso: el spinner de página desmonta la sección y
                  // perdería la factura recién emitida (y su toast).
                  onInvoiceIssued={() => fetchDeal({ silent: true })}
                />
              </div>

              {/* Información de Reserva */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Información de Reserva
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Cliente */}
                  <Link
                    href={
                      deal.cliente
                        ? `/clientes/${generateClienteSlug(deal.cliente)}`
                        : '#'
                    }
                    className="group"
                  >
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer">
                      <div className="flex items-center space-x-2 mb-2">
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
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 text-base">
                            Cliente
                          </h3>
                          <p className="text-sm text-gray-600">
                            Ver perfil completo
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">
                            Nombre:
                          </span>
                          <p className="text-gray-900 font-semibold group-hover:text-blue-700 truncate">
                            {deal.cliente?.nombre} {deal.cliente?.apellidos}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">
                            Teléfono:
                          </span>
                          <p className="text-gray-900 truncate">
                            {deal.cliente?.telefono || 'No especificado'}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <span className="font-medium text-gray-700">
                            Email:
                          </span>
                          <p className="text-gray-900 truncate">
                            {deal.cliente?.email || 'No especificado'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* Vehículo */}
                  <Link
                    href={`/vehiculos/${deal.vehiculo?.id}-${deal.vehiculo?.marca?.toLowerCase()}-${deal.vehiculo?.modelo?.toLowerCase()}`}
                    className="group"
                  >
                    <div className="bg-green-50 rounded-lg p-3 border border-green-200 hover:bg-green-100 transition-colors cursor-pointer">
                      <div className="flex items-center space-x-2 mb-2">
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
                              d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
                            />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 text-base">
                            Vehículo
                          </h3>
                          <p className="text-sm text-gray-600">
                            Ver en inventario
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">
                            Modelo:
                          </span>
                          <p className="text-gray-900 font-semibold group-hover:text-green-700 truncate">
                            {deal.vehiculo?.marca} {deal.vehiculo?.modelo}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">
                            Matrícula:
                          </span>
                          <p className="text-gray-900 font-mono truncate">
                            {deal.vehiculo?.matricula}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <span className="font-medium text-gray-700">
                            Referencia:
                          </span>
                          <p className="text-gray-900 font-mono truncate">
                            {deal.vehiculo?.referencia}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* Información Financiera */}
                  <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-lg">€</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 text-base">
                          Financiero
                        </h3>
                        <p className="text-sm text-gray-600">
                          Detalles de pago
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">
                          Total:
                        </span>
                        <p className="text-gray-900 font-semibold">
                          {deal.importeTotal
                            ? formatCurrency(deal.importeTotal)
                            : 'No especificado'}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Seña:</span>
                        <p className="text-gray-900 font-semibold">
                          {deal.importeSena
                            ? formatCurrency(deal.importeSena)
                            : 'No especificado'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className="font-medium text-gray-700">
                          Falta abonar:
                        </span>
                        <p className="text-gray-900 font-semibold">
                          {deal.importeTotal && deal.importeSena
                            ? formatCurrency(
                                deal.importeTotal - deal.importeSena
                              )
                            : deal.restoAPagar
                              ? formatCurrency(deal.restoAPagar)
                              : 'No especificado'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Fechas */}
                  <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                    <div className="flex items-center space-x-2 mb-2">
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
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 text-base">
                          Fechas
                        </h3>
                        <p className="text-sm text-gray-600">
                          Cronología del deal
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">
                          Reserva:
                        </span>
                        <p className="text-gray-900 font-semibold">
                          {deal.fechaReservaDesde
                            ? new Date(
                                deal.fechaReservaDesde
                              ).toLocaleDateString('es-ES')
                            : 'No especificada'}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">
                          Expira:
                        </span>
                        <p className="text-gray-900 font-semibold">
                          {deal.fechaReservaExpira
                            ? new Date(
                                deal.fechaReservaExpira
                              ).toLocaleDateString('es-ES')
                            : 'No especificada'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className="font-medium text-gray-700">
                          Estado:
                        </span>
                        <EstadoBadge
                          entidad="deal"
                          valor={deal.estado}
                          className="ml-2"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Información de Venta */}
              <DealVentaInfo
                dealId={deal.id}
                initialData={{
                  montoVenta: deal.importeTotal,
                  formaPago:
                    (deal.formaPagoSena as
                      | 'contado'
                      | 'financiado'
                      | 'mixto') || 'contado',
                  garantia: 'standard' as 'premium' | 'standard',
                  entidadFinanciera: deal.entidadFinanciera,
                }}
                onUpdate={(data) => {
                  // Aquí podrías actualizar el estado del deal si es necesario
                  // console.log('Venta info updated:', data)
                }}
              />

              {/* Cambio de Nombre */}
              <div
                id={DEAL_ANCHOR_CAMBIO_NOMBRE}
                className={`scroll-mt-4 rounded-xl shadow-sm border p-6 ${
                  deal.estado === 'facturado'
                    ? 'bg-white border-slate-200'
                    : 'bg-gray-100 border-gray-300'
                }`}
              >
                <h2
                  className={`text-lg font-semibold mb-4 ${
                    deal.estado === 'facturado'
                      ? 'text-gray-900'
                      : 'text-gray-500'
                  }`}
                >
                  Cambio de Nombre
                  {deal.estado !== 'facturado' && (
                    <span className="text-sm font-normal text-gray-400 ml-2">
                      (Disponible solo después de generar la factura)
                    </span>
                  )}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Cambio de nombre solicitado */}
                  <div
                    className={`rounded-lg p-4 border ${
                      deal.estado === 'facturado'
                        ? 'bg-orange-50 border-orange-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="cambioNombreSolicitado"
                        checked={deal.cambioNombreSolicitado}
                        onChange={handleCambioNombreChange}
                        disabled={deal.estado !== 'facturado'}
                        className={`w-5 h-5 rounded focus:ring-2 ${
                          deal.estado === 'facturado'
                            ? 'text-orange-600 bg-gray-100 border-gray-300 focus:ring-orange-500'
                            : 'text-gray-400 bg-gray-200 border-gray-300 cursor-not-allowed'
                        }`}
                      />
                      <label
                        htmlFor="cambioNombreSolicitado"
                        className={`text-sm font-medium cursor-pointer ${
                          deal.estado === 'facturado'
                            ? 'text-orange-800'
                            : 'text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        Cambio de nombre solicitado
                      </label>
                    </div>
                  </div>

                  {/* Documentación recibida */}
                  <div
                    className={`rounded-lg p-4 border ${
                      deal.estado === 'facturado'
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="documentacionRecibida"
                        checked={deal.documentacionRecibida}
                        onChange={handleCambioNombreChange}
                        disabled={deal.estado !== 'facturado'}
                        className={`w-5 h-5 rounded focus:ring-2 ${
                          deal.estado === 'facturado'
                            ? 'text-green-600 bg-gray-100 border-gray-300 focus:ring-green-500'
                            : 'text-gray-400 bg-gray-200 border-gray-300 cursor-not-allowed'
                        }`}
                      />
                      <label
                        htmlFor="documentacionRecibida"
                        className={`text-sm font-medium cursor-pointer ${
                          deal.estado === 'facturado'
                            ? 'text-green-800'
                            : 'text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        Documentación recibida
                      </label>
                    </div>
                  </div>

                  {/* Cliente avisado */}
                  <div
                    className={`rounded-lg p-4 border ${
                      deal.estado === 'facturado'
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="clienteAvisado"
                        checked={deal.clienteAvisado}
                        onChange={handleCambioNombreChange}
                        disabled={deal.estado !== 'facturado'}
                        className={`w-5 h-5 rounded focus:ring-2 ${
                          deal.estado === 'facturado'
                            ? 'text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500'
                            : 'text-gray-400 bg-gray-200 border-gray-300 cursor-not-allowed'
                        }`}
                      />
                      <label
                        htmlFor="clienteAvisado"
                        className={`text-sm font-medium cursor-pointer ${
                          deal.estado === 'facturado'
                            ? 'text-blue-800'
                            : 'text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        Cliente avisado
                      </label>
                    </div>
                  </div>

                  {/* Documentación retirada */}
                  <div
                    className={`rounded-lg p-4 border ${
                      deal.estado === 'facturado'
                        ? 'bg-purple-50 border-purple-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="documentacionRetirada"
                        checked={deal.documentacionRetirada}
                        onChange={handleCambioNombreChange}
                        disabled={deal.estado !== 'facturado'}
                        className={`w-5 h-5 rounded focus:ring-2 ${
                          deal.estado === 'facturado'
                            ? 'text-purple-600 bg-gray-100 border-gray-300 focus:ring-purple-500'
                            : 'text-gray-400 bg-gray-200 border-gray-300 cursor-not-allowed'
                        }`}
                      />
                      <label
                        htmlFor="documentacionRetirada"
                        className={`text-sm font-medium cursor-pointer ${
                          deal.estado === 'facturado'
                            ? 'text-purple-800'
                            : 'text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        Documentación retirada
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mensajes al cliente (email / WhatsApp) */}
              <DealMensajes deal={deal} />

              {/* Notas */}
              {deal?.id ? (
                <NotasSection
                  notas={notas}
                  onNotasChange={setNotas}
                  entityId={deal.id}
                  entityType="deal"
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

            {/* Panel Lateral */}
            <div className="space-y-6">
              {/* Documentación */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Documentación
                </h2>

                <div className="space-y-3">
                  {/* Contrato de Reserva */}
                  <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          deal.contratoReserva ? 'bg-green-100' : 'bg-gray-100'
                        }`}
                      >
                        <svg
                          className={`w-4 h-4 ${deal.contratoReserva ? 'text-green-600' : 'text-gray-400'}`}
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
                        <p className="font-medium text-gray-900">
                          Contrato de Reserva
                        </p>
                        <p className="text-sm text-gray-500">
                          {deal.contratoReserva ? 'Generado' : 'No generado'}
                        </p>
                      </div>
                    </div>
                    {deal.contratoReserva ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={handleDescargarContratoReserva}
                          disabled={isUpdating}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-200 transition-colors"
                        >
                          Descargar
                        </button>
                        <button
                          onClick={handleAnularContratoReserva}
                          disabled={isUpdating}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded-md text-sm font-medium hover:bg-red-200 transition-colors"
                        >
                          Anular
                        </button>
                      </div>
                    ) : (
                      <span className="px-3 py-1 bg-gray-100 text-gray-400 rounded-md text-sm font-medium cursor-not-allowed">
                        No generado
                      </span>
                    )}
                  </div>

                  {/* Contrato de Venta */}
                  <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          deal.contratoVenta ? 'bg-green-100' : 'bg-gray-100'
                        }`}
                      >
                        <svg
                          className={`w-4 h-4 ${deal.contratoVenta ? 'text-green-600' : 'text-gray-400'}`}
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
                        <p className="font-medium text-gray-900">
                          Contrato de Venta
                        </p>
                        <p className="text-sm text-gray-500">
                          {deal.contratoVenta ? 'Generado' : 'No generado'}
                        </p>
                      </div>
                    </div>
                    {deal.contratoVenta ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={handleDescargarContratoVenta}
                          disabled={isUpdating}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-200 transition-colors"
                        >
                          Descargar
                        </button>
                        <button
                          onClick={handleAnularContratoVenta}
                          disabled={isUpdating}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded-md text-sm font-medium hover:bg-red-200 transition-colors"
                        >
                          Anular
                        </button>
                      </div>
                    ) : (
                      <span className="px-3 py-1 bg-gray-100 text-gray-400 rounded-md text-sm font-medium cursor-not-allowed">
                        No generado
                      </span>
                    )}
                  </div>

                  {/* Factura emitida por el sistema anterior (solo deals antiguos) */}
                  {deal.factura && (
                    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-100">
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
                              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            Factura del sistema anterior
                          </p>
                          <p className="text-sm text-gray-500">
                            {deal.factura}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleDescargarFactura}
                        disabled={isUpdating}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-200 transition-colors"
                      >
                        Descargar
                      </button>
                    </div>
                  )}

                  {/* Mandato Gestoría */}
                  <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          getDocumentFile('mandato_gestoria')
                            ? 'bg-green-100'
                            : 'bg-gray-100'
                        }`}
                      >
                        <svg
                          className={`w-4 h-4 ${
                            getDocumentFile('mandato_gestoria')
                              ? 'text-green-600'
                              : 'text-gray-400'
                          }`}
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
                        <p className="font-medium text-gray-900">
                          Mandato Gestoría
                        </p>
                        <p className="text-sm text-gray-500">
                          {getDocumentFile('mandato_gestoria')
                            ? 'Archivo disponible'
                            : 'No hay archivo subido'}
                        </p>
                      </div>
                    </div>
                    {getDocumentFile('mandato_gestoria') ? (
                      <a
                        href={getDocumentFile('mandato_gestoria').url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-green-100 text-green-700 rounded-md text-sm font-medium hover:bg-green-200"
                      >
                        Imprimir
                      </a>
                    ) : (
                      <Link
                        href="/documentacion"
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-200"
                      >
                        Subir
                      </Link>
                    )}
                  </div>

                  {/* Contrato Parte 2 */}
                  <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          getDocumentFile('contrato_parte2')
                            ? 'bg-green-100'
                            : 'bg-gray-100'
                        }`}
                      >
                        <svg
                          className={`w-4 h-4 ${
                            getDocumentFile('contrato_parte2')
                              ? 'text-green-600'
                              : 'text-gray-400'
                          }`}
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
                        <p className="font-medium text-gray-900">
                          Contrato Parte 2
                        </p>
                        <p className="text-sm text-gray-500">
                          {getDocumentFile('contrato_parte2')
                            ? 'Archivo disponible'
                            : 'No hay archivo subido'}
                        </p>
                      </div>
                    </div>
                    {getDocumentFile('contrato_parte2') ? (
                      <a
                        href={getDocumentFile('contrato_parte2').url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-green-100 text-green-700 rounded-md text-sm font-medium hover:bg-green-200"
                      >
                        Imprimir
                      </a>
                    ) : (
                      <Link
                        href="/documentacion"
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-200"
                      >
                        Subir
                      </Link>
                    )}
                  </div>

                  {/* Hoja de Garantía */}
                  <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          getDocumentFile('hoja_garantia')
                            ? 'bg-green-100'
                            : 'bg-gray-100'
                        }`}
                      >
                        <svg
                          className={`w-4 h-4 ${
                            getDocumentFile('hoja_garantia')
                              ? 'text-green-600'
                              : 'text-gray-400'
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          Hoja de Garantía
                        </p>
                        <p className="text-sm text-gray-500">
                          {getDocumentFile('hoja_garantia')
                            ? 'Archivo disponible'
                            : 'No hay archivo subido'}
                        </p>
                      </div>
                    </div>
                    {getDocumentFile('hoja_garantia') ? (
                      <a
                        href={getDocumentFile('hoja_garantia').url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-green-100 text-green-700 rounded-md text-sm font-medium hover:bg-green-200"
                      >
                        Imprimir
                      </a>
                    ) : (
                      <Link
                        href="/documentacion"
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-200"
                      >
                        Subir
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Información Adicional Compacta */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  Información del Deal
                </h2>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="font-medium text-gray-700">
                      Creado por:
                    </span>
                    <p className="text-gray-900">
                      {deal.responsableComercial || 'No asignado'}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">
                      Fecha creación:
                    </span>
                    <p className="text-gray-900">
                      {new Date(deal.fechaCreacion).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="font-medium text-gray-700">
                      Última actualización:
                    </span>
                    <p className="text-gray-900">
                      {new Date(deal.updatedAt).toLocaleDateString('es-ES')}{' '}
                      {new Date(deal.updatedAt).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Historial de Acciones */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  Historial de Acciones
                </h2>

                <div className="space-y-2">
                  {(showAllHistorial
                    ? getHistorialAcciones(deal, user)
                    : getHistorialAcciones(deal, user).slice(0, 3)
                  ).map((accion, index) => (
                    <div
                      key={index}
                      className="flex items-start space-x-2 text-xs"
                    >
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                      <div className="flex-1">
                        <p className="text-gray-900 font-medium">
                          {accion.accion}
                        </p>
                        <p className="text-gray-500">
                          {accion.fecha.toLocaleDateString('es-ES')} a las{' '}
                          {accion.fecha.toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          por {accion.usuario || 'Usuario'}
                        </p>
                      </div>
                    </div>
                  ))}

                  {getHistorialAcciones(deal, user).length > 3 && (
                    <button
                      onClick={() => setShowAllHistorial(!showAllHistorial)}
                      className="text-blue-600 text-xs font-medium hover:text-blue-800 mt-2"
                    >
                      {showAllHistorial
                        ? 'Ver menos'
                        : `Ver más (${getHistorialAcciones(deal, user).length - 3} más)`}
                    </button>
                  )}

                  {getHistorialAcciones(deal, user).length === 0 && (
                    <p className="text-gray-500 text-xs">
                      No hay acciones registradas
                    </p>
                  )}
                </div>
              </div>

              {/* Recordatorios */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Recordatorios
                  </h2>
                  <button
                    onClick={() =>
                      setShowRecordatorioForm(!showRecordatorioForm)
                    }
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {showRecordatorioForm ? 'Cancelar' : 'Agregar recordatorio'}
                  </button>
                </div>

                {/* Formulario para agregar nuevo recordatorio */}
                {showRecordatorioForm && (
                  <div className="mb-4 space-y-3 p-4 bg-gray-50 rounded-lg border">
                    <input
                      type="text"
                      value={nuevoRecordatorio.titulo}
                      onChange={(e) =>
                        setNuevoRecordatorio({
                          ...nuevoRecordatorio,
                          titulo: e.target.value,
                        })
                      }
                      placeholder="Título del recordatorio..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <input
                      type="datetime-local"
                      value={nuevoRecordatorio.fecha}
                      onChange={(e) =>
                        setNuevoRecordatorio({
                          ...nuevoRecordatorio,
                          fecha: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <textarea
                      value={nuevoRecordatorio.descripcion}
                      onChange={(e) =>
                        setNuevoRecordatorio({
                          ...nuevoRecordatorio,
                          descripcion: e.target.value,
                        })
                      }
                      placeholder="Descripción..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={2}
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={handleAgregarRecordatorio}
                        disabled={
                          !nuevoRecordatorio.titulo.trim() ||
                          !nuevoRecordatorio.fecha
                        }
                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        Agregar Recordatorio
                      </button>
                      <button
                        onClick={() => setShowRecordatorioForm(false)}
                        className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista de recordatorios */}
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
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={recordatorio.completado}
                              onChange={() =>
                                handleCompletarRecordatorio(recordatorio.id)
                              }
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <h4
                              className={`font-medium ${
                                recordatorio.completado
                                  ? 'text-green-700 line-through'
                                  : 'text-gray-900'
                              }`}
                            >
                              {recordatorio.titulo}
                            </h4>
                          </div>
                          <p
                            className={`text-sm mt-1 ${
                              recordatorio.completado
                                ? 'text-green-600'
                                : 'text-gray-600'
                            }`}
                          >
                            {recordatorio.descripcion}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {recordatorio.fecha.toLocaleDateString()}{' '}
                            {recordatorio.fecha.toLocaleTimeString()}
                          </p>
                        </div>

                        <button
                          onClick={() =>
                            handleEliminarRecordatorio(recordatorio.id)
                          }
                          className="ml-4 p-2 text-gray-400 hover:text-red-600 transition-colors"
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
                    </div>
                  ))}
                </div>
              </div>

              {/* Botón Anular Reserva */}
              {(deal.estado === 'nuevo' || deal.estado === 'reservado') && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="text-center">
                    <button
                      onClick={() => setShowCancelModal(true)}
                      disabled={isUpdating}
                      className="px-6 py-3 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg
                        className="w-5 h-5 inline mr-2"
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
                      Anular Reserva
                    </button>
                    <p className="text-sm text-gray-500 mt-2">
                      Esto eliminará el deal y liberará el vehículo
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal de Confirmación */}
        {showCancelModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  ¿Anular Reserva?
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  ¿Estás seguro de que quieres anular la reserva del deal{' '}
                  <strong>{deal?.numero}</strong>?<br />
                  <br />
                  Esto liberará el vehículo{' '}
                  <strong>
                    {deal?.vehiculo?.marca} {deal?.vehiculo?.modelo}
                  </strong>{' '}
                  y eliminará el deal permanentemente.
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowCancelModal(false)}
                    disabled={isUpdating}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAnularReserva}
                    disabled={isUpdating}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {isUpdating ? 'Anulando...' : 'Sí, Anular'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <ConfirmModalComponent />
      </div>
    </ProtectedRoute>
  )
}
