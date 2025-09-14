'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { generarContratoReserva, generarContratoVenta, generarFactura } from '@/lib/contractGenerator'

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
  }
  vehiculo?: {
    id: number
    referencia: string
    marca: string
    modelo: string
    matricula: string
    bastidor: string
    kms: number
    precioPublicacion?: number
    estado: string
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
  logHistorial?: string
  createdAt: Date
  updatedAt: Date
}

interface Nota {
  id: number
  fecha: Date
  tipo: string
  contenido: string
  autor: string
}

interface Recordatorio {
  id: number
  fecha: Date
  titulo: string
  descripcion: string
  completado: boolean
}

export default function DealDetail() {
  const params = useParams()
  const router = useRouter()
  const { showToast, ToastContainer } = useToast()
  
  const [deal, setDeal] = useState<Deal | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [notas, setNotas] = useState<Nota[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  
  // Estados para los formularios
  const [nuevaNota, setNuevaNota] = useState('')
  const [nuevoRecordatorio, setNuevoRecordatorio] = useState({
    titulo: '',
    descripcion: '',
    fecha: ''
  })

  useEffect(() => {
    if (params.id) {
      fetchDeal()
    }
  }, [params.id])

  const fetchDeal = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/deals/${params.id}`)
      if (response.ok) {
        const dealData = await response.json()
        setDeal(dealData)
        
        // Simular notas y recordatorios (en el futuro vendrán de la API)
        setNotas([
          {
            id: 1,
            fecha: new Date(),
            tipo: 'general',
            contenido: 'Cliente interesado en financiación',
            autor: 'Admin'
          }
        ])
        
        setRecordatorios([
          {
            id: 1,
            fecha: new Date(Date.now() + 24 * 60 * 60 * 1000), // Mañana
            titulo: 'Llamar al cliente',
            descripcion: 'Confirmar datos para el contrato de reserva',
            completado: false
          },
          {
            id: 2,
            fecha: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // En 3 días
            titulo: 'Revisar documentación',
            descripcion: 'Verificar que toda la documentación del vehículo esté en orden',
            completado: false
          }
        ])
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

  const handleGenerarContratoReserva = async () => {
    try {
      setIsUpdating(true)
      
      if (!deal) {
        showToast('No hay datos del deal disponibles', 'error')
        return
      }
      
      // Generar el contrato en PDF
      generarContratoReserva({
        numero: deal.numero,
        fechaCreacion: deal.fechaCreacion,
        cliente: deal.cliente,
        vehiculo: deal.vehiculo,
        importeTotal: deal.importeTotal,
        importeSena: deal.importeSena,
        formaPagoSena: deal.formaPagoSena,
        fechaReservaDesde: deal.fechaReservaDesde,
        fechaReservaExpira: deal.fechaReservaExpira
      })
      
      showToast('Contrato de reserva generado y descargado', 'success')
      
      // Actualizar el deal para marcar que tiene contrato de reserva
      const updatedDeal = {
        ...deal,
        contratoReserva: `contrato-reserva-${deal.numero}.pdf`,
        estado: 'reservado',
        fechaReservaDesde: new Date()
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
            fechaReservaDesde: new Date().toISOString()
          })
        })
        
        showToast('Estado actualizado a Reservado', 'success')
        
        // Navegar de vuelta a la página principal para refrescar la lista
        setTimeout(() => {
          router.push('/deals?refresh=true')
        }, 1500)
      } catch (error) {
        console.error('Error actualizando estado:', error)
      }
    } catch (error) {
      console.error('Error generando contrato:', error)
      showToast('Error al generar el contrato de reserva', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleGenerarContratoVenta = async () => {
    try {
      setIsUpdating(true)
      
      if (!deal) {
        showToast('No hay datos del deal disponibles', 'error')
        return
      }
      
      // Generar el contrato de venta en PDF
      generarContratoVenta({
        numero: deal.numero,
        fechaCreacion: deal.fechaCreacion,
        cliente: deal.cliente,
        vehiculo: deal.vehiculo,
        importeTotal: deal.importeTotal,
        importeSena: deal.importeSena,
        formaPagoSena: deal.formaPagoSena,
        fechaReservaDesde: deal.fechaReservaDesde,
        fechaReservaExpira: deal.fechaReservaExpira
      })
      
      showToast('Contrato de venta generado y descargado', 'success')
      
      // Actualizar el deal
      const updatedDeal = {
        ...deal,
        contratoVenta: `contrato-venta-${deal.numero}.pdf`,
        estado: 'vendido',
        fechaVentaFirmada: new Date()
      }
      setDeal(updatedDeal)
      
      // Actualizar en la base de datos
      try {
        await fetch(`/api/deals/${deal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estado: 'vendido',
            contratoVenta: `contrato-venta-${deal.numero}.pdf`,
            fechaVentaFirmada: new Date().toISOString()
          })
        })
        
        showToast('Estado actualizado a Vendido', 'success')
        
        // Navegar de vuelta a la página principal para refrescar la lista
        setTimeout(() => {
          router.push('/deals?refresh=true')
        }, 1500)
      } catch (error) {
        console.error('Error actualizando estado:', error)
      }
    } catch (error) {
      console.error('Error generando contrato de venta:', error)
      showToast('Error al generar el contrato de venta', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleGenerarFactura = async () => {
    try {
      setIsUpdating(true)
      
      if (!deal) {
        showToast('No hay datos del deal disponibles', 'error')
        return
      }
      
      // Generar la factura en PDF
      generarFactura({
        numero: deal.numero,
        fechaCreacion: deal.fechaCreacion,
        cliente: deal.cliente,
        vehiculo: deal.vehiculo,
        importeTotal: deal.importeTotal,
        importeSena: deal.importeSena,
        formaPagoSena: deal.formaPagoSena,
        fechaReservaDesde: deal.fechaReservaDesde,
        fechaReservaExpira: deal.fechaReservaExpira
      })
      
      showToast('Factura generada y descargada', 'success')
      
      // Actualizar el deal
      const updatedDeal = {
        ...deal,
        factura: `factura-${deal.numero}.pdf`,
        estado: 'facturado',
        fechaFacturada: new Date()
      }
      setDeal(updatedDeal)
      
      // Actualizar en la base de datos
      try {
        await fetch(`/api/deals/${deal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estado: 'facturado',
            factura: `factura-${deal.numero}.pdf`,
            fechaFacturada: new Date().toISOString()
          })
        })
        
        showToast('Estado actualizado a Facturado', 'success')
        
        // Navegar de vuelta a la página principal para refrescar la lista
        setTimeout(() => {
          router.push('/deals?refresh=true')
        }, 1500)
      } catch (error) {
        console.error('Error actualizando estado:', error)
      }
    } catch (error) {
      console.error('Error generando factura:', error)
      showToast('Error al generar la factura', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleAgregarNota = async () => {
    if (!nuevaNota.trim()) return
    
    try {
      const nota: Nota = {
        id: Date.now(),
        fecha: new Date(),
        tipo: 'general',
        contenido: nuevaNota,
        autor: 'Admin'
      }
      
      setNotas([...notas, nota])
      setNuevaNota('')
      showToast('Nota agregada correctamente', 'success')
    } catch (error) {
      showToast('Error al agregar la nota', 'error')
    }
  }

  const handleAgregarRecordatorio = async () => {
    if (!nuevoRecordatorio.titulo.trim() || !nuevoRecordatorio.fecha) return
    
    try {
      const recordatorio: Recordatorio = {
        id: Date.now(),
        fecha: new Date(nuevoRecordatorio.fecha),
        titulo: nuevoRecordatorio.titulo,
        descripcion: nuevoRecordatorio.descripcion,
        completado: false
      }
      
      setRecordatorios([...recordatorios, recordatorio])
      setNuevoRecordatorio({ titulo: '', descripcion: '', fecha: '' })
      showToast('Recordatorio agregado correctamente', 'success')
    } catch (error) {
      showToast('Error al agregar el recordatorio', 'error')
    }
  }

  const handleCompletarRecordatorio = (id: number) => {
    setRecordatorios(recordatorios.map(r => 
      r.id === id ? { ...r, completado: !r.completado } : r
    ))
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
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Deal no encontrado</h1>
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

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'nuevo': return 'bg-blue-100 text-blue-800'
      case 'reservado': return 'bg-yellow-100 text-yellow-800'
      case 'vendido': return 'bg-green-100 text-green-800'
      case 'facturado': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const canGenerateContratoVenta = deal.contratoReserva && deal.estado === 'reservado'
  const canGenerateFactura = deal.contratoVenta && deal.estado === 'vendido'

  return (
    <div className="min-h-screen bg-slate-50">
      <ToastContainer />
      
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/deals')}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{deal.numero}</h1>
                <p className="text-sm text-gray-500">
                  {deal.cliente?.nombre} {deal.cliente?.apellidos} • {deal.vehiculo?.marca} {deal.vehiculo?.modelo}
                </p>
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${getEstadoColor(deal.estado)}`}>
              {deal.estado.toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Panel Principal */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Información del Deal */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Información del Deal</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                  <p className="text-gray-900">{deal.cliente?.nombre} {deal.cliente?.apellidos}</p>
                  <p className="text-sm text-gray-500">{deal.cliente?.telefono}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vehículo</label>
                  <p className="text-gray-900">{deal.vehiculo?.marca} {deal.vehiculo?.modelo}</p>
                  <p className="text-sm text-gray-500">Ref: {deal.vehiculo?.referencia}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Importe Total</label>
                  <p className="text-gray-900">€{deal.importeTotal?.toLocaleString() || 'No especificado'}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Seña</label>
                  <p className="text-gray-900">€{deal.importeSena?.toLocaleString() || 'No especificado'}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Reserva</label>
                  <p className="text-gray-900">
                    {deal.fechaReservaDesde ? new Date(deal.fechaReservaDesde).toLocaleDateString() : 'No especificada'}
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expira</label>
                  <p className="text-gray-900">
                    {deal.fechaReservaExpira ? new Date(deal.fechaReservaExpira).toLocaleDateString() : 'No especificada'}
                  </p>
                </div>
              </div>
            </div>

            {/* Botones de Acción */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Documentos</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Generar Contrato de Reserva */}
                <div className="text-center">
                  <button
                    onClick={handleGenerarContratoReserva}
                    disabled={isUpdating || deal.contratoReserva}
                    className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
                      deal.contratoReserva
                        ? 'bg-green-100 text-green-700 cursor-not-allowed'
                        : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                    }`}
                  >
                    {deal.contratoReserva ? (
                      <div>
                        <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Contrato Generado
                      </div>
                    ) : (
                      <div>
                        <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Generar Contrato de Reserva
                      </div>
                    )}
                  </button>
                </div>

                {/* Generar Contrato de Venta */}
                <div className="text-center">
                  <button
                    onClick={handleGenerarContratoVenta}
                    disabled={isUpdating || !canGenerateContratoVenta || deal.contratoVenta}
                    className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
                      deal.contratoVenta
                        ? 'bg-green-100 text-green-700 cursor-not-allowed'
                        : !canGenerateContratoVenta
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    {deal.contratoVenta ? (
                      <div>
                        <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Contrato Generado
                      </div>
                    ) : (
                      <div>
                        <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Generar Contrato de Venta
                      </div>
                    )}
                  </button>
                </div>

                {/* Generar Factura */}
                <div className="text-center">
                  <button
                    onClick={handleGenerarFactura}
                    disabled={isUpdating || !canGenerateFactura || deal.factura}
                    className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
                      deal.factura
                        ? 'bg-green-100 text-green-700 cursor-not-allowed'
                        : !canGenerateFactura
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                    }`}
                  >
                    {deal.factura ? (
                      <div>
                        <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Factura Generada
                      </div>
                    ) : (
                      <div>
                        <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Generar Factura
                      </div>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Notas */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notas</h2>
              
              {/* Agregar nueva nota */}
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
                {notas.map(nota => (
                  <div key={nota.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-gray-900">{nota.contenido}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {nota.autor} • {nota.fecha.toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Panel Lateral */}
          <div className="space-y-6">
            
            {/* Recordatorios */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recordatorios</h2>
              
              {/* Agregar nuevo recordatorio */}
              <div className="mb-4 space-y-3">
                <input
                  type="text"
                  value={nuevoRecordatorio.titulo}
                  onChange={(e) => setNuevoRecordatorio({...nuevoRecordatorio, titulo: e.target.value})}
                  placeholder="Título del recordatorio..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="datetime-local"
                  value={nuevoRecordatorio.fecha}
                  onChange={(e) => setNuevoRecordatorio({...nuevoRecordatorio, fecha: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <textarea
                  value={nuevoRecordatorio.descripcion}
                  onChange={(e) => setNuevoRecordatorio({...nuevoRecordatorio, descripcion: e.target.value})}
                  placeholder="Descripción..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={2}
                />
                <button
                  onClick={handleAgregarRecordatorio}
                  disabled={!nuevoRecordatorio.titulo.trim() || !nuevoRecordatorio.fecha}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Agregar Recordatorio
                </button>
              </div>
              
              {/* Lista de recordatorios */}
              <div className="space-y-3">
                {recordatorios.map(recordatorio => (
                  <div key={recordatorio.id} className={`border rounded-lg p-3 ${
                    recordatorio.completado ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={recordatorio.completado}
                            onChange={() => handleCompletarRecordatorio(recordatorio.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <h4 className={`font-medium ${
                            recordatorio.completado ? 'text-green-700 line-through' : 'text-gray-900'
                          }`}>
                            {recordatorio.titulo}
                          </h4>
                        </div>
                        <p className={`text-sm mt-1 ${
                          recordatorio.completado ? 'text-green-600' : 'text-gray-600'
                        }`}>
                          {recordatorio.descripcion}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {recordatorio.fecha.toLocaleDateString()} {recordatorio.fecha.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Información Adicional */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Información Adicional</h2>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
                  <p className="text-gray-900">{deal.responsableComercial || 'No asignado'}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Creación</label>
                  <p className="text-gray-900">{new Date(deal.fechaCreacion).toLocaleDateString()}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Última Actualización</label>
                  <p className="text-gray-900">{new Date(deal.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
