'use client'

import { useState, useEffect } from 'react'

interface Notificacion {
  id: string
  tipo: 'info' | 'warning' | 'success' | 'error'
  titulo: string
  mensaje: string
  fecha: string
  leida: boolean
  accion?: {
    texto: string
    url: string
  }
}

interface NotificationCenterProps {
  isOpen: boolean
  onClose: () => void
}

export default function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchNotificaciones()
    }
  }, [isOpen])

  const fetchNotificaciones = async () => {
    try {
      setIsLoading(true)
      // Simular notificaciones basadas en datos reales
      const response = await fetch('/api/clientes')
      if (response.ok) {
        const clientes = await response.json()
        generarNotificaciones(clientes)
      }
    } catch (error) {
      console.error('Error al cargar notificaciones:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const generarNotificaciones = (clientes: any[]) => {
    const notificaciones: Notificacion[] = []
    const ahora = new Date()

    // Clientes sin contacto hace más de 7 días
    const clientesSinContacto = clientes.filter(cliente => {
      const fechaContacto = new Date(cliente.fechaPrimerContacto)
      const diasSinContacto = Math.floor((ahora.getTime() - fechaContacto.getTime()) / (1000 * 60 * 60 * 24))
      return diasSinContacto > 7 && cliente.estado !== 'cerrado' && cliente.estado !== 'descartado'
    })

    if (clientesSinContacto.length > 0) {
      notificaciones.push({
        id: 'sin-contacto',
        tipo: 'warning',
        titulo: 'Clientes sin contacto',
        mensaje: `${clientesSinContacto.length} cliente(s) sin contacto hace más de 7 días`,
        fecha: ahora.toISOString(),
        leida: false,
        accion: {
          texto: 'Ver clientes',
          url: '/clientes?filtro=sin_contacto'
        }
      })
    }

    // Clientes de alta prioridad
    const clientesAltaPrioridad = clientes.filter(c => c.prioridad === 'alta' && c.estado !== 'cerrado')
    if (clientesAltaPrioridad.length > 0) {
      notificaciones.push({
        id: 'alta-prioridad',
        tipo: 'error',
        titulo: 'Clientes de alta prioridad',
        mensaje: `${clientesAltaPrioridad.length} cliente(s) de alta prioridad requieren atención`,
        fecha: ahora.toISOString(),
        leida: false,
        accion: {
          texto: 'Ver prioridades',
          url: '/clientes?filtro=alta_prioridad'
        }
      })
    }

    // Nuevos clientes hoy
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const clientesHoy = clientes.filter(cliente => {
      const fechaCliente = new Date(cliente.fechaPrimerContacto)
      fechaCliente.setHours(0, 0, 0, 0)
      return fechaCliente.getTime() === hoy.getTime()
    })

    if (clientesHoy.length > 0) {
      notificaciones.push({
        id: 'nuevos-hoy',
        tipo: 'success',
        titulo: 'Nuevos clientes',
        mensaje: `${clientesHoy.length} nuevo(s) cliente(s) registrado(s) hoy`,
        fecha: ahora.toISOString(),
        leida: false,
        accion: {
          texto: 'Ver nuevos',
          url: '/clientes?filtro=nuevos_hoy'
        }
      })
    }

    // Clientes con citas agendadas
    const clientesConCitas = clientes.filter(c => c.estado === 'cita_agendada')
    if (clientesConCitas.length > 0) {
      notificaciones.push({
        id: 'citas-agendadas',
        tipo: 'info',
        titulo: 'Citas agendadas',
        mensaje: `${clientesConCitas.length} cita(s) agendada(s) pendientes`,
        fecha: ahora.toISOString(),
        leida: false,
        accion: {
          texto: 'Ver citas',
          url: '/clientes?filtro=cita_agendada'
        }
      })
    }

    setNotificaciones(notificaciones)
  }

  const marcarComoLeida = (id: string) => {
    setNotificaciones(prev => 
      prev.map(notif => 
        notif.id === id ? { ...notif, leida: true } : notif
      )
    )
  }

  const getTipoIcon = (tipo: string) => {
    const icons = {
      info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z',
      success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      error: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'
    }
    return icons[tipo as keyof typeof icons] || icons.info
  }

  const getTipoColor = (tipo: string) => {
    const colors = {
      info: 'text-blue-600 bg-blue-100',
      warning: 'text-yellow-600 bg-yellow-100',
      success: 'text-green-600 bg-green-100',
      error: 'text-red-600 bg-red-100'
    }
    return colors[tipo as keyof typeof colors] || colors.info
  }

  const formatFecha = (fecha: string) => {
    const date = new Date(fecha)
    const ahora = new Date()
    const diffMs = ahora.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Ahora'
    if (diffMins < 60) return `Hace ${diffMins}m`
    if (diffHours < 24) return `Hace ${diffHours}h`
    if (diffDays < 7) return `Hace ${diffDays}d`
    return date.toLocaleDateString('es-ES')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-25" onClick={onClose}></div>
      <div className="relative ml-auto h-full w-full max-w-md bg-white shadow-xl">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Notificaciones</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
              </div>
            ) : notificaciones.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                <svg className="h-12 w-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">No hay notificaciones</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {notificaciones.map((notificacion) => (
                  <div
                    key={notificacion.id}
                    className={`p-4 hover:bg-gray-50 cursor-pointer ${notificacion.leida ? 'opacity-60' : ''}`}
                    onClick={() => marcarComoLeida(notificacion.id)}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`flex-shrink-0 p-2 rounded-full ${getTipoColor(notificacion.tipo)}`}>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={getTipoIcon(notificacion.tipo)} />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-medium ${notificacion.leida ? 'text-gray-500' : 'text-gray-900'}`}>
                            {notificacion.titulo}
                          </p>
                          <p className="text-xs text-gray-500">{formatFecha(notificacion.fecha)}</p>
                        </div>
                        <p className={`text-sm ${notificacion.leida ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                          {notificacion.mensaje}
                        </p>
                        {notificacion.accion && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              window.location.href = notificacion.accion!.url
                            }}
                            className="mt-2 text-xs text-green-600 hover:text-green-800 font-medium"
                          >
                            {notificacion.accion.texto} →
                          </button>
                        )}
                      </div>
                      {!notificacion.leida && (
                        <div className="flex-shrink-0">
                          <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notificaciones.length > 0 && (
            <div className="border-t border-gray-200 px-6 py-3">
              <button
                onClick={() => setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })))}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Marcar todas como leídas
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

