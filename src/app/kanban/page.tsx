'use client'

import { useState, useEffect } from 'react'
import KanbanBoard from '@/components/KanbanBoard'
import { useToast } from '@/components/Toast'
import { useConfirmModal } from '@/components/ConfirmModal'
import { useAutoSync } from '@/hooks/useAutoSync'
import { KanbanLoadingSkeleton } from '@/components/LoadingSkeleton'

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
  createdAt: string
  // Campos adicionales de Google Sheets
  fechaMatriculacion?: string
  año?: number
  itv?: string
  seguro?: string
  segundaLlave?: boolean
  documentacion?: string
}

export default function KanbanPage() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [filteredVehiculos, setFilteredVehiculos] = useState<Vehiculo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchField, setSearchField] = useState<'todos' | 'referencia' | 'marca' | 'modelo' | 'matricula' | 'bastidor' | 'tipo'>('todos')
  const [editingVehiculo, setEditingVehiculo] = useState<Vehiculo | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editFormData, setEditFormData] = useState({
    referencia: '',
    marca: '',
    modelo: '',
    matricula: '',
    bastidor: '',
    kms: '',
    tipo: ''
  })
  const [isUpdating, setIsUpdating] = useState(false)
  const { showToast, ToastContainer } = useToast()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()

  useEffect(() => {
    fetchVehiculos()
  }, [])

  useEffect(() => {
    filterVehiculos()
  }, [vehiculos, searchTerm, searchField])

  const filterVehiculos = () => {
    // Primero filtrar vehículos vendidos (no mostrar en Kanban)
    const vehiculosEnProceso = vehiculos.filter(vehiculo => {
      const estado = vehiculo.estado?.toLowerCase()
      return estado !== 'vendido' && estado !== 'vendida'
    })

    if (!searchTerm.trim()) {
      setFilteredVehiculos(vehiculosEnProceso)
      return
    }

    const filtered = vehiculosEnProceso.filter(vehiculo => {
      if (searchField === 'todos') {
        return (
          vehiculo.referencia.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehiculo.marca.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehiculo.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehiculo.matricula.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehiculo.bastidor.toLowerCase().includes(searchTerm.toLowerCase()) ||
          vehiculo.tipo.toLowerCase().includes(searchTerm.toLowerCase())
        )
      } else {
        const fieldValue = vehiculo[searchField].toString().toLowerCase()
        return fieldValue.includes(searchTerm.toLowerCase())
      }
    })

    setFilteredVehiculos(filtered)
  }

  const handleSyncSheets = async () => {
    try {
      const response = await fetch('/api/vehiculos/sync-sheets', {
        method: 'POST'
      })

      if (response.ok) {
        const result = await response.json()
        setVehiculos(result.vehiculos)
        if (result.warning) {
          showToast(result.warning, 'warning')
        } else {
          showToast('Datos actualizados correctamente', 'success')
        }
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      console.error('Error sincronizando con Google Sheets:', error)
      showToast('Error al sincronizar con Google Sheets', 'error')
    }
  }

  // Sincronización automática cada 12 horas
  useAutoSync(handleSyncSheets)

  const handleManualSync = async () => {
    try {
      setIsLoading(true)
      await handleSyncSheets()
    } finally {
      setIsLoading(false)
    }
  }

  const fetchVehiculos = async () => {
    try {
      setIsLoading(true)
      
      // Usar cache del navegador si está disponible
      const cacheKey = 'vehiculos-cache'
      const cachedData = localStorage.getItem(cacheKey)
      const cacheTime = localStorage.getItem(`${cacheKey}-time`)
      
      // Si hay datos en cache y son recientes (menos de 5 minutos), usarlos
      if (cachedData && cacheTime) {
        const now = Date.now()
        const cacheAge = now - parseInt(cacheTime)
        if (cacheAge < 5 * 60 * 1000) { // 5 minutos
          setVehiculos(JSON.parse(cachedData))
          setIsLoading(false)
        }
      }
      
      const response = await fetch('/api/vehiculos', {
        headers: {
          'Cache-Control': 'max-age=60'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setVehiculos(data)
        
        // Guardar en cache
        localStorage.setItem(cacheKey, JSON.stringify(data))
        localStorage.setItem(`${cacheKey}-time`, Date.now().toString())
      } else {
        setError('Error al cargar los vehículos')
      }
    } catch (error) {
      setError('Error al cargar los vehículos')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (vehiculo: Vehiculo) => {
    setEditingVehiculo(vehiculo)
    setEditFormData({
      referencia: vehiculo.referencia,
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      matricula: vehiculo.matricula,
      bastidor: vehiculo.bastidor,
      kms: vehiculo.kms.toString(),
      tipo: vehiculo.tipo
    })
    setShowEditModal(true)
  }

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleDelete = (id: number) => {
    const vehiculo = vehiculos.find(v => v.id === id)
    const vehiculoName = vehiculo ? `${vehiculo.marca} ${vehiculo.modelo} (#${vehiculo.referencia})` : 'este vehículo'
    
    showConfirm(
      'Eliminar Vehículo',
      `¿Estás seguro de que quieres eliminar ${vehiculoName}? Esta acción no se puede deshacer.`,
      async () => {
        try {
          const response = await fetch(`/api/vehiculos?id=${id}`, {
            method: 'DELETE'
          })

          if (response.ok) {
            await fetchVehiculos()
            showToast('Vehículo eliminado exitosamente', 'success')
          } else {
            const error = await response.json()
            showToast(`Error: ${error.error}`, 'error')
          }
        } catch (error) {
          console.error('Error eliminando vehículo:', error)
          showToast('Error al eliminar el vehículo', 'error')
        }
      },
      'danger'
    )
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingVehiculo) return

    setIsUpdating(true)
    try {
      const updatedVehiculo = {
        id: editingVehiculo.id,
        referencia: editFormData.referencia,
        marca: editFormData.marca,
        modelo: editFormData.modelo,
        matricula: editFormData.matricula,
        bastidor: editFormData.bastidor,
        kms: parseInt(editFormData.kms),
        tipo: editFormData.tipo
      }

      const response = await fetch('/api/vehiculos', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedVehiculo)
      })

      if (response.ok) {
        await fetchVehiculos()
        setShowEditModal(false)
        setEditingVehiculo(null)
        showToast('Vehículo actualizado exitosamente', 'success')
      } else {
        const error = await response.json()
        showToast(`Error: ${error.error}`, 'error')
      }
    } catch (error) {
      console.error('Error actualizando vehículo:', error)
      showToast('Error al actualizar el vehículo', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const closeEditModal = () => {
    setShowEditModal(false)
    setEditingVehiculo(null)
    setEditFormData({
      referencia: '',
      marca: '',
      modelo: '',
      matricula: '',
      bastidor: '',
      kms: '',
      tipo: ''
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Cargando tablero...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <div className="text-red-600 text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Error al cargar el tablero</h2>
            <p className="text-slate-600 mb-4">{error}</p>
            <button
              onClick={fetchVehiculos}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-slate-50 flex flex-col">
      {/* Header fijo */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex flex-col space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Tablero de Procesos</h1>
              <p className="text-sm text-slate-600">Arrastra y suelta los vehículos entre las diferentes etapas</p>
            </div>
            <button
              onClick={handleManualSync}
              disabled={isLoading}
              className="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <span>🔄</span>
              <span>Actualizar Datos</span>
            </button>
          </div>
          
          {/* Barra de búsqueda */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar vehículos en el tablero..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white transition-all duration-300"
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            
            <select
              value={searchField}
              onChange={(e) => setSearchField(e.target.value as any)}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white transition-all duration-300 min-w-[150px]"
            >
              <option value="todos">Todos los campos</option>
              <option value="referencia">Referencia</option>
              <option value="marca">Marca</option>
              <option value="modelo">Modelo</option>
              <option value="matricula">Matrícula</option>
              <option value="bastidor">Bastidor</option>
              <option value="tipo">Tipo</option>
            </select>
            
            <div className="flex items-center space-x-2 text-sm text-slate-600">
              <span>Total: {vehiculos.length}</span>
              <span>•</span>
              <span>Mostrando: {filteredVehiculos.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tablero Kanban - Ocupa el resto de la pantalla */}
      <div className="flex-1 overflow-hidden p-4">
        <KanbanBoard
          vehiculos={filteredVehiculos}
          onUpdateVehiculos={setVehiculos}
        />
      </div>

      {/* Modal de Edición */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header del Modal */}
            <div className="bg-green-600 px-6 py-4 rounded-t-lg">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Editar Vehículo</h2>
                <button
                  onClick={closeEditModal}
                  className="text-white hover:text-green-100 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Formulario de Edición */}
            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-referencia" className="block text-sm font-medium text-slate-700 mb-1">
                    Referencia *
                  </label>
                  <input
                    type="text"
                    id="edit-referencia"
                    name="referencia"
                    value={editFormData.referencia}
                    onChange={handleEditInputChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: #1040"
                  />
                </div>

                <div>
                  <label htmlFor="edit-tipo" className="block text-sm font-medium text-slate-700 mb-1">
                    Tipo *
                  </label>
                  <select
                    id="edit-tipo"
                    name="tipo"
                    value={editFormData.tipo}
                    onChange={handleEditInputChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  >
                    <option value="">Seleccionar tipo</option>
                    <option value="Compra">Compra</option>
                    <option value="Coche R">Coche R</option>
                    <option value="Deposito Venta">Deposito Venta</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-marca" className="block text-sm font-medium text-slate-700 mb-1">
                    Marca *
                  </label>
                  <input
                    type="text"
                    id="edit-marca"
                    name="marca"
                    value={editFormData.marca}
                    onChange={handleEditInputChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: Opel"
                  />
                </div>

                <div>
                  <label htmlFor="edit-modelo" className="block text-sm font-medium text-slate-700 mb-1">
                    Modelo *
                  </label>
                  <input
                    type="text"
                    id="edit-modelo"
                    name="modelo"
                    value={editFormData.modelo}
                    onChange={handleEditInputChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                    placeholder="Ej: Corsa"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-matricula" className="block text-sm font-medium text-slate-700 mb-1">
                    Matrícula *
                  </label>
                  <input
                    type="text"
                    id="edit-matricula"
                    name="matricula"
                    value={editFormData.matricula}
                    onChange={handleEditInputChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors font-mono"
                    placeholder="Ej: 1234ABC"
                  />
                </div>

                <div>
                  <label htmlFor="edit-bastidor" className="block text-sm font-medium text-slate-700 mb-1">
                    Bastidor *
                  </label>
                  <input
                    type="text"
                    id="edit-bastidor"
                    name="bastidor"
                    value={editFormData.bastidor}
                    onChange={handleEditInputChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors font-mono"
                    placeholder="Ej: W0L00000000000000"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="edit-kms" className="block text-sm font-medium text-slate-700 mb-1">
                  Kilómetros *
                </label>
                <input
                  type="number"
                  id="edit-kms"
                  name="kms"
                  value={editFormData.kms}
                  onChange={handleEditInputChange}
                  required
                  min="0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  placeholder="Ej: 50000"
                />
              </div>

              {/* Botones del Modal */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isUpdating ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Actualizando...</span>
                    </div>
                  ) : (
                    'Actualizar'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ToastContainer />
      <ConfirmModalComponent />
    </div>
  )
}