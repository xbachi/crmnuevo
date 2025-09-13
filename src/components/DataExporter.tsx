'use client'

import { useState } from 'react'

interface Cliente {
  id: number
  nombre: string
  apellidos: string
  telefono: string
  email?: string
  estado: string
  prioridad: string
  fechaPrimerContacto: string
  intereses: {
    vehiculoPrincipal: string
    precioMaximo: number
    combustiblePreferido: string
    cambioPreferido: string
  }
  proximoPaso?: string
  etiquetas: string[]
}

interface DataExporterProps {
  clientes: Cliente[]
  isOpen: boolean
  onClose: () => void
}

export default function DataExporter({ clientes, isOpen, onClose }: DataExporterProps) {
  const [formato, setFormato] = useState<'csv' | 'excel' | 'pdf'>('csv')
  const [filtros, setFiltros] = useState({
    estado: '',
    prioridad: '',
    fechaDesde: '',
    fechaHasta: ''
  })
  const [isExporting, setIsExporting] = useState(false)

  if (!isOpen) return null

  const filtrarClientes = () => {
    return clientes.filter(cliente => {
      if (filtros.estado && cliente.estado !== filtros.estado) return false
      if (filtros.prioridad && cliente.prioridad !== filtros.prioridad) return false
      
      if (filtros.fechaDesde) {
        const fechaCliente = new Date(cliente.fechaPrimerContacto)
        const fechaDesde = new Date(filtros.fechaDesde)
        if (fechaCliente < fechaDesde) return false
      }
      
      if (filtros.fechaHasta) {
        const fechaCliente = new Date(cliente.fechaPrimerContacto)
        const fechaHasta = new Date(filtros.fechaHasta)
        if (fechaCliente > fechaHasta) return false
      }
      
      return true
    })
  }

  const exportarCSV = () => {
    const clientesFiltrados = filtrarClientes()
    const headers = [
      'ID',
      'Nombre',
      'Apellidos',
      'Teléfono',
      'Email',
      'Estado',
      'Prioridad',
      'Fecha Primer Contacto',
      'Vehículo Principal',
      'Precio Máximo',
      'Combustible Preferido',
      'Cambio Preferido',
      'Próximo Paso',
      'Etiquetas'
    ]

    const csvContent = [
      headers.join(','),
      ...clientesFiltrados.map(cliente => [
        cliente.id,
        `"${cliente.nombre}"`,
        `"${cliente.apellidos}"`,
        `"${cliente.telefono}"`,
        `"${cliente.email || ''}"`,
        `"${cliente.estado}"`,
        `"${cliente.prioridad}"`,
        `"${cliente.fechaPrimerContacto}"`,
        `"${cliente.intereses.vehiculoPrincipal || ''}"`,
        cliente.intereses.precioMaximo,
        `"${cliente.intereses.combustiblePreferido}"`,
        `"${cliente.intereses.cambioPreferido}"`,
        `"${cliente.proximoPaso || ''}"`,
        `"${cliente.etiquetas.join('; ')}"`
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `clientes_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportarExcel = () => {
    // Para Excel necesitaríamos una librería como xlsx
    // Por ahora exportamos como CSV con extensión .xlsx
    exportarCSV()
  }

  const exportarPDF = () => {
    // Para PDF necesitaríamos una librería como jsPDF
    // Por ahora mostramos un mensaje
    alert('Funcionalidad de PDF en desarrollo. Por ahora se exporta como CSV.')
    exportarCSV()
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      switch (formato) {
        case 'csv':
          exportarCSV()
          break
        case 'excel':
          exportarExcel()
          break
        case 'pdf':
          exportarPDF()
          break
      }
    } catch (error) {
      console.error('Error al exportar:', error)
      alert('Error al exportar los datos')
    } finally {
      setIsExporting(false)
    }
  }

  const clientesFiltrados = filtrarClientes()

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-25" onClick={onClose}></div>
      <div className="relative mx-auto mt-16 max-w-lg">
        <div className="bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Exportar Datos</h2>
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
          <div className="p-6 space-y-6">
            {/* Formato */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Formato de exportación
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'csv', label: 'CSV', icon: '📊' },
                  { value: 'excel', label: 'Excel', icon: '📈' },
                  { value: 'pdf', label: 'PDF', icon: '📄' }
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFormato(option.value as any)}
                    className={`p-3 border rounded-lg text-center transition-colors ${
                      formato === option.value
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="text-2xl mb-1">{option.icon}</div>
                    <div className="text-sm font-medium">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Filtros */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Filtros de exportación
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Estado</label>
                  <select
                    value={filtros.estado}
                    onChange={(e) => setFiltros(prev => ({ ...prev, estado: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="">Todos</option>
                    <option value="nuevo">Nuevo</option>
                    <option value="en_seguimiento">En seguimiento</option>
                    <option value="cita_agendada">Cita agendada</option>
                    <option value="cerrado">Cerrado</option>
                    <option value="descartado">Descartado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Prioridad</label>
                  <select
                    value={filtros.prioridad}
                    onChange={(e) => setFiltros(prev => ({ ...prev, prioridad: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="">Todas</option>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Fecha desde</label>
                  <input
                    type="date"
                    value={filtros.fechaDesde}
                    onChange={(e) => setFiltros(prev => ({ ...prev, fechaDesde: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Fecha hasta</label>
                  <input
                    type="date"
                    value={filtros.fechaHasta}
                    onChange={(e) => setFiltros(prev => ({ ...prev, fechaHasta: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>
            </div>

            {/* Resumen */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Registros a exportar:</span>
                <span className="font-medium text-gray-900">{clientesFiltrados.length} de {clientes.length}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 border-t border-gray-200 px-6 py-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting || clientesFiltrados.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Exportando...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Exportar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

