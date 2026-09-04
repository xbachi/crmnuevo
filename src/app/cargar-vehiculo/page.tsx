'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { Inversor } from '@/lib/database'
import ProtectedRoute from '@/components/ProtectedRoute'
import {
  validarCampos,
  primerCampoConError,
  sinError,
  resumenErrores,
  type Regla,
} from '@/lib/validacion'
import {
  CampoError,
  Obligatorio,
  claseInput,
  enfocarCampo,
} from '@/components/CampoError'

const CLASE_INPUT =
  'w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors'
const CLASE_INPUT_GASTO =
  'w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500'

// En orden de aparición en el formulario: el foco va al primer error.
const REGLAS_VEHICULO: Record<string, Regla> = {
  referencia: { requerido: true, etiqueta: 'la referencia' },
  tipo: { requerido: true, etiqueta: 'el tipo' },
  marca: { requerido: true, etiqueta: 'la marca' },
  modelo: { requerido: true, etiqueta: 'el modelo' },
  matricula: { requerido: true, etiqueta: 'la matrícula', tipo: 'matricula' },
  bastidor: { requerido: true, etiqueta: 'el bastidor' },
  kms: { requerido: true, etiqueta: 'los kilómetros', tipo: 'numero', min: 0 },
  inversorId: {
    etiqueta: 'el inversor',
    personalizada: (v, valores) =>
      valores.tipo === 'Inversor' && !v ? 'Selecciona el inversor' : null,
  },
  precioCompra: { etiqueta: 'el precio de compra', tipo: 'numero', min: 0 },
  precioPublicacion: {
    etiqueta: 'el precio de publicación',
    tipo: 'numero',
    min: 0,
  },
  gastosTransporte: { etiqueta: 'transporte', tipo: 'numero', min: 0 },
  gastosTasas: { etiqueta: 'tasas', tipo: 'numero', min: 0 },
  gastosMecanica: { etiqueta: 'mecánica', tipo: 'numero', min: 0 },
  gastosPintura: { etiqueta: 'pintura', tipo: 'numero', min: 0 },
  gastosLimpieza: { etiqueta: 'limpieza', tipo: 'numero', min: 0 },
  gastosOtros: { etiqueta: 'otros gastos', tipo: 'numero', min: 0 },
}

export default function CargarVehiculo() {
  const [formData, setFormData] = useState({
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
  })
  const [inversores, setInversores] = useState<Inversor[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const router = useRouter()
  const { showToast, ToastContainer } = useToast()

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

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target
    setErrores((prev) => sinError(prev, name))
    setFormData((prev) => {
      const newData = {
        ...prev,
        [name]:
          type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
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
    fetchInversores()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validacion = validarCampos(formData, REGLAS_VEHICULO)
    setErrores(validacion.errores)
    if (!validacion.ok) {
      showToast(resumenErrores(validacion.errores), 'error')
      enfocarCampo(primerCampoConError(validacion.errores))
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/vehiculos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          kms: parseInt(formData.kms),
          tipo: formData.tipo, // Mantener el tipo original
          tipo_vehiculo: formData.tipo === 'Coche R' ? 'coche_r' : 'normal',
          esCocheInversor: formData.tipo === 'Inversor',
          inversorId:
            formData.tipo === 'Inversor' && formData.inversorId
              ? parseInt(formData.inversorId)
              : undefined,
          fechaCompra:
            formData.tipo === 'Inversor'
              ? formData.fechaCompra || undefined
              : undefined,
          precioCompra:
            formData.tipo === 'Inversor' && formData.precioCompra
              ? parseFloat(formData.precioCompra)
              : undefined,
          gastosTransporte:
            formData.tipo === 'Inversor' && formData.gastosTransporte
              ? parseFloat(formData.gastosTransporte)
              : undefined,
          gastosTasas:
            formData.tipo === 'Inversor' && formData.gastosTasas
              ? parseFloat(formData.gastosTasas)
              : undefined,
          gastosMecanica:
            formData.tipo === 'Inversor' && formData.gastosMecanica
              ? parseFloat(formData.gastosMecanica)
              : undefined,
          gastosPintura:
            formData.tipo === 'Inversor' && formData.gastosPintura
              ? parseFloat(formData.gastosPintura)
              : undefined,
          gastosLimpieza:
            formData.tipo === 'Inversor' && formData.gastosLimpieza
              ? parseFloat(formData.gastosLimpieza)
              : undefined,
          gastosOtros:
            formData.tipo === 'Inversor' && formData.gastosOtros
              ? parseFloat(formData.gastosOtros)
              : undefined,
          precioPublicacion:
            formData.tipo === 'Inversor' && formData.precioPublicacion
              ? parseFloat(formData.precioPublicacion)
              : undefined,
          precioVenta:
            formData.tipo === 'Inversor' && formData.precioVenta
              ? parseFloat(formData.precioVenta)
              : undefined,
          notasInversor:
            formData.tipo === 'Inversor'
              ? formData.notasInversor || undefined
              : undefined,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        showToast('Vehículo creado exitosamente', 'success')
        setErrores({})
        setFormData({
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
        })

        // Redirigir después de un breve delay
        setTimeout(() => {
          router.push('/vehiculos?refresh=true')
        }, 1500)
      } else {
        showToast(result.error || 'Error al crear el vehículo', 'error')
      }
    } catch (error) {
      showToast('Error al crear el vehículo', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ProtectedRoute>
      <div
        className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative"
        style={{
          backgroundImage: 'url(/fondo.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Overlay para mejorar la legibilidad */}
        <div className="absolute inset-0 bg-black/80"></div>

        {/* Contenido principal */}
        <div className="relative z-10 w-full max-w-4xl">
          {/* Título minimalista */}
          <div className="text-center mb-8">
            <div className="mx-auto h-16 w-16 flex items-center justify-center mb-4">
              <img
                src="/logocontrato.png"
                alt="SevenCars Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Cargar Vehículo Nuevo
            </h1>
            <p className="text-white/90">
              Registra un nuevo vehículo en el sistema
            </p>
          </div>

          {/* Formulario compacto */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200">
            <form onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="referencia"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Referencia
                    <Obligatorio />
                  </label>
                  <input
                    type="text"
                    id="referencia"
                    name="referencia"
                    value={formData.referencia || ''}
                    onChange={handleInputChange}
                    required
                    aria-invalid={!!errores.referencia}
                    aria-describedby={errores.referencia ? 'referencia-error' : undefined}
                    className={claseInput(errores.referencia, CLASE_INPUT)}
                    placeholder="Ej: #1040, I-9, D-5, R-3"
                  />
                  <CampoError id="referencia-error" mensaje={errores.referencia} />
                </div>

                <div>
                  <label
                    htmlFor="tipo"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Tipo
                    <Obligatorio />
                  </label>
                  <select
                    id="tipo"
                    name="tipo"
                    value={formData.tipo || ''}
                    onChange={handleInputChange}
                    required
                    aria-invalid={!!errores.tipo}
                    aria-describedby={errores.tipo ? 'tipo-error' : undefined}
                    className={claseInput(errores.tipo, CLASE_INPUT)}
                  >
                    <option value="">Seleccionar tipo</option>
                    <option value="Compra">Compra</option>
                    <option value="Coche R">Coche R</option>
                    <option value="Deposito Venta">Deposito Venta</option>
                    <option value="Inversor">Inversor</option>
                  </select>
                  <CampoError id="tipo-error" mensaje={errores.tipo} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="marca"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Marca
                    <Obligatorio />
                  </label>
                  <input
                    type="text"
                    id="marca"
                    name="marca"
                    value={formData.marca || ''}
                    onChange={handleInputChange}
                    required
                    aria-invalid={!!errores.marca}
                    aria-describedby={errores.marca ? 'marca-error' : undefined}
                    className={claseInput(errores.marca, CLASE_INPUT)}
                    placeholder="Ej: Opel"
                  />
                  <CampoError id="marca-error" mensaje={errores.marca} />
                </div>

                <div>
                  <label
                    htmlFor="modelo"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Modelo
                    <Obligatorio />
                  </label>
                  <input
                    type="text"
                    id="modelo"
                    name="modelo"
                    value={formData.modelo || ''}
                    onChange={handleInputChange}
                    required
                    aria-invalid={!!errores.modelo}
                    aria-describedby={errores.modelo ? 'modelo-error' : undefined}
                    className={claseInput(errores.modelo, CLASE_INPUT)}
                    placeholder="Ej: Corsa"
                  />
                  <CampoError id="modelo-error" mensaje={errores.modelo} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="matricula"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Matrícula
                    <Obligatorio />
                  </label>
                  <input
                    type="text"
                    id="matricula"
                    name="matricula"
                    value={formData.matricula || ''}
                    onChange={handleInputChange}
                    required
                    aria-invalid={!!errores.matricula}
                    aria-describedby={errores.matricula ? 'matricula-error' : undefined}
                    className={claseInput(errores.matricula, `${CLASE_INPUT} font-mono`)}
                    placeholder="Ej: 1234ABC"
                  />
                  <CampoError id="matricula-error" mensaje={errores.matricula} />
                </div>

                <div>
                  <label
                    htmlFor="bastidor"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Bastidor
                    <Obligatorio />
                  </label>
                  <input
                    type="text"
                    id="bastidor"
                    name="bastidor"
                    value={formData.bastidor || ''}
                    onChange={handleInputChange}
                    required
                    aria-invalid={!!errores.bastidor}
                    aria-describedby={errores.bastidor ? 'bastidor-error' : undefined}
                    className={claseInput(errores.bastidor, `${CLASE_INPUT} font-mono`)}
                    placeholder="Ej: W0L00000000000000"
                  />
                  <CampoError id="bastidor-error" mensaje={errores.bastidor} />
                </div>
              </div>

              {/* Color, Fecha de Matriculación y Fecha de Compra */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="color"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
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
                  <label
                    htmlFor="fechaMatriculacion"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
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
                <div>
                  <label
                    htmlFor="fechaCompra"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Fecha de Compra
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

              <div>
                <label
                  htmlFor="kms"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Kilómetros
                  <Obligatorio />
                </label>
                <input
                  type="number"
                  id="kms"
                  name="kms"
                  value={formData.kms || ''}
                  onChange={handleInputChange}
                  required
                  min="0"
                  aria-invalid={!!errores.kms}
                  aria-describedby={errores.kms ? 'kms-error' : undefined}
                  className={claseInput(errores.kms, CLASE_INPUT)}
                  placeholder="Ej: 50000"
                />
                <CampoError id="kms-error" mensaje={errores.kms} />
              </div>

              {/* Sección de Inversor */}
              {formData.tipo === 'Inversor' && (
                <div className="border-t border-slate-200 pt-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-slate-800 mb-2">
                      Datos del Inversor
                    </h3>
                    <p className="text-sm text-slate-600">
                      Completa la información financiera del vehículo de
                      inversión
                    </p>
                  </div>
                  <div className="space-y-4 bg-slate-50 p-4 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="inversorId"
                          className="block text-sm font-medium text-slate-700 mb-1"
                        >
                          Inversor
                          <Obligatorio />
                        </label>
                        <select
                          id="inversorId"
                          name="inversorId"
                          value={formData.inversorId || ''}
                          onChange={handleInputChange}
                          required={formData.esCocheInversor}
                          aria-invalid={!!errores.inversorId}
                          aria-describedby={errores.inversorId ? 'inversorId-error' : undefined}
                          className={claseInput(errores.inversorId, CLASE_INPUT)}
                        >
                          <option value="">Seleccionar inversor</option>
                          {inversores.map((inversor) => (
                            <option key={inversor.id} value={inversor.id}>
                              {inversor.nombre}
                            </option>
                          ))}
                        </select>
                        <CampoError id="inversorId-error" mensaje={errores.inversorId} />
                      </div>

                      <div>
                        <label
                          htmlFor="fechaCompra"
                          className="block text-sm font-medium text-slate-700 mb-1"
                        >
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
                        <label
                          htmlFor="precioCompra"
                          className="block text-sm font-medium text-slate-700 mb-1"
                        >
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
                          aria-invalid={!!errores.precioCompra}
                          aria-describedby={errores.precioCompra ? 'precioCompra-error' : undefined}
                          className={claseInput(errores.precioCompra, CLASE_INPUT)}
                          placeholder="0.00"
                        />
                        <CampoError id="precioCompra-error" mensaje={errores.precioCompra} />
                      </div>

                      <div>
                        <label
                          htmlFor="precioPublicacion"
                          className="block text-sm font-medium text-slate-700 mb-1"
                        >
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
                          aria-invalid={!!errores.precioPublicacion}
                          aria-describedby={errores.precioPublicacion ? 'precioPublicacion-error' : undefined}
                          className={claseInput(errores.precioPublicacion, CLASE_INPUT)}
                          placeholder="0.00"
                        />
                        <CampoError id="precioPublicacion-error" mensaje={errores.precioPublicacion} />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Gastos (€)
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label
                            htmlFor="gastosTransporte"
                            className="block text-xs text-slate-600 mb-1"
                          >
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
                            aria-invalid={!!errores.gastosTransporte}
                            aria-describedby={errores.gastosTransporte ? 'gastosTransporte-error' : undefined}
                            className={claseInput(errores.gastosTransporte, CLASE_INPUT_GASTO)}
                            placeholder="0"
                          />
                          <CampoError id="gastosTransporte-error" mensaje={errores.gastosTransporte} />
                        </div>
                        <div>
                          <label
                            htmlFor="gastosTasas"
                            className="block text-xs text-slate-600 mb-1"
                          >
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
                            aria-invalid={!!errores.gastosTasas}
                            aria-describedby={errores.gastosTasas ? 'gastosTasas-error' : undefined}
                            className={claseInput(errores.gastosTasas, CLASE_INPUT_GASTO)}
                            placeholder="0"
                          />
                          <CampoError id="gastosTasas-error" mensaje={errores.gastosTasas} />
                        </div>
                        <div>
                          <label
                            htmlFor="gastosMecanica"
                            className="block text-xs text-slate-600 mb-1"
                          >
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
                            aria-invalid={!!errores.gastosMecanica}
                            aria-describedby={errores.gastosMecanica ? 'gastosMecanica-error' : undefined}
                            className={claseInput(errores.gastosMecanica, CLASE_INPUT_GASTO)}
                            placeholder="0"
                          />
                          <CampoError id="gastosMecanica-error" mensaje={errores.gastosMecanica} />
                        </div>
                        <div>
                          <label
                            htmlFor="gastosPintura"
                            className="block text-xs text-slate-600 mb-1"
                          >
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
                            aria-invalid={!!errores.gastosPintura}
                            aria-describedby={errores.gastosPintura ? 'gastosPintura-error' : undefined}
                            className={claseInput(errores.gastosPintura, CLASE_INPUT_GASTO)}
                            placeholder="0"
                          />
                          <CampoError id="gastosPintura-error" mensaje={errores.gastosPintura} />
                        </div>
                        <div>
                          <label
                            htmlFor="gastosLimpieza"
                            className="block text-xs text-slate-600 mb-1"
                          >
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
                            aria-invalid={!!errores.gastosLimpieza}
                            aria-describedby={errores.gastosLimpieza ? 'gastosLimpieza-error' : undefined}
                            className={claseInput(errores.gastosLimpieza, CLASE_INPUT_GASTO)}
                            placeholder="0"
                          />
                          <CampoError id="gastosLimpieza-error" mensaje={errores.gastosLimpieza} />
                        </div>
                        <div>
                          <label
                            htmlFor="gastosOtros"
                            className="block text-xs text-slate-600 mb-1"
                          >
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
                            aria-invalid={!!errores.gastosOtros}
                            aria-describedby={errores.gastosOtros ? 'gastosOtros-error' : undefined}
                            className={claseInput(errores.gastosOtros, CLASE_INPUT_GASTO)}
                            placeholder="0"
                          />
                          <CampoError id="gastosOtros-error" mensaje={errores.gastosOtros} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="notasInversor"
                        className="block text-sm font-medium text-slate-700 mb-1"
                      >
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

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Cargando...</span>
                    </div>
                  ) : (
                    'Cargar Vehículo'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        <ToastContainer />
      </div>
    </ProtectedRoute>
  )
}
