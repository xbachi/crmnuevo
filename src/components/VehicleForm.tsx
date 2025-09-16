'use client'

import { useState, useEffect } from 'react'
import { Inversor } from '@/lib/direct-database'

interface VehicleFormData {
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: string
  tipo: string
  color: string
  fechaMatriculacion: string
  esCocheInversor: boolean
  inversorId: string
  fechaCompra: string
  precioCompra: string
  gastosTransporte: string
  gastosTasas: string
  gastosMecanica: string
  gastosPintura: string
  gastosLimpieza: string
  gastosOtros: string
  precioPublicacion: string
  precioVenta: string
  notasInversor: string
}

interface VehicleFormProps {
  initialData?: Partial<VehicleFormData>
  onSubmit: (data: VehicleFormData) => Promise<void>
  onCancel?: () => void
  isLoading?: boolean
  submitText?: string
  showInversorSection?: boolean
  fixedTipo?: string
  asForm?: boolean // Nueva prop para controlar si renderizar como form
}

export default function VehicleForm({
  initialData = {},
  onSubmit,
  onCancel,
  isLoading = false,
  submitText = 'Crear Vehículo',
  showInversorSection = true,
  fixedTipo,
  asForm = true
}: VehicleFormProps) {
  const [formData, setFormData] = useState<VehicleFormData>({
    referencia: '',
    marca: '',
    modelo: '',
    matricula: '',
    bastidor: '',
    kms: '',
    tipo: '',
    color: '',
    fechaMatriculacion: '',
    esCocheInversor: false,
    inversorId: '',
    fechaCompra: '',
    precioCompra: '',
    gastosTransporte: '',
    gastosTasas: '',
    gastosMecanica: '',
    gastosPintura: '',
    gastosLimpieza: '',
    gastosOtros: '',
    precioPublicacion: '',
    precioVenta: '',
    notasInversor: '',
    ...initialData
  })
  const [inversores, setInversores] = useState<Inversor[]>([])

  const formatReferencia = (value: string, tipo: string) => {
    if (!value) return value
    
    // Limpiar el valor de espacios y caracteres especiales
    const cleanValue = value.replace(/[^a-zA-Z0-9#-]/g, '')
    
    if (tipo === 'Compra') {
      // Para compras: siempre con #
      if (cleanValue.startsWith('#')) {
        return cleanValue
      } else {
        return `#${cleanValue}`
      }
    } else if (tipo === 'Inversor') {
      // Para inversores: siempre con I-
      if (cleanValue.startsWith('I-')) {
        return cleanValue
      } else if (cleanValue.startsWith('I')) {
        return cleanValue.replace('I', 'I-')
      } else {
        return `I-${cleanValue}`
      }
    } else if (tipo === 'Deposito') {
      // Para depósito: siempre con D-
      if (cleanValue.startsWith('D-')) {
        return cleanValue
      } else if (cleanValue.startsWith('D')) {
        return cleanValue.replace('D', 'D-')
      } else {
        return `D-${cleanValue}`
      }
    } else if (tipo === 'Reserva') {
      // Para reserva: siempre con R-
      if (cleanValue.startsWith('R-')) {
        return cleanValue
      } else if (cleanValue.startsWith('R')) {
        return cleanValue.replace('R', 'R-')
      } else {
        return `R-${cleanValue}`
      }
    }
    
    return cleanValue
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
      }
      
      // Formatear referencia automáticamente
      if (name === 'referencia') {
        newData.referencia = formatReferencia(value, prev.tipo)
      }
      
      // Si se selecciona "Inversor" como tipo, marcar automáticamente como coche de inversor
      if (name === 'tipo' && value === 'Inversor') {
        newData.esCocheInversor = true
        // Re-formatear la referencia con el nuevo tipo
        if (prev.referencia) {
          newData.referencia = formatReferencia(prev.referencia, value)
        }
      } else if (name === 'tipo' && value !== 'Inversor') {
        newData.esCocheInversor = false
        // Re-formatear la referencia con el nuevo tipo
        if (prev.referencia) {
          newData.referencia = formatReferencia(prev.referencia, value)
        }
        // Limpiar campos de inversor si se cambia el tipo
        newData.inversorId = ''
        newData.fechaCompra = ''
        newData.precioCompra = ''
        newData.gastosTransporte = ''
        newData.gastosTasas = ''
        newData.gastosMecanica = ''
        newData.gastosPintura = ''
        newData.gastosLimpieza = ''
        newData.gastosOtros = ''
        newData.precioPublicacion = ''
        newData.precioVenta = ''
        newData.notasInversor = ''
      }
      
      return newData
    })
  }

  const fetchInversores = async () => {
    try {
      const response = await fetch('/api/inversores')
      if (response.ok) {
        const data = await response.json()
        setInversores(data)
      }
    } catch (error) {
      console.error('Error al cargar inversores:', error)
    }
  }

  useEffect(() => {
    if (showInversorSection) {
      fetchInversores()
    }
  }, [showInversorSection])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validación específica para depósitos
    if (fixedTipo === 'Deposito Venta' || formData.tipo === 'D') {
      const camposObligatorios = [
        { campo: 'marca', valor: formData.marca, nombre: 'Marca' },
        { campo: 'modelo', valor: formData.modelo, nombre: 'Modelo' },
        { campo: 'bastidor', valor: formData.bastidor, nombre: 'Nº de Bastidor' },
        { campo: 'matricula', valor: formData.matricula, nombre: 'Matrícula' },
        { campo: 'fechaMatriculacion', valor: formData.fechaMatriculacion, nombre: 'Fecha de 1ª Matriculación' },
        { campo: 'kms', valor: formData.kms, nombre: 'Kilometraje' }
      ]
      
      const camposFaltantes = camposObligatorios.filter(campo => !campo.valor || campo.valor.trim() === '')
      
      if (camposFaltantes.length > 0) {
        alert(`Los siguientes campos son obligatorios para depósitos:\n${camposFaltantes.map(c => `• ${c.nombre}`).join('\n')}`)
        return
      }
    }
    
    await onSubmit(formData)
  }

  const formContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="referencia" className="block text-sm font-medium text-slate-700 mb-1">
            Referencia *
          </label>
          <input
            type="text"
            id="referencia"
            name="referencia"
            value={formData.referencia || ''}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
            placeholder="Ej: #1040, I-9, D-5, R-3"
          />
        </div>

        <div>
          <label htmlFor="tipo" className="block text-sm font-medium text-slate-700 mb-1">
            Tipo *
          </label>
          <select
            id="tipo"
            name="tipo"
            value={formData.tipo || ''}
            onChange={handleInputChange}
            required
            disabled={!!fixedTipo}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          >
            <option value="">Seleccionar tipo</option>
            <option value="Compra">Compra</option>
            <option value="Coche R">Coche R</option>
            <option value="Deposito Venta">Deposito Venta</option>
            <option value="Inversor">Inversor</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="marca" className="block text-sm font-medium text-slate-700 mb-1">
            Marca *
          </label>
          <input
            type="text"
            id="marca"
            name="marca"
            value={formData.marca || ''}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
            placeholder="Ej: Opel"
          />
        </div>

        <div>
          <label htmlFor="modelo" className="block text-sm font-medium text-slate-700 mb-1">
            Modelo *
          </label>
          <input
            type="text"
            id="modelo"
            name="modelo"
            value={formData.modelo || ''}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
            placeholder="Ej: Corsa"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="matricula" className="block text-sm font-medium text-slate-700 mb-1">
            Matrícula *
          </label>
          <input
            type="text"
            id="matricula"
            name="matricula"
            value={formData.matricula || ''}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors font-mono"
            placeholder="Ej: 1234ABC"
          />
        </div>

        <div>
          <label htmlFor="bastidor" className="block text-sm font-medium text-slate-700 mb-1">
            Bastidor *
          </label>
          <input
            type="text"
            id="bastidor"
            name="bastidor"
            value={formData.bastidor || ''}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors font-mono"
            placeholder="Ej: W0L00000000000000"
          />
        </div>
      </div>

      {/* Color y Fecha de Matriculación */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="color" className="block text-sm font-medium text-slate-700 mb-1">
            Color
          </label>
          <input
            type="text"
            id="color"
            name="color"
            value={formData.color || ''}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
            placeholder="Ej: Blanco, Negro, Azul..."
          />
        </div>
        <div>
          <label htmlFor="fechaMatriculacion" className="block text-sm font-medium text-slate-700 mb-1">
            Fecha de Matriculación
          </label>
          <input
            type="date"
            id="fechaMatriculacion"
            name="fechaMatriculacion"
            value={formData.fechaMatriculacion || ''}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          />
        </div>
      </div>

      <div>
        <label htmlFor="kms" className="block text-sm font-medium text-slate-700 mb-1">
          Kilómetros *
        </label>
        <input
          type="number"
          id="kms"
          name="kms"
          value={formData.kms || ''}
          onChange={handleInputChange}
          required
          min="0"
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
          placeholder="Ej: 50000"
        />
      </div>

      {/* Sección de Inversor */}
      {showInversorSection && formData.tipo === 'Inversor' && (
        <div className="border-t border-slate-200 pt-6">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-slate-800 mb-2">Datos del Inversor</h3>
            <p className="text-sm text-slate-600">Completa la información financiera del vehículo de inversión</p>
          </div>
          <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="inversorId" className="block text-sm font-medium text-slate-700 mb-1">
                  Inversor *
                </label>
                <select
                  id="inversorId"
                  name="inversorId"
                  value={formData.inversorId || ''}
                  onChange={handleInputChange}
                  required={formData.esCocheInversor}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                >
                  <option value="">Seleccionar inversor</option>
                  {inversores.map((inversor) => (
                    <option key={inversor.id} value={inversor.id}>
                      {inversor.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="fechaCompra" className="block text-sm font-medium text-slate-700 mb-1">
                  Fecha de compra
                </label>
                <input
                  type="date"
                  id="fechaCompra"
                  name="fechaCompra"
                  value={formData.fechaCompra || ''}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="precioCompra" className="block text-sm font-medium text-slate-700 mb-1">
                  Precio de compra (€)
                </label>
                <input
                  type="number"
                  id="precioCompra"
                  name="precioCompra"
                  value={formData.precioCompra || ''}
                  onChange={handleInputChange}
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label htmlFor="precioPublicacion" className="block text-sm font-medium text-slate-700 mb-1">
                  Precio de publicación (€)
                </label>
                <input
                  type="number"
                  id="precioPublicacion"
                  name="precioPublicacion"
                  value={formData.precioPublicacion || ''}
                  onChange={handleInputChange}
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Gastos (€)
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="gastosTransporte" className="block text-xs text-slate-600 mb-1">
                    Transporte
                  </label>
                  <input
                    type="number"
                    id="gastosTransporte"
                    name="gastosTransporte"
                    value={formData.gastosTransporte || ''}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="gastosTasas" className="block text-xs text-slate-600 mb-1">
                    Tasas/Gestoría
                  </label>
                  <input
                    type="number"
                    id="gastosTasas"
                    name="gastosTasas"
                    value={formData.gastosTasas || ''}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="gastosMecanica" className="block text-xs text-slate-600 mb-1">
                    Mecánica
                  </label>
                  <input
                    type="number"
                    id="gastosMecanica"
                    name="gastosMecanica"
                    value={formData.gastosMecanica || ''}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="gastosPintura" className="block text-xs text-slate-600 mb-1">
                    Pintura
                  </label>
                  <input
                    type="number"
                    id="gastosPintura"
                    name="gastosPintura"
                    value={formData.gastosPintura || ''}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="gastosLimpieza" className="block text-xs text-slate-600 mb-1">
                    Limpieza
                  </label>
                  <input
                    type="number"
                    id="gastosLimpieza"
                    name="gastosLimpieza"
                    value={formData.gastosLimpieza || ''}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="gastosOtros" className="block text-xs text-slate-600 mb-1">
                    Otros
                  </label>
                  <input
                    type="number"
                    id="gastosOtros"
                    name="gastosOtros"
                    value={formData.gastosOtros || ''}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="notasInversor" className="block text-sm font-medium text-slate-700 mb-1">
                Notas para inversor
              </label>
              <textarea
                id="notasInversor"
                name="notasInversor"
                value={formData.notasInversor || ''}
                onChange={handleInputChange}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                placeholder="Notas específicas para el inversor..."
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-2 pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-slate-600 hover:text-slate-800"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isLoading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Creando...</span>
            </div>
          ) : (
            submitText
          )}
        </button>
      </div>
    </div>
  )

  if (asForm) {
    return (
      <form onSubmit={handleSubmit}>
        {formContent}
      </form>
    )
  }

  return formContent
}
