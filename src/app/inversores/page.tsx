'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Inversor } from '@/lib/database'
import { useSimpleToast } from '@/hooks/useSimpleToast'

export default function InversoresPage() {
  const router = useRouter()
  const { showToast, ToastContainer } = useSimpleToast()
  
  const [inversores, setInversores] = useState<Inversor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [inversorToDelete, setInversorToDelete] = useState<Inversor | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  
  // Form data
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    capitalAportado: '',
    fechaAporte: '',
    notasInternas: ''
  })

  const fetchInversores = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/inversores')
      if (!response.ok) throw new Error('Error al cargar inversores')
      const data = await response.json()
      setInversores(data)
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al cargar inversores', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchInversores()
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setIsSaving(true)
      
      const response = await fetch('/api/inversores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          capitalAportado: formData.capitalAportado ? parseFloat(formData.capitalAportado) : 0,
          fechaAporte: formData.fechaAporte || new Date().toISOString().split('T')[0]
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al crear inversor')
      }
      
      showToast('Inversor creado correctamente', 'success')
      
      // Reset form and hide it
      setFormData({
        nombre: '',
        email: '',
        capitalAportado: '',
        fechaAporte: '',
        notasInternas: ''
      })
      setShowForm(false)
      
      await fetchInversores()
    } catch (error) {
      console.error('Error:', error)
      showToast(error instanceof Error ? error.message : 'Error al crear inversor', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleView = (id: number) => {
    router.push(`/inversores/${id}`)
  }

  const handleCreate = () => {
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setFormData({
      nombre: '',
      email: '',
      capitalAportado: '',
      fechaAporte: '',
      notasInternas: ''
    })
  }

  const handleDeleteClick = (inversor: Inversor) => {
    setInversorToDelete(inversor)
  }

  const handleDeleteConfirm = async () => {
    if (!inversorToDelete) return

    try {
      setIsDeleting(true)
      const response = await fetch(`/api/inversores/${inversorToDelete.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchInversores()
        showToast('Inversor eliminado correctamente', 'success')
        setInversorToDelete(null)
      } else {
        const error = await response.json()
        showToast(error.error || 'Error al eliminar inversor', 'error')
      }
    } catch (error) {
      console.error('Error:', error)
      showToast('Error al eliminar inversor', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteCancel = () => {
    setInversorToDelete(null)
  }

  const filteredInversores = inversores.filter(inversor =>
    inversor.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inversor.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-primary-50 to-primary-100">
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Gestión de Inversores</h1>
            <p className="text-slate-600">Crea, edita y gestiona tu cartera de inversores</p>
          </div>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gray-100">
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 mb-2">Gestión de Inversores</h1>
              <p className="text-slate-600">Crea, edita y gestiona tu cartera de inversores</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => router.push('/dashboard-inversores')}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Ver Dashboard
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Agregar Inversor</span>
              </button>
            </div>
          </div>

          {/* Búsqueda y controles de vista */}
          <div className="flex justify-between items-center">
            <div className="max-w-md">
              <input
                type="text"
                placeholder="Buscar inversores..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            
            {/* Controles de vista */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'cards' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'list' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Formulario de creación */}
        {showForm && (
          <div className="mb-8 bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Nuevo Inversor</h2>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="nombre" className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre completo *
                </label>
                <input
                  type="text"
                  id="nombre"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  placeholder="Ej: Juan Pérez"
                />
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  placeholder="Ej: juan@example.com"
                />
              </div>
              
              <div>
                <label htmlFor="capitalAportado" className="block text-sm font-medium text-slate-700 mb-1">
                  Capital aportado (€) *
                </label>
                <input
                  type="number"
                  id="capitalAportado"
                  name="capitalAportado"
                  value={formData.capitalAportado}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  placeholder="0.00"
                />
              </div>
              
              <div>
                <label htmlFor="fechaAporte" className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha de aporte
                </label>
                <input
                  type="date"
                  id="fechaAporte"
                  name="fechaAporte"
                  value={formData.fechaAporte}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="notasInternas" className="block text-sm font-medium text-slate-700 mb-1">
                Notas internas
              </label>
              <textarea
                id="notasInternas"
                name="notasInternas"
                value={formData.notasInternas}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                placeholder="Notas internas sobre el inversor..."
              />
            </div>
            
            <div className="pt-4">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Creando...</span>
                  </>
                ) : (
                  'Crear Inversor'
                )}
              </button>
            </div>
          </form>
          </div>
        )}

        {/* Lista de inversores */}
        {filteredInversores.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No se encontraron inversores' : 'No hay inversores registrados'}
            </h3>
            <p className="text-gray-500">
              {searchTerm 
                ? 'Intenta con otros términos de búsqueda'
                : 'Comienza creando tu primer inversor usando el formulario de arriba'
              }
            </p>
          </div>
        ) : (
          viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredInversores.map((inversor) => (
                <div key={inversor.id} className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{inversor.nombre}</h3>
                      {inversor.email && (
                        <p className="text-sm text-gray-600">{inversor.email}</p>
                      )}
                      {inversor.documento && (
                        <p className="text-sm text-gray-500">ID: {inversor.documento}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleView(inversor.id)}
                        className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors"
                      >
                        Ver
                      </button>
                      <button
                        onClick={() => handleDeleteClick(inversor)}
                        className="px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>Capital aportado: <span className="font-medium">€{(inversor.capitalAportado || 0).toLocaleString()}</span></p>
                    <p>Fecha de aporte: <span className="font-medium">{inversor.fechaAporte ? new Date(inversor.fechaAporte).toLocaleDateString('es-ES') : 'No especificada'}</span></p>
                    <p>Capital invertido: <span className="font-medium">€{(inversor.capitalInvertido || 0).toLocaleString()}</span></p>
                    <p>Capital disponible: <span className="font-medium">€{((inversor.capitalAportado || 0) - (inversor.capitalInvertido || 0)).toLocaleString()}</span></p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capital Aportado</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Aporte</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capital Comprometido</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capital Disponible</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredInversores.map((inversor) => (
                      <tr key={inversor.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{inversor.nombre}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">{inversor.email || '-'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">€{(inversor.capitalAportado || 0).toLocaleString()}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            {inversor.fechaAporte ? new Date(inversor.fechaAporte).toLocaleDateString('es-ES') : 'No especificada'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            €{(inversor.capitalInvertido || 0).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            €{((inversor.capitalAportado || 0) - (inversor.capitalInvertido || 0)).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-3">
                            <button
                              onClick={() => handleView(inversor.id)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Ver
                            </button>
                            <button
                              onClick={() => handleDeleteClick(inversor)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </main>

      {/* Modal de confirmación de eliminación */}
      {inversorToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">Eliminar Inversor</h3>
                <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-gray-600">
                ¿Estás seguro de que quieres eliminar al inversor <strong>{inversorToDelete.nombre}</strong>?
                <br />
                <span className="text-red-600 font-medium">Todos los datos asociados se perderán permanentemente.</span>
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleDeleteCancel}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  )
}