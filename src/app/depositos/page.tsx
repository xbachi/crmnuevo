'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useToast } from '@/hooks/useToast'

interface Deposito {
  id: number
  cliente_id: number
  vehiculo_id: number
  estado: 'BORRADOR' | 'ACTIVO' | 'FINALIZADO'
  fecha_inicio: string
  fecha_fin?: string
  precio_venta?: number
  comision_porcentaje: number
  notas?: string
  created_at: string
  // Datos relacionados
  cliente: {
    id: number
    nombre: string
    apellidos: string
    email: string
    telefono: string
  }
  vehiculo: {
    id: number
    referencia: string
    marca: string
    modelo: string
    matricula: string
    tipo: string
  }
}

export default function DepositosPage() {
  const [depositos, setDepositos] = useState<Deposito[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterEstado, setFilterEstado] = useState<'TODOS' | 'BORRADOR' | 'ACTIVO' | 'FINALIZADO'>('TODOS')
  const { showToast, ToastContainer } = useToast()

  useEffect(() => {
    fetchDepositos()
  }, [])

  const fetchDepositos = async () => {
    try {
      const response = await fetch('/api/depositos')
      if (response.ok) {
        const data = await response.json()
        setDepositos(data)
      } else {
        showToast('Error al cargar depósitos', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar depósitos', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredDepositos = depositos.filter(deposito => {
    const matchesSearch = 
      deposito.cliente.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deposito.cliente.apellidos.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deposito.vehiculo.marca.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deposito.vehiculo.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deposito.vehiculo.matricula.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesEstado = filterEstado === 'TODOS' || deposito.estado === filterEstado
    
    return matchesSearch && matchesEstado
  })

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'BORRADOR': return 'bg-gray-100 text-gray-800'
      case 'ACTIVO': return 'bg-green-100 text-green-800'
      case 'FINALIZADO': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case 'BORRADOR': return 'Borrador'
      case 'ACTIVO': return 'Activo'
      case 'FINALIZADO': return 'Finalizado'
      default: return estado
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Cargando depósitos...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Depósitos de Venta</h1>
              <p className="text-slate-600 mt-2">Gestiona los depósitos de vehículos en consignación</p>
            </div>
            <Link
              href="/depositos/nuevo"
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Generar nuevo depósito</span>
            </Link>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Buscar por cliente o vehículo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div className="sm:w-48">
              <select
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value as any)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="TODOS">Todos los estados</option>
                <option value="BORRADOR">Borrador</option>
                <option value="ACTIVO">Activo</option>
                <option value="FINALIZADO">Finalizado</option>
              </select>
            </div>
          </div>
        </div>

        {/* Lista de depósitos */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          {filteredDepositos.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📦</div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">No hay depósitos</h3>
              <p className="text-slate-600 mb-6">Comienza creando tu primer depósito de venta</p>
              <Link
                href="/depositos/nuevo"
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors inline-flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Crear depósito</span>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Vehículo
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Fecha Inicio
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Precio Venta
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Comisión
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredDepositos.map((deposito) => (
                    <tr key={deposito.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {deposito.cliente.nombre} {deposito.cliente.apellidos}
                          </div>
                          <div className="text-sm text-slate-500">{deposito.cliente.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {deposito.vehiculo.marca} {deposito.vehiculo.modelo}
                          </div>
                          <div className="text-sm text-slate-500">{deposito.vehiculo.matricula}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getEstadoColor(deposito.estado)}`}>
                          {getEstadoLabel(deposito.estado)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        {new Date(deposito.fecha_inicio).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        {deposito.precio_venta ? `€${deposito.precio_venta.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        {deposito.comision_porcentaje}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          href={`/depositos/${deposito.id}`}
                          className="text-green-600 hover:text-green-900 mr-4"
                        >
                          Ver detalle
                        </Link>
                        <Link
                          href={`/clientes/${deposito.cliente_id}`}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          Ver cliente
                        </Link>
                        <Link
                          href={`/vehiculos/${deposito.vehiculo_id}`}
                          className="text-purple-600 hover:text-purple-900"
                        >
                          Ver vehículo
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats */}
        {filteredDepositos.length > 0 && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-gray-600 text-sm font-medium">📝</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-500">Borradores</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {depositos.filter(d => d.estado === 'BORRADOR').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-green-600 text-sm font-medium">✅</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-500">Activos</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {depositos.filter(d => d.estado === 'ACTIVO').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                    <span className="text-red-600 text-sm font-medium">🏁</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-500">Finalizados</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {depositos.filter(d => d.estado === 'FINALIZADO').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ToastContainer />
    </div>
  )
}
