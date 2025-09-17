'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/hooks/useToast'
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

export default function DepositoDetail() {
  const params = useParams()
  const router = useRouter()
  const { showToast, ToastContainer } = useToast()
  
  const [deposito, setDeposito] = useState<Deposito | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [notas, setNotas] = useState('')
  const [contratoGenerado, setContratoGenerado] = useState(false)
  const [isGeneratingContrato, setIsGeneratingContrato] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchDeposito()
    }
  }, [params.id])

  const fetchDeposito = async () => {
    try {
      const response = await fetch(`/api/depositos/${params.id}`)
      if (response.ok) {
        const data = await response.json()
        setDeposito(data)
        setNotas(data.notas || '')
      } else {
        showToast('Error al cargar el depósito', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar el depósito', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateNotas = async () => {
    if (!deposito) return
    
    try {
      setIsUpdating(true)
      const response = await fetch(`/api/depositos/${deposito.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notas })
      })
      
      if (response.ok) {
        const updatedDeposito = await response.json()
        setDeposito(updatedDeposito)
        showToast('Depósito actualizado exitosamente', 'success')
      } else {
        showToast('Error al actualizar el depósito', 'error')
      }
    } catch (error) {
      showToast('Error al actualizar el depósito', 'error')
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
      
      // Si el depósito está en borrador, cambiarlo a activo
      if (deposito.estado === 'BORRADOR') {
        const updateResponse = await fetch(`/api/depositos/${deposito.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            estado: 'ACTIVO'
          })
        })
        
           if (updateResponse.ok) {
             // Actualizar el estado local
             setDeposito(prev => prev ? { ...prev, estado: 'ACTIVO' } : null)
             setContratoGenerado(true)
             showToast('Contrato generado y depósito activado exitosamente', 'success')
           } else {
             setContratoGenerado(true)
             showToast('Contrato generado, pero error al activar el depósito', 'warning')
           }
         } else {
           setContratoGenerado(true)
           showToast('Contrato generado exitosamente', 'success')
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
        // Actualizar el estado local
        setDeposito(prev => prev ? { ...prev, estado: 'VENDIDO' } : null)
        showToast('Depósito marcado como vendido exitosamente', 'success')
      } else {
        showToast('Error al marcar como vendido', 'error')
      }
    } catch (error) {
      console.error('Error marcando como vendido:', error)
      showToast('Error al marcar como vendido', 'error')
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
                  {deposito.estado === 'ACTIVO' && (
                    <button
                      onClick={handleMarcarVendido}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Marcar como Vendido
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Mensaje de días restantes */}
          {deposito.estado === 'ACTIVO' && (
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl p-4 mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-yellow-800">Días Restantes</h3>
                  <p className="text-yellow-700">
                    {calculateDaysRemaining()} días restantes de gestión (máximo 90 días)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Botones de documentos */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl shadow-lg border border-purple-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Documentos</h3>
            <div className="flex space-x-3">
              <button
                onClick={handleGenerarContrato}
                disabled={isGeneratingContrato || contratoGenerado}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                  contratoGenerado
                    ? 'bg-green-100 text-green-700 cursor-not-allowed'
                    : isGeneratingContrato
                    ? 'bg-yellow-100 text-yellow-700 cursor-not-allowed'
                    : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                }`}
              >
                {contratoGenerado ? (
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
                disabled={deposito.estado !== 'VENDIDO'}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                  deposito.estado === 'VENDIDO'
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
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
            
            {/* Bloque 1: Información del Depósito (Azul) */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl shadow-lg border border-blue-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-blue-800">Depósito de Venta</h3>
                    <p className="text-sm text-blue-600">Información del depósito</p>
                  </div>
                </div>
                <button className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-200 rounded-lg transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-blue-600">Estado</label>
                  <p className="text-blue-900 font-medium text-sm">{deposito.estado}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-blue-600">Fecha de Inicio</label>
                  <p className="text-blue-900 text-sm">{formatDate(deposito.fecha_inicio)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-blue-600">Días Restantes</label>
                  <p className="text-blue-900 text-sm">{calculateDaysRemaining()} días</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-blue-600">Monto al Comprador</label>
                  <p className="text-blue-900 text-sm font-semibold">{formatCurrency(deposito.monto_recibir || 0)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-blue-600">Días de Gestión</label>
                  <p className="text-blue-900 text-sm">{deposito.dias_gestion || 0} días</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-blue-600">Multa Retiro Anticipado</label>
                  <p className="text-blue-900 text-sm">{formatCurrency(deposito.multa_retiro_anticipado || 0)}</p>
                </div>
                {deposito.numero_cuenta && (
                  <div>
                    <label className="text-sm font-medium text-blue-600">Número de Cuenta</label>
                    <p className="text-blue-900 font-mono text-sm">{deposito.numero_cuenta}</p>
                  </div>
                )}
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
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Notas</h3>
              <div className="space-y-4">
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Agregar notas sobre el depósito..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={4}
                />
                <button
                  onClick={handleUpdateNotas}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUpdating ? 'Guardando...' : 'Guardar Notas'}
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
                  contratoGenerado 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center space-x-3">
                    <svg className={`w-5 h-5 ${
                      contratoGenerado ? 'text-green-600' : 'text-gray-400'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className={`text-sm font-medium ${
                      contratoGenerado ? 'text-green-800' : 'text-gray-500'
                    }`}>
                      {contratoGenerado ? 'Contrato Generado' : 'Contrato de Depósito'}
                    </span>
                  </div>
                  {contratoGenerado ? (
                    <button
                      onClick={handleGenerarContrato}
                      className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700"
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
    </div>
  )
}