'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/hooks/useToast'
import { useConfirmModal } from '@/components/ConfirmModal'
import { generarContratoDeposito } from '@/lib/contractGenerator'

interface Deposito {
  id: number
  cliente_id: number
  vehiculo_id: number
  estado: string
  fecha_inicio: string
  fecha_fin?: string
  precio_venta?: number
  comision_porcentaje?: number
  notas?: string
  monto_recibir?: number
  dias_gestion?: number
  multa_retiro_anticipado?: number
  numero_cuenta?: string
  contrato_deposito?: string
  contrato_compra?: string
  created_at: string
  updated_at: string
  cliente: {
    id: number
    nombre: string
    apellidos: string
    email?: string
    telefono?: string
    dni?: string
    direccion?: string
    ciudad?: string
    provincia?: string
    codPostal?: string
  }
  vehiculo: {
    id: number
    referencia: string
    marca: string
    modelo: string
    matricula: string
    bastidor: string
    kms: number
    tipo: string
    fechaMatriculacion?: string
  }
}

interface NotaDeposito {
  id: number
  depositoId: number
  tipo: string
  titulo: string
  contenido: string
  prioridad: string
  completada: boolean
  fecha: string
  usuario: string
  createdAt: string
  updatedAt: string
}

export default function DepositoDetail() {
  const params = useParams()
  const router = useRouter()
  const { showToast, ToastContainer } = useToast()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()
  
  const [deposito, setDeposito] = useState<Deposito | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [nuevaNota, setNuevaNota] = useState('')
  const [notasDeposito, setNotasDeposito] = useState<NotaDeposito[]>([])
  const [editingNotaId, setEditingNotaId] = useState<number | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [isEditingDeposito, setIsEditingDeposito] = useState(false)
  const [depositoEditData, setDepositoEditData] = useState({
    monto_recibir: 0,
    dias_gestion: 0,
    multa_retiro_anticipado: 0,
    numero_cuenta: ''
  })
  const [isGeneratingContrato, setIsGeneratingContrato] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchDeposito()
      fetchNotas()
    }
  }, [params.id])

  const fetchDeposito = async () => {
    try {
      const response = await fetch(`/api/depositos/${params.id}`)
      if (response.ok) {
        const data = await response.json()
        console.log(`✅ Depósito cargado:`, data)
        setDeposito(data)
        
        // Inicializar datos de edición
        setDepositoEditData({
          monto_recibir: data.monto_recibir || 0,
          dias_gestion: data.dias_gestion || 0,
          multa_retiro_anticipado: data.multa_retiro_anticipado || 0,
          numero_cuenta: data.numero_cuenta || ''
        })
        console.log(`📝 Datos de edición inicializados:`, {
          monto_recibir: data.monto_recibir,
          dias_gestion: data.dias_gestion,
          multa_retiro_anticipado: data.multa_retiro_anticipado,
          numero_cuenta: data.numero_cuenta
        })
      } else {
        const errorText = await response.text()
        console.error(`❌ Error cargando depósito:`, errorText)
        showToast('Error al cargar el depósito', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar el depósito', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchNotas = async () => {
    try {
      console.log(`🔍 Cargando notas para depósito ${params.id}`)
      const response = await fetch(`/api/depositos/${params.id}/notas`)
      console.log(`📊 Response status:`, response.status)
      
      if (response.ok) {
        const notas = await response.json()
        console.log(`✅ Notas cargadas:`, notas)
        setNotasDeposito(notas)
      } else {
        const errorData = await response.json()
        console.error(`❌ Error response:`, errorData)
        
        // Si el error es por tabla que no existe, mostrar mensaje informativo pero no error
        if (errorData.code === '42P01') {
          console.log(`💡 Tabla NotaDeposito no existe, usando sistema básico de notas`)
          showToast('Sistema de notas actualizándose, por favor ejecuta el script de BD', 'warning')
        } else {
          showToast(`Error cargando notas: ${errorData.details || errorData.error}`, 'error')
        }
      }
    } catch (error) {
      console.error('❌ Error cargando notas:', error)
      showToast('Error de conexión al cargar notas', 'error')
    }
  }

  const handleAgregarNota = async () => {
    if (!deposito || !nuevaNota.trim()) return
    
    try {
      setIsUpdating(true)
      console.log(`📝 Agregando nota para depósito ${deposito.id}`)
      console.log(`📊 Contenido:`, nuevaNota.trim())
      
      const response = await fetch(`/api/depositos/${deposito.id}/notas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contenido: nuevaNota.trim(),
          tipo: 'general',
          titulo: 'Nota general',
          usuario: 'Usuario' // TODO: Obtener usuario actual del sistema de auth
        })
      })
      
      console.log(`📊 Response status:`, response.status)
      
      if (response.ok) {
        const notaCreada = await response.json()
        console.log(`✅ Nota creada:`, notaCreada)
        setNuevaNota('')
        fetchNotas() // Recargar todas las notas
        showToast('Nota agregada exitosamente', 'success')
      } else {
        const errorData = await response.json()
        console.error(`❌ Error response:`, errorData)
        showToast(`Error al agregar la nota: ${errorData.details || errorData.error}`, 'error')
      }
    } catch (error) {
      console.error('❌ Error agregando nota:', error)
      showToast('Error de conexión al agregar la nota', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleEditarNota = async (notaId: number) => {
    if (!deposito || !editingContent.trim()) return
    
    try {
      console.log(`✏️ Editando nota ${notaId}`)
      setIsUpdating(true)
      
      const response = await fetch(`/api/depositos/${deposito.id}/notas`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notaId: notaId,
          contenido: editingContent.trim(),
          tipo: 'general',
          titulo: 'Nota general',
          usuario: 'Usuario'
        })
      })
      
      console.log(`📊 Response status:`, response.status)
      
      if (response.ok) {
        const notaEditada = await response.json()
        console.log(`✅ Nota editada:`, notaEditada)
        setEditingNotaId(null)
        setEditingContent('')
        fetchNotas() // Recargar todas las notas
        showToast('Nota editada exitosamente', 'success')
      } else {
        const errorData = await response.json()
        console.error(`❌ Error response:`, errorData)
        showToast(`Error al editar la nota: ${errorData.details || errorData.error}`, 'error')
      }
    } catch (error) {
      console.error('❌ Error editando nota:', error)
      showToast('Error de conexión al editar la nota', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleEliminarNota = async (notaId: number) => {
    if (!deposito) return
    
    showConfirm(
      'Eliminar Nota', 
      '¿Estás seguro de que deseas eliminar esta nota? Esta acción no se puede deshacer.',
      async () => {
        try {
          console.log(`🗑️ Eliminando nota ${notaId}`)
          setIsUpdating(true)
          
          const response = await fetch(`/api/depositos/${deposito.id}/notas?notaId=${notaId}`, {
            method: 'DELETE'
          })
          
          console.log(`📊 Response status:`, response.status)
          
          if (response.ok) {
            const result = await response.json()
            console.log(`✅ Nota eliminada:`, result)
            fetchNotas() // Recargar todas las notas
            showToast('Nota eliminada exitosamente', 'success')
          } else {
            const errorData = await response.json()
            console.error(`❌ Error response:`, errorData)
            showToast(`Error al eliminar la nota: ${errorData.details || errorData.error}`, 'error')
          }
        } catch (error) {
          console.error('❌ Error eliminando nota:', error)
          showToast('Error de conexión al eliminar la nota', 'error')
        } finally {
          setIsUpdating(false)
        }
      },
      'danger'
    )
  }

  const startEditing = (nota: NotaDeposito) => {
    setEditingNotaId(nota.id)
    setEditingContent(nota.contenido)
  }

  const cancelEditing = () => {
    setEditingNotaId(null)
    setEditingContent('')
  }

  const handleEditDeposito = () => {
    console.log(`📝 Iniciando edición de depósito`)
    setIsEditingDeposito(true)
  }

  const handleCancelEditDeposito = () => {
    console.log(`🚫 Cancelando edición de depósito`)
    setIsEditingDeposito(false)
    
    // Restaurar datos originales
    if (deposito) {
      setDepositoEditData({
        monto_recibir: deposito.monto_recibir || 0,
        dias_gestion: deposito.dias_gestion || 0,
        multa_retiro_anticipado: deposito.multa_retiro_anticipado || 0,
        numero_cuenta: deposito.numero_cuenta || ''
      })
    }
  }

  const handleSaveDepositoEdit = async () => {
    if (!deposito) {
      console.error(`❌ No hay datos del depósito para editar`)
      showToast('No hay datos del depósito disponibles', 'error')
      return
    }

    try {
      console.log(`💾 Guardando edición de depósito ${deposito.id}`)
      console.log(`📊 Datos a guardar:`, depositoEditData)
      
      setIsUpdating(true)
      
      const response = await fetch(`/api/depositos/${deposito.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          estado: deposito.estado,
          fecha_fin: deposito.fecha_fin,
          monto_recibir: depositoEditData.monto_recibir,
          dias_gestion: depositoEditData.dias_gestion,
          multa_retiro_anticipado: depositoEditData.multa_retiro_anticipado,
          numero_cuenta: depositoEditData.numero_cuenta,
          notas: deposito.notas,
          contrato_deposito: deposito.contrato_deposito,
          contrato_compra: deposito.contrato_compra
        })
      })
      
      console.log(`📊 Response status:`, response.status)
      
      if (response.ok) {
        const updatedDeposito = await response.json()
        console.log(`✅ Depósito actualizado:`, updatedDeposito)
        setDeposito(updatedDeposito)
        setIsEditingDeposito(false)
        showToast('Información del depósito actualizada exitosamente', 'success')
      } else {
        const errorData = await response.json()
        console.error(`❌ Error response:`, errorData)
        showToast(`Error al actualizar el depósito: ${errorData.error || 'Error desconocido'}`, 'error')
      }
    } catch (error) {
      console.error('❌ Error actualizando depósito:', error)
      showToast('Error de conexión al actualizar el depósito', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleGenerarContrato = async () => {
    if (!deposito) {
      showToast('No hay datos del depósito disponibles', 'error')
      return
    }
    
    try {
      setIsGeneratingContrato(true)
      // Preparar datos para el contrato
      const contratoData = {
        id: deposito.id,
        cliente: {
          nombre: deposito.cliente?.nombre,
          apellidos: deposito.cliente?.apellidos,
          dni: deposito.cliente?.dni,
          direccion: deposito.cliente?.direccion,
          ciudad: deposito.cliente?.ciudad,
          provincia: deposito.cliente?.provincia,
          codPostal: deposito.cliente?.codPostal
        },
        vehiculo: {
          marca: deposito.vehiculo?.marca,
          modelo: deposito.vehiculo?.modelo,
          bastidor: deposito.vehiculo?.bastidor,
          matricula: deposito.vehiculo?.matricula,
          fechaMatriculacion: deposito.vehiculo?.fechaMatriculacion,
          kms: deposito.vehiculo?.kms
        },
        deposito: {
          monto_recibir: deposito.monto_recibir,
          dias_gestion: deposito.dias_gestion,
          multa_retiro_anticipado: deposito.multa_retiro_anticipado,
          numero_cuenta: deposito.numero_cuenta
        }
      }
      
      // Generar el contrato en PDF
      await generarContratoDeposito(contratoData)
      
      // Actualizar el depósito con el nombre del contrato (como en deals)
      const contratoFilename = `contrato-deposito-${deposito.id}.pdf`
      const newEstado = deposito.estado === 'BORRADOR' ? 'ACTIVO' : deposito.estado
      
      const updatedDeposito = {
        ...deposito,
        contrato_deposito: contratoFilename,
        estado: newEstado
      }
      setDeposito(updatedDeposito)
      
      // Actualizar en la base de datos
      const updateResponse = await fetch(`/api/depositos/${deposito.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          estado: newEstado,
          fecha_fin: deposito.fecha_fin,
          monto_recibir: deposito.monto_recibir,
          dias_gestion: deposito.dias_gestion,
          multa_retiro_anticipado: deposito.multa_retiro_anticipado,
          numero_cuenta: deposito.numero_cuenta,
          notas: deposito.notas,
          contrato_deposito: contratoFilename,
          contrato_compra: deposito.contrato_compra
        })
      })
      
      if (updateResponse.ok) {
        showToast('Contrato generado exitosamente', 'success')
      } else {
        const errorData = await updateResponse.json()
        console.error('Error updating deposito:', errorData)
        showToast('Contrato generado, pero error al actualizar el depósito', 'warning')
      }
      
    } catch (error) {
      console.error('Error generando contrato:', error)
      showToast('Error al generar el contrato', 'error')
    } finally {
      setIsGeneratingContrato(false)
    }
  }

  const handleMarcarVendido = async () => {
    if (!deposito) {
      showToast('No hay datos del depósito disponibles', 'error')
      return
    }
    
    try {
      setIsUpdating(true)
      
      // Simplemente cambiar el estado a VENDIDO
      const response = await fetch(`/api/depositos/${deposito.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          estado: 'VENDIDO'
        })
      })
      
      if (response.ok) {
        // Actualizar solo el estado localmente
        setDeposito(prev => prev ? { ...prev, estado: 'VENDIDO' } : null)
        showToast('Depósito marcado como vendido exitosamente', 'success')
      } else {
        const errorText = await response.text()
        console.error('Error response:', errorText)
        showToast('Error al marcar como vendido', 'error')
      }
    } catch (error) {
      console.error('Error marcando como vendido:', error)
      showToast('Error al marcar como vendido', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'BORRADOR': return 'bg-gray-100 text-gray-800'
      case 'ACTIVO': return 'bg-green-100 text-green-800'
      case 'VENDIDO': return 'bg-purple-100 text-purple-800'
      case 'FINALIZADO': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const calculateDaysRemaining = () => {
    if (!deposito) return 0
    const createdDate = new Date(deposito.created_at)
    const now = new Date()
    const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
    const daysRemaining = Math.max(0, 90 - daysSinceCreation)
    return daysRemaining
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando depósito...</p>
        </div>
      </div>
    )
  }

  if (!deposito) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Depósito no encontrado</h1>
          <button
            onClick={() => router.push('/depositos')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Volver a Depósitos
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 mb-4">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => router.push('/depositos')}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div>
                    <h1 className="text-xl font-bold text-white">Depósito #{deposito.id}</h1>
                    <p className="text-slate-300 text-sm">
                      {deposito.cliente?.nombre} {deposito.cliente?.apellidos} • {deposito.vehiculo?.marca} {deposito.vehiculo?.modelo}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${getEstadoColor(deposito.estado)}`}>
                    {deposito.estado}
                  </div>
                </div>
              </div>
            </div>
          </div>


          {/* Botones de documentos */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl shadow-lg border border-purple-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Documentos</h3>
            <div className="flex space-x-3">
              <button
                onClick={handleGenerarContrato}
                disabled={isGeneratingContrato || deposito.contrato_deposito}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                  deposito.contrato_deposito
                    ? 'bg-green-100 text-green-700 cursor-not-allowed'
                    : isGeneratingContrato
                    ? 'bg-yellow-100 text-yellow-700 cursor-not-allowed'
                    : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                }`}
              >
                {deposito.contrato_deposito ? (
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Contrato Generado</span>
                  </div>
                ) : isGeneratingContrato ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
                    <span>Generando...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Generar Contrato de Depósito</span>
                  </div>
                )}
              </button>
              <button
                disabled={deposito.estado !== 'VENDIDO' || deposito.contrato_compra}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                  deposito.contrato_compra
                    ? 'bg-green-100 text-green-700 cursor-not-allowed'
                    : deposito.estado === 'VENDIDO'
                    ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                    : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Generar Contrato de Compra</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex gap-6">
          {/* Main Content */}
          <div className="w-[70%] space-y-4">
            
            {/* Bloque 1: Información del Depósito (Blanco) */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-semibold text-gray-800">Depósito de Venta</h3>
                      {deposito.estado === 'ACTIVO' && (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                          {calculateDaysRemaining()} días restantes
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">Información del depósito</p>
                  </div>
                </div>
                {!isEditingDeposito ? (
                  <button 
                    onClick={handleEditDeposito}
                    className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-200 rounded-lg transition-colors"
                    title="Editar información del depósito"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button 
                      onClick={handleSaveDepositoEdit}
                      disabled={isUpdating}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isUpdating ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button 
                      onClick={handleCancelEditDeposito}
                      className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Estado</label>
                  <p className="text-gray-900 font-medium text-sm">{deposito.estado}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Fecha de Inicio</label>
                  <p className="text-gray-900 text-sm">{formatDate(deposito.fecha_inicio)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Días Restantes</label>
                  <p className="text-gray-900 text-sm">{calculateDaysRemaining()} días</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Monto al Comprador</label>
                  {isEditingDeposito ? (
                    <input
                      type="number"
                      step="0.01"
                      value={depositoEditData.monto_recibir}
                      onChange={(e) => setDepositoEditData(prev => ({
                        ...prev,
                        monto_recibir: parseFloat(e.target.value) || 0
                      }))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 text-sm font-semibold">{formatCurrency(deposito.monto_recibir || 0)}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Días de Gestión</label>
                  {isEditingDeposito ? (
                    <input
                      type="number"
                      value={depositoEditData.dias_gestion}
                      onChange={(e) => setDepositoEditData(prev => ({
                        ...prev,
                        dias_gestion: parseInt(e.target.value) || 0
                      }))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 text-sm">{deposito.dias_gestion || 0} días</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Multa Retiro Anticipado</label>
                  {isEditingDeposito ? (
                    <input
                      type="number"
                      step="0.01"
                      value={depositoEditData.multa_retiro_anticipado}
                      onChange={(e) => setDepositoEditData(prev => ({
                        ...prev,
                        multa_retiro_anticipado: parseFloat(e.target.value) || 0
                      }))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 text-sm">{formatCurrency(deposito.multa_retiro_anticipado || 0)}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Número de Cuenta</label>
                  {isEditingDeposito ? (
                    <input
                      type="text"
                      value={depositoEditData.numero_cuenta}
                      onChange={(e) => setDepositoEditData(prev => ({
                        ...prev,
                        numero_cuenta: e.target.value
                      }))}
                      placeholder="Número de cuenta bancaria"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    />
                  ) : (
                    <p className="text-gray-900 font-mono text-sm">{deposito.numero_cuenta || 'No especificado'}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Cliente y Vehículo lado a lado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Cliente */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl shadow-lg border border-blue-200 p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-blue-800">Cliente</h4>
                    <p className="text-sm text-blue-600">Ver perfil completo</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm font-medium text-blue-600">Nombre</label>
                    <p className="text-blue-900 font-medium text-sm">{deposito.cliente?.nombre} {deposito.cliente?.apellidos}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-blue-600">Email</label>
                    <p className="text-blue-900 text-sm">{deposito.cliente?.email || 'No especificado'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-blue-600">Teléfono</label>
                    <p className="text-blue-900 text-sm">{deposito.cliente?.telefono || 'No especificado'}</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Link
                    href={`/clientes/${deposito.cliente?.id}`}
                    className="inline-flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span>Ver cliente</span>
                  </Link>
                </div>
              </div>

              {/* Vehículo */}
              <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl shadow-lg border border-green-200 p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-green-800">Vehículo</h4>
                    <p className="text-sm text-green-600">Ver en inventario</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm font-medium text-green-600">Modelo</label>
                    <p className="text-green-900 font-medium text-sm">{deposito.vehiculo?.marca} {deposito.vehiculo?.modelo}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-green-600">Matrícula</label>
                    <p className="text-green-900 text-sm">{deposito.vehiculo?.matricula}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-green-600">Referencia</label>
                    <p className="text-green-900 text-sm">#{deposito.vehiculo?.referencia}</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Link
                    href={`/vehiculos`}
                    className="inline-flex items-center space-x-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                    </svg>
                    <span>Ver vehículo</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Notas */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Notas del Depósito</h3>
              
              {/* Historial de notas */}
              <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
                {notasDeposito.length > 0 ? (
                  notasDeposito.map((nota) => (
                    <div key={nota.id} className="p-3 bg-gray-50 rounded-lg border-l-4 border-blue-500">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-medium text-blue-600">{nota.tipo.toUpperCase()}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500">
                            {new Date(nota.fecha).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: '2-digit', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <div className="flex space-x-1">
                            <button
                              onClick={() => startEditing(nota)}
                              disabled={editingNotaId === nota.id}
                              className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
                              title="Editar nota"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleEliminarNota(nota.id)}
                              disabled={isUpdating}
                              className="p-1 text-red-600 hover:text-red-800 hover:bg-red-100 rounded"
                              title="Eliminar nota"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {editingNotaId === nota.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            rows={3}
                          />
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEditarNota(nota.id)}
                              disabled={isUpdating || !editingContent.trim()}
                              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {isUpdating ? 'Guardando...' : 'Guardar'}
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{nota.contenido}</p>
                      )}
                      
                      <div className="mt-2 text-xs text-gray-500">
                        Por: {nota.usuario}
                        {nota.updatedAt !== nota.createdAt && (
                          <span className="ml-2 italic">(editado)</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 italic">No hay notas registradas para este depósito.</p>
                )}
              </div>
              
              {/* Agregar nueva nota */}
              <div className="space-y-4 border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700">Agregar nueva nota:</h4>
                <textarea
                  value={nuevaNota}
                  onChange={(e) => setNuevaNota(e.target.value)}
                  placeholder="Escribir nota sobre el depósito..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
                <button
                  onClick={handleAgregarNota}
                  disabled={isUpdating || !nuevaNota.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUpdating ? 'Agregando...' : 'Agregar Nota'}
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-[30%] space-y-6">
            
            {/* Documentación */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Documentación</h3>
              <div className="space-y-3">
                <div className={`flex items-center justify-between p-3 rounded-lg border ${
                  deposito.contrato_deposito 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center space-x-3">
                    <svg className={`w-5 h-5 ${
                      deposito.contrato_deposito ? 'text-green-600' : 'text-gray-400'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className={`text-sm font-medium ${
                      deposito.contrato_deposito ? 'text-green-800' : 'text-gray-500'
                    }`}>
                      Contrato de Depósito
                    </span>
                  </div>
                  {deposito.contrato_deposito ? (
                    <button
                      onClick={handleGenerarContrato}
                      className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-lg hover:bg-blue-200"
                    >
                      Descargar
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">No generado</span>
                  )}
                </div>
                
                {/* Contrato de Compra */}
                <div className={`flex items-center justify-between p-3 rounded-lg border ${
                  deposito.contrato_compra 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center space-x-3">
                    <svg className={`w-5 h-5 ${
                      deposito.contrato_compra ? 'text-green-600' : 'text-gray-400'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className={`text-sm font-medium ${
                      deposito.contrato_compra ? 'text-green-800' : 'text-gray-500'
                    }`}>
                      Contrato de Compra
                    </span>
                  </div>
                  {deposito.contrato_compra ? (
                    <button
                      onClick={() => {/* TODO: Implementar descarga contrato compra */}}
                      className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-lg hover:bg-blue-200"
                    >
                      Descargar
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">No generado</span>
                  )}
                </div>
              </div>
            </div>

            {/* Información del Depósito */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Información del Depósito</h3>
              <div className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Estado:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEstadoColor(deposito.estado)}`}>
                      {deposito.estado}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Creado:</span>
                    <span className="text-gray-900">{formatDate(deposito.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Última actualización:</span>
                    <span className="text-gray-900">{formatDate(deposito.updated_at)}</span>
                  </div>
                </div>
                
                {/* Toggle para marcar como vendido */}
                {deposito.estado === 'ACTIVO' && (
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Marcar como vendido</span>
                      <button
                        onClick={handleMarcarVendido}
                        className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 hover:bg-gray-300"
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            deposito.estado === 'VENDIDO' ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Activa para marcar el depósito como vendido</p>
                  </div>
                )}
                
                {/* Mostrar estado vendido si ya está vendido */}
                {deposito.estado === 'VENDIDO' && (
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Estado: Vendido</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-xs text-green-600 font-medium">VENDIDO</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Este depósito ha sido marcado como vendido</p>
                  </div>
                )}
              </div>
            </div>

            {/* Recordatorios */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recordatorios</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Título del recordatorio..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="dd/mm/aaaa --:--"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                <textarea
                  placeholder="Descripción..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  rows={3}
                />
                <button className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm">
                  Agregar Recordatorio
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ToastContainer />
      <ConfirmModalComponent />
    </div>
  )
}