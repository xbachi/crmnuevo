'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Cliente } from '@/lib/database'

interface NotaCliente {
  id: number
  clienteId: number
  tipo: string
  titulo: string
  contenido: string
  prioridad: string
  completada: boolean
  fecha: string
  usuario: string
  createdAt: string
}
import { useSimpleToast } from '@/hooks/useSimpleToast'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import ClientReminders from '@/components/ClientReminders'
import { useConfirmModal } from '@/components/ConfirmModal'

export default function ClienteDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { showToast, ToastContainer } = useSimpleToast()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [nuevaNota, setNuevaNota] = useState('')
  const [nuevoTitulo, setNuevoTitulo] = useState('')
  const [notasCliente, setNotasCliente] = useState<NotaCliente[]>([])
  const [editingNotaId, setEditingNotaId] = useState<number | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [editingTitulo, setEditingTitulo] = useState('')
  const [isEditingPersonal, setIsEditingPersonal] = useState(false)
  const [isEditingIntereses, setIsEditingIntereses] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [currentVehiculoInput, setCurrentVehiculoInput] = useState('')

  const [editData, setEditData] = useState({
    nombre: '',
    apellidos: '',
    telefono: '',
    email: '',
    dni: '',
    direccion: '',
    ciudad: '',
    provincia: '',
    codigoPostal: '',
    comoLlego: '',
    fechaPrimerContacto: '',
    estado: 'nuevo' as const,
    prioridad: 'media' as const,
    proximoPaso: '',
    etiquetas: [] as string[],
    intereses: {
      vehiculosInteres: [] as string[],
      precioMaximo: 0,
      kilometrajeMaximo: 0,
      añoMinimo: 0,
      combustiblePreferido: 'cualquiera' as const,
      cambioPreferido: 'cualquiera' as const,
      coloresDeseados: [] as string[],
      necesidadesEspeciales: [] as string[],
      formaPagoPreferida: 'cualquiera' as const,
    },
  })

  const clienteId = params.id as string

  // Función auxiliar para mapear datos de la API al formato del frontend
  const mapApiDataToFrontend = (data: any) => {
    // Mapear datos de la base de datos al formato de intereses
    let interesesData = {
      vehiculosInteres: [],
      precioMaximo: 0,
      kilometrajeMaximo: 0,
      añoMinimo: 0,
      combustiblePreferido: 'cualquiera',
      cambioPreferido: 'cualquiera',
      coloresDeseados: [],
      necesidadesEspeciales: [],
      formaPagoPreferida: 'cualquiera',
    }

    // Si hay datos de vehículos interesados
    if (data.vehiculosInteres) {
      try {
        interesesData.vehiculosInteres = JSON.parse(data.vehiculosInteres)
      } catch (e) {
        interesesData.vehiculosInteres = []
      }
    }

    // Si hay presupuesto máximo
    if (data.presupuestoMaximo) {
      interesesData.precioMaximo = data.presupuestoMaximo
    }

    // Mapear campos individuales de la base de datos
    if (data.kilometrajeMaximo)
      interesesData.kilometrajeMaximo = data.kilometrajeMaximo
    if (data.añoMinimo) interesesData.añoMinimo = data.añoMinimo
    if (data.combustiblePreferido)
      interesesData.combustiblePreferido = data.combustiblePreferido
    if (data.cambioPreferido)
      interesesData.cambioPreferido = data.cambioPreferido
    if (data.formaPagoPreferida)
      interesesData.formaPagoPreferida = data.formaPagoPreferida

    // Parsear campos JSON
    if (data.coloresDeseados) {
      try {
        interesesData.coloresDeseados = JSON.parse(data.coloresDeseados)
      } catch (e) {
        interesesData.coloresDeseados = []
      }
    }

    if (data.necesidadesEspeciales) {
      try {
        interesesData.necesidadesEspeciales = JSON.parse(
          data.necesidadesEspeciales
        )
      } catch (e) {
        interesesData.necesidadesEspeciales = []
      }
    }

    // Parsear etiquetas
    let etiquetas = []
    if (data.etiquetas) {
      try {
        etiquetas =
          typeof data.etiquetas === 'string'
            ? JSON.parse(data.etiquetas)
            : data.etiquetas
      } catch (e) {
        etiquetas = []
      }
    }

    return {
      ...data,
      intereses: interesesData,
      etiquetas: etiquetas,
    }
  }

  const fetchCliente = async () => {
    try {
      setIsLoading(true)
      console.log('Fetching cliente with ID:', clienteId)
      const response = await fetch(`/api/clientes/${clienteId}`)
      console.log('Response status:', response.status, response.ok)

      if (!response.ok) {
        const errorData = await response.json()
        console.error('API Error:', errorData)
        throw new Error(errorData.error || 'Cliente no encontrado')
      }

      const data = await response.json()
      console.log('Cliente data received:', data)

      // Mapear datos de la base de datos al formato de intereses
      let interesesData = {
        vehiculosInteres: [],
        precioMaximo: 0,
        kilometrajeMaximo: 0,
        añoMinimo: 0,
        combustiblePreferido: 'cualquiera',
        cambioPreferido: 'cualquiera',
        coloresDeseados: [],
        necesidadesEspeciales: [],
        formaPagoPreferida: 'cualquiera',
      }

      // Si hay datos de vehículos interesados
      if (data.vehiculosInteres) {
        try {
          interesesData.vehiculosInteres = JSON.parse(data.vehiculosInteres)
        } catch (e) {
          interesesData.vehiculosInteres = []
        }
      }

      // Si hay presupuesto máximo
      if (data.presupuestoMaximo) {
        interesesData.precioMaximo = data.presupuestoMaximo
      }

      // Mapear campos individuales de la base de datos
      if (data.kilometrajeMaximo)
        interesesData.kilometrajeMaximo = data.kilometrajeMaximo
      if (data.añoMinimo) interesesData.añoMinimo = data.añoMinimo
      if (data.combustiblePreferido)
        interesesData.combustiblePreferido = data.combustiblePreferido
      if (data.cambioPreferido)
        interesesData.cambioPreferido = data.cambioPreferido
      if (data.formaPagoPreferida)
        interesesData.formaPagoPreferida = data.formaPagoPreferida

      // Parsear campos JSON
      if (data.coloresDeseados) {
        try {
          interesesData.coloresDeseados = JSON.parse(data.coloresDeseados)
        } catch (e) {
          interesesData.coloresDeseados = []
        }
      }

      if (data.necesidadesEspeciales) {
        try {
          interesesData.necesidadesEspeciales = JSON.parse(
            data.necesidadesEspeciales
          )
        } catch (e) {
          interesesData.necesidadesEspeciales = []
        }
      }

      // Parsear etiquetas correctamente
      let etiquetasParsed = []
      if (data.etiquetas) {
        if (typeof data.etiquetas === 'string') {
          try {
            etiquetasParsed = JSON.parse(data.etiquetas)
          } catch (e) {
            etiquetasParsed = []
          }
        } else if (Array.isArray(data.etiquetas)) {
          etiquetasParsed = data.etiquetas
        }
      }

      setCliente({
        ...data,
        intereses: interesesData,
        etiquetas: etiquetasParsed,
      })
      setEditData({
        nombre: data.nombre,
        apellidos: data.apellidos,
        telefono: data.telefono,
        email: data.email || '',
        dni: data.dni || '',
        direccion: data.direccion || '',
        ciudad: data.ciudad || '',
        provincia: data.provincia || '',
        codigoPostal: data.codigoPostal || '',
        comoLlego: data.comoLlego,
        fechaPrimerContacto: data.fechaPrimerContacto,
        estado: data.estado,
        prioridad: data.prioridad,
        proximoPaso: data.proximoPaso || '',
        etiquetas: etiquetasParsed,
        intereses: interesesData,
      })
    } catch (error) {
      console.error('Error fetching cliente:', error)
      showToast(`Error al cargar cliente: ${error.message}`, 'error')
      // No redirigir automáticamente, dejar que el usuario vea el error
    } finally {
      setIsLoading(false)
    }
  }

  const fetchNotas = async () => {
    try {
      console.log(`🔍 Cargando notas para cliente ${clienteId}`)
      const response = await fetch(`/api/clientes/${clienteId}/notas`)
      console.log(`📊 Response status:`, response.status)

      if (response.ok) {
        const notas = await response.json()
        console.log(`✅ Notas cargadas:`, notas)
        setNotasCliente(notas)
      } else {
        const errorData = await response.json()
        console.error(`❌ Error response:`, errorData)

        // Si el error es por tabla que no existe, mostrar mensaje informativo pero no error
        if (errorData.code === '42P01') {
          console.log(
            `💡 Tabla NotaCliente no existe, usando sistema básico de notas`
          )
          showToast(
            'Sistema de notas actualizándose, por favor ejecuta el script de BD',
            'warning'
          )
        } else {
          showToast(
            `Error cargando notas: ${errorData.details || errorData.error}`,
            'error'
          )
        }
      }
    } catch (error) {
      console.error('❌ Error cargando notas:', error)
      showToast('Error de conexión al cargar notas', 'error')
    }
  }

  const handleAgregarNota = async () => {
    if (!cliente || !nuevaNota.trim()) return

    try {
      setIsUpdating(true)
      console.log(`📝 Agregando nota para cliente ${cliente.id}`)
      console.log(`📊 Contenido:`, nuevaNota.trim())

      const response = await fetch(`/api/clientes/${cliente.id}/notas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contenido: nuevaNota.trim(),
          tipo: 'general',
          titulo: 'Nota general',
          usuario: 'Admin',
        }),
      })

      console.log(`📊 Response status:`, response.status)

      if (response.ok) {
        const notaCreada = await response.json()
        console.log(`✅ Nota creada:`, notaCreada)
        setNuevaNota('')
        fetchNotas() // Recargar todas las notas
        showToast('Nota agregada correctamente', 'success')
      } else {
        const errorData = await response.json()
        console.error(`❌ Error response:`, errorData)
        showToast(
          `Error al agregar la nota: ${errorData.details || errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error('❌ Error agregando nota:', error)
      showToast('Error al agregar la nota', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleEditarNota = async (notaId: number) => {
    if (!cliente) return

    try {
      console.log(`✏️ Editando nota ${notaId}`)
      setIsUpdating(true)

      const response = await fetch(`/api/clientes/${cliente.id}/notas`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notaId: notaId,
          contenido: editingContent.trim(),
          tipo: 'general',
          titulo: 'Nota general',
          usuario: 'Admin',
        }),
      })

      console.log(`📊 Response status:`, response.status)

      if (response.ok) {
        const notaEditada = await response.json()
        console.log(`✅ Nota editada:`, notaEditada)
        setEditingNotaId(null)
        setEditingContent('')
        fetchNotas() // Recargar todas las notas
        showToast('Nota editada correctamente', 'success')
      } else {
        const errorData = await response.json()
        console.error(`❌ Error response:`, errorData)
        showToast(
          `Error al editar la nota: ${errorData.details || errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error('❌ Error editando nota:', error)
      showToast('Error al editar la nota', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleEliminarNota = async (notaId: number) => {
    if (!cliente) return

    try {
      console.log(`🗑️ Eliminando nota ${notaId}`)
      setIsUpdating(true)

      const response = await fetch(
        `/api/clientes/${cliente.id}/notas?notaId=${notaId}`,
        {
          method: 'DELETE',
        }
      )

      console.log(`📊 Response status:`, response.status)

      if (response.ok) {
        const result = await response.json()
        console.log(`✅ Nota eliminada:`, result)
        fetchNotas() // Recargar todas las notas
        showToast('Nota eliminada correctamente', 'success')
      } else {
        const errorData = await response.json()
        console.error(`❌ Error response:`, errorData)
        showToast(
          `Error al eliminar la nota: ${errorData.details || errorData.error}`,
          'error'
        )
      }
    } catch (error) {
      console.error('❌ Error eliminando nota:', error)
      showToast('Error al eliminar la nota', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const startEditing = (nota: NotaCliente) => {
    setEditingNotaId(nota.id)
    setEditingContent(nota.contenido || '')
  }

  const cancelEditing = () => {
    setEditingNotaId(null)
    setEditingContent('')
  }

  useEffect(() => {
    fetchCliente()
    fetchNotas()
  }, [clienteId])

  const addVehiculoInteres = () => {
    setEditData((prev) => ({
      ...prev,
      intereses: {
        ...prev.intereses,
        vehiculosInteres: [...(prev.intereses?.vehiculosInteres || []), ''],
      },
    }))
  }

  const updateVehiculoInteres = (index: number, value: string) => {
    setEditData((prev) => ({
      ...prev,
      intereses: {
        ...prev.intereses,
        vehiculosInteres: (prev.intereses?.vehiculosInteres || []).map(
          (v, i) => (i === index ? value : v)
        ),
      },
    }))
  }

  const handleVehiculoKeyPress = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const value = (e.target as HTMLInputElement).value.trim()
      if (value) {
        updateVehiculoInteres(index, value)
        if (index === (editData.intereses?.vehiculosInteres?.length || 0) - 1) {
          setTimeout(() => {
            addVehiculoInteres()
          }, 100)
        }
      }
    }
  }

  const removeVehiculoInteres = (index: number) => {
    setEditData((prev) => ({
      ...prev,
      intereses: {
        ...prev.intereses,
        vehiculosInteres: (prev.intereses?.vehiculosInteres || []).filter(
          (_, i) => i !== index
        ),
      },
    }))
  }

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target
    if (name.startsWith('intereses.')) {
      const field = name.split('.')[1]
      setEditData((prev) => ({
        ...prev,
        intereses: {
          vehiculosInteres: [],
          precioMaximo: 0,
          kilometrajeMaximo: 0,
          añoMinimo: 0,
          combustiblePreferido: 'cualquiera',
          cambioPreferido: 'cualquiera',
          coloresDeseados: [],
          necesidadesEspeciales: [],
          formaPagoPreferida: 'cualquiera',
          ...prev.intereses,
          [field]: value,
        },
      }))
    } else {
      setEditData((prev) => ({
        ...prev,
        [name]: value,
      }))
    }
  }

  const handleSavePersonal = async () => {
    try {
      setIsSaving(true)
      console.log('Saving personal info for cliente with ID:', clienteId)

      // Solo guardar campos de información personal
      const dataToSave = {
        nombre: editData.nombre,
        apellidos: editData.apellidos,
        telefono: editData.telefono,
        email: editData.email,
        dni: editData.dni,
        direccion: editData.direccion,
        ciudad: editData.ciudad,
        provincia: editData.provincia,
        codigoPostal: editData.codigoPostal,
        comoLlego: editData.comoLlego,
        fechaPrimerContacto: editData.fechaPrimerContacto,
        estado: editData.estado,
        prioridad: editData.prioridad,
        proximoPaso: editData.proximoPaso,
        etiquetas: editData.etiquetas
          ? JSON.stringify(editData.etiquetas)
          : null,
      }

      // Limpiar campos undefined
      Object.keys(dataToSave).forEach((key) => {
        if (dataToSave[key] === undefined) {
          delete dataToSave[key]
        }
      })

      console.log('Personal data to save:', dataToSave)

      const response = await fetch(`/api/clientes/${clienteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave),
      })

      if (response.ok) {
        const updatedCliente = await response.json()
        setCliente(updatedCliente)
        // Actualizar también editData para mantener sincronización
        setEditData((prev) => ({
          ...prev,
          nombre: updatedCliente.nombre || '',
          apellidos: updatedCliente.apellidos || '',
          telefono: updatedCliente.telefono || '',
          email: updatedCliente.email || '',
          dni: updatedCliente.dni || '',
          direccion: updatedCliente.direccion || '',
          ciudad: updatedCliente.ciudad || '',
          provincia: updatedCliente.provincia || '',
          codigoPostal: updatedCliente.codigoPostal || '',
          comoLlego: updatedCliente.comoLlego || '',
          fechaPrimerContacto: updatedCliente.fechaPrimerContacto || '',
          estado: updatedCliente.estado || 'nuevo',
          prioridad: updatedCliente.prioridad || 'media',
          proximoPaso: updatedCliente.proximoPaso || '',
          etiquetas: updatedCliente.etiquetas
            ? typeof updatedCliente.etiquetas === 'string'
              ? JSON.parse(updatedCliente.etiquetas)
              : updatedCliente.etiquetas
            : [],
        }))
        setIsEditingPersonal(false)
        showToast('Información personal guardada correctamente', 'success')
        console.log('Personal info saved successfully')
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Error al guardar información personal')
      }
    } catch (error) {
      console.error('Error saving personal info:', error)
      showToast(
        `Error al guardar información personal: ${error.message}`,
        'error'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveIntereses = async () => {
    try {
      setIsSaving(true)
      console.log('Saving intereses for cliente with ID:', clienteId)

      // Solo guardar campos de intereses que tienen valores
      const dataToSave: any = {}

      // Solo incluir campos que tienen valores válidos
      if (
        editData.intereses?.vehiculosInteres &&
        editData.intereses.vehiculosInteres.length > 0
      ) {
        dataToSave.vehiculosInteres = JSON.stringify(
          editData.intereses.vehiculosInteres
        )
      }

      if (
        editData.intereses?.precioMaximo &&
        editData.intereses.precioMaximo > 0
      ) {
        dataToSave.presupuestoMaximo = editData.intereses.precioMaximo
      }

      if (
        editData.intereses?.kilometrajeMaximo &&
        editData.intereses.kilometrajeMaximo > 0
      ) {
        dataToSave.kilometrajeMaximo = editData.intereses.kilometrajeMaximo
      }

      if (editData.intereses?.añoMinimo && editData.intereses.añoMinimo > 0) {
        dataToSave.añoMinimo = editData.intereses.añoMinimo
      }

      if (
        editData.intereses?.combustiblePreferido &&
        editData.intereses.combustiblePreferido !== 'cualquiera'
      ) {
        dataToSave.combustiblePreferido =
          editData.intereses.combustiblePreferido
      }

      if (
        editData.intereses?.cambioPreferido &&
        editData.intereses.cambioPreferido !== 'cualquiera'
      ) {
        dataToSave.cambioPreferido = editData.intereses.cambioPreferido
      }

      if (
        editData.intereses?.coloresDeseados &&
        editData.intereses.coloresDeseados.length > 0
      ) {
        dataToSave.coloresDeseados = JSON.stringify(
          editData.intereses.coloresDeseados
        )
      }

      if (
        editData.intereses?.necesidadesEspeciales &&
        editData.intereses.necesidadesEspeciales.length > 0
      ) {
        dataToSave.necesidadesEspeciales = JSON.stringify(
          editData.intereses.necesidadesEspeciales
        )
      }

      if (
        editData.intereses?.formaPagoPreferida &&
        editData.intereses.formaPagoPreferida !== 'cualquiera'
      ) {
        dataToSave.formaPagoPreferida = editData.intereses.formaPagoPreferida
      }

      console.log('Intereses data to save:', dataToSave)

      const response = await fetch(`/api/clientes/${clienteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave),
      })

      if (response.ok) {
        const updatedClienteData = await response.json()
        console.log('Updated cliente data from API:', updatedClienteData)

        // Mapear los datos actualizados usando la función auxiliar
        const updatedCliente = mapApiDataToFrontend(updatedClienteData)
        console.log('Mapped cliente data:', updatedCliente)

        setCliente(updatedCliente)

        // Actualizar también editData con los datos mapeados
        setEditData({
          nombre: updatedCliente.nombre,
          apellidos: updatedCliente.apellidos,
          telefono: updatedCliente.telefono,
          email: updatedCliente.email || '',
          dni: updatedCliente.dni || '',
          direccion: updatedCliente.direccion || '',
          ciudad: updatedCliente.ciudad || '',
          provincia: updatedCliente.provincia || '',
          codigoPostal: updatedCliente.codigoPostal || '',
          comoLlego: updatedCliente.comoLlego,
          fechaPrimerContacto: updatedCliente.fechaPrimerContacto,
          estado: updatedCliente.estado,
          prioridad: updatedCliente.prioridad,
          proximoPaso: updatedCliente.proximoPaso || '',
          etiquetas: updatedCliente.etiquetas,
          intereses: updatedCliente.intereses,
        })

        setIsEditingIntereses(false)
        showToast('Intereses guardados correctamente', 'success')
        console.log('Intereses saved successfully')
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Error al guardar intereses')
      }
    } catch (error) {
      console.error('Error saving intereses:', error)
      showToast(`Error al guardar intereses: ${error.message}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      console.log('Saving cliente with ID:', clienteId)
      console.log('Edit data:', editData)

      // Mapear campos de intereses a campos de la base de datos
      const dataToSave = {
        ...editData,
        // Mapear campos de intereses a campos válidos de la base de datos
        vehiculosInteres: editData.intereses?.vehiculosInteres
          ? JSON.stringify(editData.intereses.vehiculosInteres)
          : null,
        presupuestoMaximo: editData.intereses?.precioMaximo || null,
        kilometrajeMaximo: editData.intereses?.kilometrajeMaximo || null,
        añoMinimo: editData.intereses?.añoMinimo || null,
        combustiblePreferido: editData.intereses?.combustiblePreferido || null,
        cambioPreferido: editData.intereses?.cambioPreferido || null,
        coloresDeseados: editData.intereses?.coloresDeseados
          ? JSON.stringify(editData.intereses.coloresDeseados)
          : null,
        necesidadesEspeciales: editData.intereses?.necesidadesEspeciales
          ? JSON.stringify(editData.intereses.necesidadesEspeciales)
          : null,
        formaPagoPreferida: editData.intereses?.formaPagoPreferida || null,
        notasAdicionales: editData.intereses?.notasAdicionales || null,
        etiquetas: editData.etiquetas
          ? JSON.stringify(editData.etiquetas)
          : null,
        // Remover el campo intereses ya que no existe en la base de datos
        intereses: undefined,
      }

      // Remover campos undefined
      Object.keys(dataToSave).forEach((key) => {
        if (dataToSave[key] === undefined) {
          delete dataToSave[key]
        }
      })

      console.log('Data to save:', dataToSave)

      const response = await fetch(`/api/clientes/${clienteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSave),
      })

      console.log('Save response status:', response.status, response.ok)

      if (response.ok) {
        await fetchCliente()
        setIsEditing(false)
        showToast('Cliente actualizado correctamente', 'success')
      } else {
        const error = await response.json()
        console.error('Save error:', error)
        showToast(error.error || 'Error al actualizar cliente', 'error')
      }
    } catch (error) {
      console.error('Error saving cliente:', error)
      showToast('Error al actualizar cliente', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'nuevo':
        return 'bg-blue-100 text-blue-800'
      case 'en_seguimiento':
        return 'bg-yellow-100 text-yellow-800'
      case 'cita_agendada':
        return 'bg-purple-100 text-purple-800'
      case 'cerrado':
        return 'bg-green-100 text-green-800'
      case 'descartado':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSkeleton />
        </main>
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Cliente no encontrado
            </h1>
            <button
              onClick={() => router.push('/clientes')}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              Volver a Clientes
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <button
                onClick={() => router.push('/clientes')}
                className="text-gray-500 hover:text-gray-700 mb-2 flex items-center"
              >
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Volver a Clientes
              </button>
              <h1 className="text-3xl font-bold text-slate-800 mb-2">
                {cliente.nombre} {cliente.apellidos}
              </h1>
              <div className="flex items-center space-x-4">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${getEstadoColor(cliente.estado || 'nuevo')}`}
                >
                  {(cliente.estado || 'nuevo').replace('_', ' ')}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${getPrioridadColor(cliente.prioridad || 'media')}`}
                >
                  Prioridad {cliente.prioridad || 'media'}
                </span>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setIsEditingPersonal(!isEditingPersonal)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                {isEditingPersonal ? 'Cancelar Personal' : 'Editar Personal'}
              </button>
              <button
                onClick={() => setIsEditingIntereses(!isEditingIntereses)}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
              >
                {isEditingIntereses ? 'Cancelar Intereses' : 'Editar Intereses'}
              </button>
              <button
                onClick={() => setShowNotaForm(!showNotaForm)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Agregar Nota
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Información del Cliente */}
          <div className="lg:col-span-2 space-y-6">
            {/* Datos Básicos */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Información Personal
                </h2>
                <button
                  onClick={() => setIsEditingPersonal(!isEditingPersonal)}
                  className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors"
                >
                  {isEditingPersonal ? 'Cancelar' : 'Editar'}
                </button>
              </div>

              {isEditingPersonal ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre
                      </label>
                      <input
                        type="text"
                        name="nombre"
                        value={editData.nombre}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Apellidos
                      </label>
                      <input
                        type="text"
                        name="apellidos"
                        value={editData.apellidos}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        name="telefono"
                        value={editData.telefono}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={editData.email}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        DNI
                      </label>
                      <input
                        type="text"
                        name="dni"
                        value={editData.dni}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Ej: 12345678A"
                      />
                    </div>
                  </div>

                  {/* Campos de dirección */}
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                      Dirección (opcional)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Dirección
                        </label>
                        <input
                          type="text"
                          name="direccion"
                          value={editData.direccion}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          placeholder="Ej: Calle Mayor 123"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Ciudad
                        </label>
                        <input
                          type="text"
                          name="ciudad"
                          value={editData.ciudad}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          placeholder="Ej: Valencia"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Provincia
                        </label>
                        <input
                          type="text"
                          name="provincia"
                          value={editData.provincia}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          placeholder="Ej: Valencia"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Código Postal
                        </label>
                        <input
                          type="text"
                          name="codigoPostal"
                          value={editData.codigoPostal}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          placeholder="Ej: 46001"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cómo llegó
                      </label>
                      <select
                        name="comoLlego"
                        value={editData.comoLlego}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="Google">Google</option>
                        <option value="Recomendado">Recomendado</option>
                        <option value="Visita directa">Visita directa</option>
                        <option value="Redes sociales">Redes sociales</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Estado
                      </label>
                      <select
                        name="estado"
                        value={editData.estado}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="nuevo">Nuevo</option>
                        <option value="en_seguimiento">En Seguimiento</option>
                        <option value="cita_agendada">Cita Agendada</option>
                        <option value="cerrado">Cerrado</option>
                        <option value="descartado">Descartado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Prioridad
                      </label>
                      <select
                        name="prioridad"
                        value={editData.prioridad}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="alta">Alta</option>
                        <option value="media">Media</option>
                        <option value="baja">Baja</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setIsEditingPersonal(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSavePersonal}
                      disabled={isSaving}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Información básica */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Teléfono</p>
                      <p className="font-medium text-gray-900">
                        {cliente.telefono}
                      </p>
                    </div>
                    {cliente.email && (
                      <div>
                        <p className="text-sm text-gray-500">Email</p>
                        <p className="font-medium text-gray-900">
                          {cliente.email}
                        </p>
                      </div>
                    )}
                    {cliente.dni && (
                      <div>
                        <p className="text-sm text-gray-500">DNI</p>
                        <p className="font-medium text-gray-900">
                          {cliente.dni}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-500">Cómo llegó</p>
                      <p className="font-medium text-gray-900">
                        {cliente.comoLlego || 'No especificado'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Primer contacto</p>
                      <p className="font-medium text-gray-900">
                        {cliente.fechaPrimerContacto
                          ? new Date(
                              cliente.fechaPrimerContacto
                            ).toLocaleDateString('es-ES')
                          : 'No especificado'}
                      </p>
                    </div>
                  </div>

                  {/* Información de dirección */}
                  {(cliente.direccion ||
                    cliente.ciudad ||
                    cliente.provincia ||
                    cliente.codigoPostal) && (
                    <div className="border-t border-gray-200 pt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">
                        Dirección
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {cliente.direccion && (
                          <div>
                            <p className="text-sm text-gray-500">Dirección</p>
                            <p className="font-medium text-gray-900">
                              {cliente.direccion}
                            </p>
                          </div>
                        )}
                        {cliente.ciudad && (
                          <div>
                            <p className="text-sm text-gray-500">Ciudad</p>
                            <p className="font-medium text-gray-900">
                              {cliente.ciudad}
                            </p>
                          </div>
                        )}
                        {cliente.provincia && (
                          <div>
                            <p className="text-sm text-gray-500">Provincia</p>
                            <p className="font-medium text-gray-900">
                              {cliente.provincia}
                            </p>
                          </div>
                        )}
                        {cliente.codigoPostal && (
                          <div>
                            <p className="text-sm text-gray-500">
                              Código Postal
                            </p>
                            <p className="font-medium text-gray-900">
                              {cliente.codigoPostal}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Intereses */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Intereses del Cliente
                </h2>
                <button
                  onClick={() => setIsEditingIntereses(!isEditingIntereses)}
                  className="px-3 py-1 bg-purple-500 text-white text-sm rounded-md hover:bg-purple-600 transition-colors"
                >
                  {isEditingIntereses ? 'Cancelar' : 'Editar'}
                </button>
              </div>

              {isEditingIntereses ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vehículos de interés
                    </label>
                    <div className="relative">
                      {/* Tags existentes */}
                      <div className="flex flex-wrap gap-2 mb-2 min-h-[40px] p-2 border border-slate-300 rounded-md bg-white">
                        {(editData.intereses?.vehiculosInteres || [])
                          .filter((v) => v.trim())
                          .map((vehiculo, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800 border border-blue-200"
                            >
                              {vehiculo}
                              <button
                                type="button"
                                onClick={() => removeVehiculoInteres(index)}
                                className="ml-2 text-blue-600 hover:text-blue-800"
                              >
                                ×
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
                                setEditData((prev) => ({
                                  ...prev,
                                  intereses: {
                                    ...prev.intereses,
                                    vehiculosInteres: [
                                      ...(
                                        prev.intereses?.vehiculosInteres || []
                                      ).filter((v) => v.trim()),
                                      inputValue,
                                    ],
                                  },
                                }))
                                // Limpiar el input
                                setCurrentVehiculoInput('')
                              }
                            }
                          }}
                          className="flex-1 min-w-[200px] px-2 py-1 border-none outline-none bg-transparent text-sm"
                          placeholder={
                            (editData.intereses?.vehiculosInteres?.length ||
                              0) === 0
                              ? 'Escribe un vehículo y presiona Enter (ej: Fiat Punto)'
                              : 'Agregar otro vehículo...'
                          }
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        💡 Escribe un vehículo y presiona Enter para agregarlo.
                        Puedes agregar múltiples vehículos.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Columna izquierda - coincide con el orden de visualización */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Precio máximo (€)
                      </label>
                      <input
                        type="number"
                        name="intereses.precioMaximo"
                        value={editData.intereses?.precioMaximo || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Kilometraje máximo
                      </label>
                      <input
                        type="number"
                        name="intereses.kilometrajeMaximo"
                        value={editData.intereses?.kilometrajeMaximo || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Combustible preferido
                      </label>
                      <select
                        name="intereses.combustiblePreferido"
                        value={
                          editData.intereses?.combustiblePreferido ||
                          'cualquiera'
                        }
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="cualquiera">Cualquiera</option>
                        <option value="diesel">Diésel</option>
                        <option value="gasolina">Gasolina</option>
                        <option value="hibrido">Híbrido</option>
                        <option value="electrico">Eléctrico</option>
                      </select>
                    </div>

                    {/* Columna derecha - coincide con el orden de visualización */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Año mínimo
                      </label>
                      <input
                        type="number"
                        name="intereses.añoMinimo"
                        value={editData.intereses?.añoMinimo || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cambio preferido
                      </label>
                      <select
                        name="intereses.cambioPreferido"
                        value={
                          editData.intereses?.cambioPreferido || 'cualquiera'
                        }
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="cualquiera">Cualquiera</option>
                        <option value="manual">Manual</option>
                        <option value="automatico">Automático</option>
                      </select>
                    </div>
                    <div>
                      {/* Espacio vacío para mantener el layout simétrico */}
                    </div>
                  </div>

                  {/* Botón de guardar para intereses */}
                  <div className="flex justify-end pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={handleSaveIntereses}
                      disabled={isSaving}
                      className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <svg
                            className="animate-spin h-4 w-4"
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
                          Guardando...
                        </>
                      ) : (
                        <>
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
                          Guardar Intereses
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">
                      Vehículos de interés
                    </p>
                    <div className="font-medium text-gray-900">
                      {cliente.intereses?.vehiculosInteres &&
                      cliente.intereses.vehiculosInteres.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {cliente.intereses.vehiculosInteres
                            .filter((v) => v.trim())
                            .map((vehiculo, index) => (
                              <span
                                key={index}
                                className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium"
                              >
                                {vehiculo}
                              </span>
                            ))}
                        </div>
                      ) : (
                        <span className="text-gray-500">No especificado</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Precio máximo</p>
                    <p className="font-medium text-gray-900">
                      {cliente.intereses?.precioMaximo &&
                      cliente.intereses.precioMaximo > 0
                        ? `€${cliente.intereses.precioMaximo.toLocaleString()}`
                        : 'No especificado'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Kilometraje máximo</p>
                    <p className="font-medium text-gray-900">
                      {cliente.intereses?.kilometrajeMaximo &&
                      cliente.intereses.kilometrajeMaximo > 0
                        ? `${cliente.intereses.kilometrajeMaximo.toLocaleString()} km`
                        : 'No especificado'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Año mínimo</p>
                    <p className="font-medium text-gray-900">
                      {cliente.intereses?.añoMinimo &&
                      cliente.intereses.añoMinimo > 0
                        ? cliente.intereses.añoMinimo
                        : 'No especificado'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">
                      Combustible preferido
                    </p>
                    <p className="font-medium text-gray-900 capitalize">
                      {cliente.intereses?.combustiblePreferido ||
                        'No especificado'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Cambio preferido</p>
                    <p className="font-medium text-gray-900 capitalize">
                      {cliente.intereses?.cambioPreferido || 'No especificado'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Próximo Paso */}
            {cliente.proximoPaso && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">
                  Próximo Paso
                </h3>
                <p className="text-blue-800">{cliente.proximoPaso}</p>
              </div>
            )}

            {/* Notas */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Notas
              </h2>

              {/* Formulario para agregar nota */}
              <div className="mb-4">
                <textarea
                  value={nuevaNota}
                  onChange={(e) => setNuevaNota(e.target.value)}
                  placeholder="Agregar una nueva nota..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                />
                <button
                  onClick={handleAgregarNota}
                  disabled={!nuevaNota.trim()}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Agregar Nota
                </button>
              </div>

              {/* Lista de notas */}
              <div className="space-y-3">
                {notasCliente.map((nota) => (
                  <div
                    key={nota.id}
                    className="border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {editingNotaId === nota.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingContent || ''}
                              onChange={(e) =>
                                setEditingContent(e.target.value)
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                              rows={3}
                            />
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleEditarNota(nota.id)}
                                className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-gray-900">{nota.contenido}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {nota.usuario} •{' '}
                              {new Date(nota.fecha).toLocaleDateString('es-ES')}
                            </p>
                          </>
                        )}
                      </div>
                      {editingNotaId !== nota.id && (
                        <div className="flex space-x-1 ml-2">
                          <button
                            onClick={() => startEditing(nota)}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Editar nota"
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
                            onClick={() => handleEliminarNota(nota.id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            title="Eliminar nota"
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
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Resumen */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Resumen
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Cliente desde</p>
                  <p className="font-medium text-gray-900">
                    {new Date(cliente.createdAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Última actualización</p>
                  <p className="font-medium text-gray-900">
                    {new Date(cliente.updatedAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">
                    Total de interacciones
                  </p>
                  <p className="font-medium text-gray-900">
                    {notasCliente.length}
                  </p>
                </div>
              </div>
            </div>

            {/* Recordatorios */}
            <ClientReminders
              clienteId={cliente.id}
              clienteNombre={`${cliente.nombre} ${cliente.apellidos}`}
            />

            {/* Etiquetas */}
            {cliente.etiquetas &&
              (Array.isArray(cliente.etiquetas)
                ? cliente.etiquetas.length > 0
                : true) && (
                <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Etiquetas
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(cliente.etiquetas)
                      ? cliente.etiquetas
                      : typeof cliente.etiquetas === 'string'
                        ? (() => {
                            try {
                              return JSON.parse(cliente.etiquetas)
                            } catch {
                              return []
                            }
                          })()
                        : []
                    ).map((etiqueta, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 text-gray-800 text-sm rounded-full"
                      >
                        {etiqueta}
                      </span>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </div>
      </main>

      <ToastContainer />
      <ConfirmModalComponent />
    </div>
  )
}
