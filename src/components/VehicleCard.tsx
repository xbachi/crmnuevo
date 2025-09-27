'use client'

import { useState, memo, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatVehicleReference, generateVehicleSlug } from '@/lib/utils'

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  tipo: string
  estado: 'ACTIVO' | 'VENDIDO' | 'RESERVADO' | 'BORRADOR' | 'FINALIZADO'
  orden: number
  createdAt: string
  esCocheInversor?: boolean
  inversorId?: number
  inversorNombre?: string
  deposito_id?: number
  fechaCompra?: string
  precioCompra?: number
  gastosTransporte?: number
  gastosTasas?: number
  gastosMecanica?: number
  gastosPintura?: number
  gastosLimpieza?: number
  gastosOtros?: number
  precioPublicacion?: number
  precioVenta?: number
  beneficioNeto?: number
  notasInversor?: string
  fotoInversor?: string
  color?: string
  fechaMatriculacion?: string
  // Campos adicionales de Google Sheets
  año?: number
  segundaLlave?: string
  carpeta?: string
  master?: string
  hojasA?: string
  documentacion?: string
  itv?: string
  seguro?: string
  // Depósito
  enDeposito?: boolean
  depositoId?: number
}

interface VehicleCardProps {
  vehiculo: Vehiculo
  onEdit?: (vehiculo: Vehiculo) => void
  onDelete?: (id: number) => void
  onView?: (id: number) => void
}

const VehicleCard = memo(function VehicleCard({
  vehiculo,
  onEdit,
  onDelete,
  onView,
}: VehicleCardProps) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditingAdditional, setIsEditingAdditional] = useState(false)

  // Helper function para normalizar valores booleanos - memoizada
  const isPositive = useCallback(
    (value: string | boolean | null | undefined): boolean => {
      if (typeof value === 'boolean') return value
      if (!value) return false
      const normalized = value.toString().toLowerCase().trim()
      return (
        normalized === 'si' ||
        normalized === 'sí' ||
        normalized === 'yes' ||
        normalized === 'true' ||
        normalized === '1' ||
        (normalized !== 'no' &&
          normalized !== 'false' &&
          normalized !== '0' &&
          normalized.length > 0)
      )
    },
    []
  )

  // Helper function para normalizar estado vendido - memoizada
  const isVendido = useCallback(
    (estado: string | null | undefined): boolean => {
      if (!estado) return false
      const normalized = estado.toString().toLowerCase().trim()
      return normalized === 'vendido'
    },
    []
  )

  // Helper function para detectar si está reservado - memoizada
  const isReservado = useCallback(
    (estado: string | null | undefined): boolean => {
      if (!estado) return false
      const normalized = estado.toString().toLowerCase().trim()
      return normalized === 'reservado'
    },
    []
  )
  const [editableFields, setEditableFields] = useState({
    segundaLlave: isPositive(vehiculo.segundaLlave),
    carpeta: isPositive(vehiculo.carpeta),
    master: isPositive(vehiculo.master),
    hojasA: isPositive(vehiculo.hojasA),
    documentacion: isPositive(vehiculo.documentacion),
    itv: isPositive(vehiculo.itv),
    seguro: isPositive(vehiculo.seguro),
  })

  // Función helper para detectar tipo de vehículo basado en la referencia
  const detectVehicleType = useCallback((referencia: string) => {
    if (!referencia) return 'Compra'

    const refUpper = referencia.toUpperCase().trim()

    // Detectar tipo R - referencia que empieza con "R-"
    if (refUpper.startsWith('R-')) {
      return 'R'
    }

    // Detectar tipo Depósito - referencia que empieza con "D-"
    if (refUpper.startsWith('D-')) {
      return 'Depósito'
    }

    // Detectar tipo Inversor - referencia que empieza con "I-"
    if (refUpper.startsWith('I-')) {
      return 'Inversor'
    }

    // Por defecto, tipo Compra (referencias que empiezan con "#" o solo números)
    return 'Compra'
  }, [])

  // Constantes para colores de tipo - optimización
  const TIPO_COLORS = {
    Compra: 'bg-green-100 text-green-700 border-green-200',
    R: 'bg-red-100 text-red-700 border-red-200',
    Depósito: 'bg-orange-100 text-orange-700 border-orange-200',
    Inversor: 'bg-purple-100 text-purple-700 border-purple-200',
  } as const

  const TIPO_TEXTS = {
    Compra: 'Compra',
    R: 'COCHE R',
    Depósito: 'Depósito',
    Inversor: 'Inversor',
  } as const

  const getTipoColor = useCallback(
    (referencia: string) => {
      const detectedType = detectVehicleType(referencia)
      console.log(
        `🎨 [VehicleCard] Referencia: "${referencia}" -> Detectado: "${detectedType}"`
      )

      return (
        TIPO_COLORS[detectedType as keyof typeof TIPO_COLORS] ||
        'bg-gray-100 text-gray-700 border-gray-200'
      )
    },
    [detectVehicleType]
  )

  const getTipoText = useCallback(
    (referencia: string) => {
      const detectedType = detectVehicleType(referencia)
      return TIPO_TEXTS[detectedType as keyof typeof TIPO_TEXTS] || detectedType
    },
    [detectVehicleType]
  )

  // Iconos de tipo - memoizados
  const TIPO_ICONS = {
    Compra: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm8 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1V8z"
          clipRule="evenodd"
        />
      </svg>
    ),
    R: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    Depósito: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
          clipRule="evenodd"
        />
      </svg>
    ),
    Inversor: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    ),
  } as const

  const DEFAULT_ICON = (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm8 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1V8z"
        clipRule="evenodd"
      />
    </svg>
  )

  const getTipoIcon = useCallback(
    (referencia: string) => {
      const detectedType = detectVehicleType(referencia)
      return TIPO_ICONS[detectedType as keyof typeof TIPO_ICONS] || DEFAULT_ICON
    },
    [detectVehicleType]
  )

  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }, [])

  const truncateText = useCallback((text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return `${text.substring(0, maxLength)}...`
  }, [])

  const handleFieldChange = useCallback((field: string, value: boolean) => {
    setEditableFields((prev) => ({
      ...prev,
      [field]: value,
    }))
  }, [])

  const handleSaveAdditional = useCallback(async () => {
    try {
      // Convertir los valores booleanos a strings para la API
      const fieldsToUpdate = {
        segundaLlave: editableFields.segundaLlave ? 'Sí' : 'No',
        carpeta: editableFields.carpeta ? 'Sí' : 'No',
        master: editableFields.master ? 'Sí' : 'No',
        hojasA: editableFields.hojasA ? 'Sí' : 'No',
        documentacion: editableFields.documentacion ? 'Sí' : 'No',
        itv:
          editableFields.itv === null ? null : editableFields.itv ? 'Sí' : 'No',
        seguro: editableFields.seguro ? 'Sí' : 'No',
      }

      const response = await fetch(`/api/vehiculos/${vehiculo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fieldsToUpdate),
      })

      if (response.ok) {
        setIsEditingAdditional(false)
        // Actualizar el vehículo local para reflejar los cambios
        Object.assign(vehiculo, fieldsToUpdate)
        console.log('Cambios guardados exitosamente')
      } else {
        console.error('Error al guardar los cambios')
      }
    } catch (error) {
      console.error('Error al guardar los cambios:', error)
    }
  }, [vehiculo.id, editableFields])

  const handleCancelEdit = useCallback(() => {
    // Restaurar valores originales
    setEditableFields({
      segundaLlave: isPositive(vehiculo.segundaLlave),
      carpeta: isPositive(vehiculo.carpeta),
      master: isPositive(vehiculo.master),
      hojasA: isPositive(vehiculo.hojasA),
      documentacion: isPositive(vehiculo.documentacion),
      itv: isPositive(vehiculo.itv),
      seguro: isPositive(vehiculo.seguro),
    })
    setIsEditingAdditional(false)
  }, [vehiculo, isPositive])

  const handleInvestorClick = useCallback(() => {
    if (vehiculo.esCocheInversor && vehiculo.inversorId) {
      router.push(`/inversores/${vehiculo.inversorId}`)
    }
  }, [vehiculo.esCocheInversor, vehiculo.inversorId, router])

  // Variables calculadas - memoizadas
  const vehiculoVendido = useMemo(
    () => isVendido(vehiculo.estado),
    [vehiculo.estado, isVendido]
  )
  const vehiculoReservado = useMemo(
    () => isReservado(vehiculo.estado),
    [vehiculo.estado, isReservado]
  )
  const esDeposito = useMemo(
    () => detectVehicleType(vehiculo.referencia) === 'Depósito',
    [vehiculo.referencia, detectVehicleType]
  )
  const esInversor = useMemo(
    () => detectVehicleType(vehiculo.referencia) === 'Inversor',
    [vehiculo.referencia, detectVehicleType]
  )
  const esTipoR = useMemo(
    () => detectVehicleType(vehiculo.referencia) === 'R',
    [vehiculo.referencia, detectVehicleType]
  )

  return (
    <div
      className={`rounded-xl border shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group bg-white border-gray-200 w-full min-w-[320px] mx-[10px] my-[10px] ${
        vehiculoVendido ? 'opacity-60 grayscale' : ''
      } ${vehiculoReservado ? 'opacity-75' : ''}`}
    >
      {/* Links de inversor/depósito por encima del header */}

      {/* Header con gradiente - CLICKEABLE COMPLETO */}
      <div
        className={`px-4 py-4 min-h-[90px] border-b cursor-pointer hover:opacity-90 transition-opacity ${
          esDeposito
            ? 'bg-gradient-to-r from-orange-200 to-orange-300 border-orange-300'
            : esTipoR
              ? 'bg-gradient-to-r from-red-200 to-red-300 border-red-300'
              : esInversor
                ? 'bg-gradient-to-r from-purple-200 to-purple-300 border-purple-300'
                : 'bg-gradient-to-r from-green-200 to-green-300 border-green-300'
        }`}
        onClick={() => {
          console.log(`🎯 [VEHICLE CARD] Header clicked - ID: ${vehiculo.id}`)
          const slug = generateVehicleSlug(vehiculo)
          console.log(`🔗 [VEHICLE CARD] Navegando a: /vehiculos/${slug}`)
          router.push(`/vehiculos/${slug}`)
        }}
        title="Ver detalles del vehículo"
      >
        <div className="flex items-start justify-between">
          {/* Logo del vehículo */}
          <div className="flex items-start space-x-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0 ${
                esDeposito
                  ? 'bg-gradient-to-br from-orange-500 to-orange-600'
                  : esTipoR
                    ? 'bg-gradient-to-br from-red-500 to-red-600'
                    : esInversor
                      ? 'bg-gradient-to-br from-purple-500 to-purple-600'
                      : 'bg-gradient-to-br from-green-500 to-green-600'
              }`}
            >
              <span className="text-white font-bold text-sm">
                {formatVehicleReference(vehiculo.referencia, vehiculo.tipo)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className={`text-base font-bold truncate ${
                  vehiculoReservado ? 'text-gray-500' : 'text-gray-900'
                }`}
              >
                {vehiculo.marca} {vehiculo.modelo}
              </h3>
              {/* Cartel de RESERVADO */}
              {vehiculoReservado && (
                <div className="mt-1 inline-block">
                  <span className="px-2 py-1 text-xs font-bold text-yellow-800 bg-yellow-300 rounded-md shadow-sm">
                    RESERVADO
                  </span>
                </div>
              )}
              {/* Alerta de ITV vencida */}
              {vehiculo.itv !== null &&
              vehiculo.itv !== undefined &&
              vehiculo.itv !== '' &&
              !isPositive(vehiculo.itv) ? (
                <div className="inline-flex items-center space-x-1 px-2 py-0.5 bg-red-600 rounded-full mt-1">
                  <svg
                    className="w-3 h-3 text-yellow-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-xs text-white font-semibold">
                    ITV VENCIDA
                  </span>
                </div>
              ) : null}
              {/* En depósito debajo del nombre del vehículo */}
              {vehiculo.enDeposito && vehiculo.depositoId && (
                <Link
                  href={`/depositos/${vehiculo.depositoId}`}
                  className="text-xs text-orange-600 font-medium hover:text-orange-800 hover:underline transition-colors cursor-pointer block mt-1"
                  title="Ver depósito"
                >
                  En depósito
                </Link>
              )}
            </div>
          </div>

          {/* Badge de tipo con nombre del inversor */}
          <div className="flex flex-col items-end space-y-1">
            <div
              className={`flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border ${getTipoColor(vehiculo.referencia)}`}
            >
              {getTipoIcon(vehiculo.referencia)}
              <span className="text-xs sm:text-sm font-medium">
                {getTipoText(vehiculo.referencia)}
              </span>
            </div>
            {/* Nombre del inversor debajo del badge - CLICKEABLE CON Z-INDEX ALTO */}
            {vehiculo.esCocheInversor && vehiculo.inversorNombre && (
              <button
                onClick={(e) => {
                  e.stopPropagation() // Evitar que se propague al click del header
                  handleInvestorClick()
                }}
                className="relative z-10 text-xs text-purple-600 font-medium hover:text-purple-800 hover:underline transition-colors cursor-pointer bg-white px-2 py-1 rounded-md hover:bg-purple-50"
                title="Ver perfil del inversor"
              >
                {vehiculo.inversorNombre}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Información principal */}
      <div className="px-4 py-4">
        {/* Información del vehículo en formato limpio */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span
              className={`text-sm ${
                vehiculoReservado ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Matrícula
            </span>
            <span
              className={`text-sm font-semibold font-mono ${
                vehiculoReservado ? 'text-gray-500' : 'text-gray-900'
              }`}
            >
              {vehiculo.matricula}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span
              className={`text-sm ${
                vehiculoReservado ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Bastidor
            </span>
            <span
              className={`text-sm font-semibold font-mono ${
                vehiculoReservado ? 'text-gray-500' : 'text-gray-900'
              }`}
            >
              {vehiculo.bastidor}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span
              className={`text-sm ${
                vehiculoReservado ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Kilómetros
            </span>
            <span
              className={`text-sm font-semibold ${
                vehiculoReservado ? 'text-gray-500' : 'text-gray-900'
              }`}
            >
              {vehiculo.kms.toLocaleString()}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span
              className={`text-sm ${
                vehiculoReservado ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Fecha Matric
            </span>
            <span
              className={`text-sm font-semibold ${
                vehiculoReservado ? 'text-gray-500' : 'text-gray-900'
              }`}
            >
              {vehiculo.fechaMatriculacion
                ? (() => {
                    try {
                      const fecha = new Date(vehiculo.fechaMatriculacion)
                      if (isNaN(fecha.getTime())) {
                        // Si es una fecha inválida, intentar parsear como string
                        const partes = vehiculo.fechaMatriculacion.split('/')
                        if (partes.length === 3) {
                          // Formato dd/mm/yyyy
                          const fechaValida = new Date(
                            partes[2],
                            partes[1] - 1,
                            partes[0]
                          )
                          return fechaValida.toLocaleDateString('es-ES')
                        }
                        return vehiculo.fechaMatriculacion // Mostrar el valor original si no se puede parsear
                      }
                      return fecha.toLocaleDateString('es-ES')
                    } catch (error) {
                      return vehiculo.fechaMatriculacion // Mostrar el valor original si hay error
                    }
                  })()
                : 'N/A'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span
              className={`text-sm ${
                vehiculoReservado ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Color
            </span>
            <span
              className={`text-sm font-semibold ${
                vehiculoReservado ? 'text-gray-500' : 'text-gray-900'
              }`}
            >
              {vehiculo.color || 'N/A'}
            </span>
          </div>
        </div>

        {/* Información adicional colapsable */}
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center space-x-2 text-left text-sm font-semibold text-blue-700 hover:text-blue-800 hover:bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50/50 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <span>Información adicional</span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {isExpanded && (
              <button
                onClick={() => setIsEditingAdditional(!isEditingAdditional)}
                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all duration-200"
                title={
                  isEditingAdditional
                    ? 'Cancelar edición'
                    : 'Editar información adicional'
                }
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
            )}
          </div>

          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
          >
            <div className="mt-6">
              {/* Información adicional de Google Sheets */}
              {true && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200 shadow-sm">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center space-x-2 p-2 rounded bg-blue-100/50">
                      <span className="text-blue-800 font-semibold">
                        2ª Llave:
                      </span>
                      {isEditingAdditional ? (
                        <select
                          value={editableFields.segundaLlave ? 'si' : 'no'}
                          onChange={(e) =>
                            handleFieldChange(
                              'segundaLlave',
                              e.target.value === 'si'
                            )
                          }
                          className="text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-xs font-medium"
                        >
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span className="text-blue-900 font-medium">
                          {editableFields.segundaLlave ? 'Sí' : 'No'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 p-2 rounded bg-blue-200/30">
                      <span className="text-blue-800 font-semibold">
                        Carpeta:
                      </span>
                      {isEditingAdditional ? (
                        <select
                          value={editableFields.carpeta ? 'si' : 'no'}
                          onChange={(e) =>
                            handleFieldChange(
                              'carpeta',
                              e.target.value === 'si'
                            )
                          }
                          className="text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-xs font-medium"
                        >
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span className="text-blue-900 font-medium">
                          {editableFields.carpeta ? 'Sí' : 'No'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 p-2 rounded bg-blue-100/50">
                      <span className="text-blue-800 font-semibold">
                        Master:
                      </span>
                      {isEditingAdditional ? (
                        <select
                          value={editableFields.master ? 'si' : 'no'}
                          onChange={(e) =>
                            handleFieldChange('master', e.target.value === 'si')
                          }
                          className="text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-xs font-medium"
                        >
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span className="text-blue-900 font-medium">
                          {editableFields.master ? 'Sí' : 'No'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 p-2 rounded bg-blue-200/30">
                      <span className="text-blue-800 font-semibold">
                        Hojas A:
                      </span>
                      {isEditingAdditional ? (
                        <select
                          value={editableFields.hojasA ? 'si' : 'no'}
                          onChange={(e) =>
                            handleFieldChange('hojasA', e.target.value === 'si')
                          }
                          className="text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-xs font-medium"
                        >
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span className="text-blue-900 font-medium">
                          {editableFields.hojasA ? 'Sí' : 'No'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 p-2 rounded bg-blue-100/50">
                      <span className="text-blue-800 font-semibold">Docu:</span>
                      {isEditingAdditional ? (
                        <select
                          value={editableFields.documentacion ? 'si' : 'no'}
                          onChange={(e) =>
                            handleFieldChange(
                              'documentacion',
                              e.target.value === 'si'
                            )
                          }
                          className="text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-xs font-medium"
                        >
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span className="text-blue-900 font-medium">
                          {editableFields.documentacion ? 'Sí' : 'No'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 p-2 rounded bg-blue-200/30">
                      <span className="text-blue-800 font-semibold">ITV:</span>
                      {isEditingAdditional ? (
                        <select
                          value={
                            vehiculo.itv === null ||
                            vehiculo.itv === undefined ||
                            vehiculo.itv === ''
                              ? 'chequear'
                              : isPositive(vehiculo.itv)
                                ? 'si'
                                : 'no'
                          }
                          onChange={(e) => {
                            if (e.target.value === 'chequear') {
                              handleFieldChange('itv', false)
                            } else {
                              handleFieldChange('itv', e.target.value === 'si')
                            }
                          }}
                          className="text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-xs font-medium"
                        >
                          <option value="chequear">Chequear</option>
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span className="text-blue-900 font-medium">
                          {vehiculo.itv === null ||
                          vehiculo.itv === undefined ||
                          vehiculo.itv === ''
                            ? 'Chequear'
                            : isPositive(vehiculo.itv)
                              ? 'Sí'
                              : 'No'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 p-2 rounded bg-blue-100/50">
                      <span className="text-blue-800 font-semibold">
                        Seguro:
                      </span>
                      {isEditingAdditional ? (
                        <select
                          value={editableFields.seguro ? 'si' : 'no'}
                          onChange={(e) =>
                            handleFieldChange('seguro', e.target.value === 'si')
                          }
                          className="text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 text-xs font-medium"
                        >
                          <option value="no">No</option>
                          <option value="si">Sí</option>
                        </select>
                      ) : (
                        <span className="text-blue-900 font-medium">
                          {editableFields.seguro ? 'Sí' : 'No'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Botones de guardar/cancelar cuando está editando */}
                  {isEditingAdditional && (
                    <div className="flex space-x-2 pt-3 border-t border-blue-200">
                      <button
                        onClick={handleSaveAdditional}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span>Guardar</span>
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        <span>Cancelar</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Estado del vehículo y botones de acción */}
      <div
        className={`px-4 sm:px-6 py-4 border-t border-gray-100 ${vehiculoVendido ? 'bg-red-600' : ''}`}
      >
        <div className="flex justify-between items-center">
          {/* Estado del vehículo */}
          <div className="flex items-center space-x-2">
            {vehiculoVendido ? (
              <span className="font-bold text-white text-sm flex items-center space-x-1">
                <span>🚗</span>
                <span>VENDIDO</span>
              </span>
            ) : vehiculoReservado ? (
              <span className="font-bold text-yellow-700 text-sm flex items-center space-x-1">
                <span>🔒</span>
                <span>RESERVADO</span>
              </span>
            ) : (
              <>
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">
                  Estado:
                </span>
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                  {vehiculo.estado || 'Inicial'}
                </span>
              </>
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex space-x-2">
            {onEdit && (
              <button
                onClick={() =>
                  !vehiculoVendido && !vehiculoReservado && onEdit(vehiculo)
                }
                disabled={vehiculoVendido || vehiculoReservado}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  vehiculoVendido || vehiculoReservado
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                }`}
                title={
                  vehiculoVendido
                    ? 'Vehículo vendido - No editable'
                    : vehiculoReservado
                      ? 'Vehículo reservado - No editable'
                      : 'Editar vehículo'
                }
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
            )}
            {onDelete && (
              <button
                onClick={() =>
                  !vehiculoVendido &&
                  !vehiculoReservado &&
                  onDelete(vehiculo.id)
                }
                disabled={vehiculoVendido || vehiculoReservado}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  vehiculoVendido || vehiculoReservado
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                }`}
                title={
                  vehiculoVendido
                    ? 'Vehículo vendido - No eliminable'
                    : vehiculoReservado
                      ? 'Vehículo reservado - No eliminable'
                      : 'Eliminar vehículo'
                }
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

export default VehicleCard
