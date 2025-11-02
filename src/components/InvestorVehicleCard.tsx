'use client'

import { useState, useRef } from 'react'
import { Vehiculo } from '@/lib/database'
import {
  formatDate,
  formatVehicleReference,
  formatVehicleReferenceShort,
  capitalizeText,
  formatCurrency,
} from '@/lib/utils'

interface InvestorVehicleCardProps {
  vehiculo: Vehiculo
  inversor?: {
    id: number
    nombre: string
    email?: string
  } | null
  onView: (id: number) => void
  onEdit?: (vehiculo: Vehiculo) => void
  onEditVehiculo?: (vehiculo: Vehiculo) => void
  onPhotoUpload?: (vehiculoId: number, photoUrl: string) => void
  isReadOnly?: boolean
}

export function InvestorVehicleCard({
  vehiculo,
  inversor,
  onView,
  onEdit,
  onEditVehiculo,
  onPhotoUpload,
  isReadOnly = false,
}: InvestorVehicleCardProps) {
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estados para archivos
  const [archivos, setArchivos] = useState<
    Array<{
      id: string
      name: string
      fileName: string
      size: number
      type: string
      uploadDate: string
      path: string
    }>
  >([])
  const [isArchivosExpanded, setIsArchivosExpanded] = useState(false)
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  const archivosFileInputRef = useRef<HTMLInputElement>(null)

  // Función helper para detectar tipo de vehículo basado en la referencia y el tipo de BD
  const detectVehicleType = (referencia: string, tipoBD?: string) => {
    // Si tenemos el tipo de la base de datos, usarlo como prioridad
    if (tipoBD) {
      const tipoMapping: { [key: string]: string } = {
        C: 'Compra',
        R: 'R',
        D: 'Depósito',
        I: 'Inversor',
        Compra: 'Compra',
        'Coche R': 'R',
        'Deposito Venta': 'Depósito',
        Depósito: 'Depósito', // Agregado para reconocer "Depósito"
        Inversor: 'Inversor',
      }
      return tipoMapping[tipoBD] || 'Compra'
    }

    // Fallback: detectar por referencia
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
  }

  // Determinar si es un vehículo de depósito o inversor
  const esDeposito =
    detectVehicleType(vehiculo.referencia, vehiculo.tipo) === 'Depósito'
  const esInversor =
    detectVehicleType(vehiculo.referencia, vehiculo.tipo) === 'Inversor'
  const esTipoR = detectVehicleType(vehiculo.referencia, vehiculo.tipo) === 'R'

  // Helper function para normalizar valores booleanos
  const isPositive = (value: string | boolean | null | undefined): boolean => {
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
  }

  // Helper function para normalizar estado vendido
  const isVendido = (estado: string | null | undefined): boolean => {
    if (!estado) return false
    const normalized = estado.toString().toLowerCase().trim()
    return normalized === 'vendido'
  }

  // Debug: mostrar información de la foto
  console.log('Vehiculo fotoInversor:', vehiculo.fotoInversor)
  console.log('Local photo URL:', localPhotoUrl)
  console.log('Image error:', imageError)

  const handlePhotoClick = () => {
    if (vehiculo.fotoInversor || localPhotoUrl) {
      setShowPhotoModal(true)
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file || !onPhotoUpload) return

    setIsUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = (e) => {
        const photoUrl = e.target?.result as string
        setLocalPhotoUrl(photoUrl)
        onPhotoUpload(vehiculo.id, photoUrl)
        setIsUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error al cargar foto:', error)
      setIsUploading(false)
    }
  }

  const handleImageError = () => {
    setImageError(true)
  }

  const getEstadoColor = (estado: string) => {
    const estados = {
      REVI_INIC: 'bg-yellow-100 text-yellow-800',
      MECAUTO: 'bg-blue-100 text-blue-800',
      REVI_PINTURA: 'bg-orange-100 text-orange-800',
      PINTURA: 'bg-purple-100 text-purple-800',
      LIMPIEZA: 'bg-cyan-100 text-cyan-800',
      FOTOS: 'bg-indigo-100 text-indigo-800',
      PUBLICADO: 'bg-green-100 text-green-800',
      vendido: 'bg-emerald-100 text-emerald-800',
      '': 'bg-gray-100 text-gray-800',
    }
    return (
      estados[estado as keyof typeof estados] || 'bg-gray-100 text-gray-800'
    )
  }

  const calcularDiasEnStock = () => {
    const fechaCompra = vehiculo.fechaCompra
      ? new Date(vehiculo.fechaCompra)
      : new Date(vehiculo.createdAt)
    const ahora = new Date()
    const dias = Math.floor(
      (ahora.getTime() - fechaCompra.getTime()) / (1000 * 60 * 60 * 24)
    )
    return dias
  }

  const diasEnStock = calcularDiasEnStock()
  const esVendido = isVendido(vehiculo.estado)
  // Mostrar información básica si el vehículo tiene al menos precio de compra o está vendido
  const tieneDatosFinancieros =
    vehiculo.precioCompra ||
    (esVendido && (vehiculo.precioVenta || vehiculo.beneficioNeto))

  // Calcular valores fiscales para vehículos vendidos
  const calcularValoresFiscales = () => {
    const gastosTransporte = vehiculo.gastosTransporte || 0
    const gastosTasas = vehiculo.gastosTasas || 0
    const gastosMecanica = vehiculo.gastosMecanica || 0
    const gastosPintura = vehiculo.gastosPintura || 0
    const gastosLimpieza = vehiculo.gastosLimpieza || 0
    const gastosOtros = vehiculo.gastosOtros || 0

    // Sumar todos los gastos del vehículo (sin IVA ni Impuesto Sociedades)
    const totalGastos =
      gastosTransporte +
      gastosTasas +
      gastosMecanica +
      gastosPintura +
      gastosLimpieza +
      gastosOtros

    const precioCompra = vehiculo.precioCompra || 0

    // CN y Garantía se suma a los costos del vehículo (es un costo que se paga antes de la venta)
    const gastosCNGarantia = vehiculo.gastosCNGarantia || 0

    // Costo total = precio compra + todos los gastos + CN y Garantía
    // CN y Garantía se incluye en el costo total porque es un costo que se paga antes de calcular impuestos
    const costoTotal = precioCompra + totalGastos + gastosCNGarantia
    const precioVenta = vehiculo.precioVenta || 0

    // Calcular IVA: 21% de (precio venta - costo total)
    // Costo total ahora incluye CN y Garantía
    const diferencia = precioVenta - costoTotal
    const iva = Math.round(diferencia * 0.21 * 100) / 100

    // Calcular Impuesto Sociedades: 20% de (precio venta - costo total - IVA)
    // Costo total ahora incluye CN y Garantía
    const baseImpuestoSociedades = diferencia - iva
    const impuestoSociedades =
      Math.round(baseImpuestoSociedades * 0.2 * 100) / 100

    // Beneficio neto = precio venta - costo total - IVA - Impuesto Sociedades
    // Costo total incluye CN y Garantía, así que no se resta por separado
    const beneficioNetoTotal =
      precioVenta - costoTotal - iva - impuestoSociedades
    // Redondear beneficio neto total a 2 decimales
    const beneficioNetoTotalRedondeado =
      Math.round(beneficioNetoTotal * 100) / 100

    // Inversor se lleva el 50% del beneficio neto
    const beneficioNeto =
      Math.round(beneficioNetoTotalRedondeado * 0.5 * 100) / 100

    // Calcular porcentaje de beneficio sobre costo total
    const porcentajeBeneficio =
      costoTotal > 0 ? (beneficioNeto / costoTotal) * 100 : 0

    return {
      costoTotal,
      precioVenta,
      iva,
      impuestoSociedades,
      gastosCNGarantia,
      beneficioNeto,
      porcentajeBeneficio,
      esBeneficio: beneficioNeto >= 0,
    }
  }

  const valoresFiscales = calcularValoresFiscales()

  // Funciones para gestionar archivos
  const fetchArchivos = async () => {
    try {
      const response = await fetch(`/api/vehiculos/${vehiculo.id}/archivos`)
      if (response.ok) {
        const data = await response.json()
        setArchivos(data)
      }
    } catch (error) {
      console.error('Error al cargar archivos:', error)
    }
  }

  const handleArchivoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setIsUploadingFile(true)
    try {
      // Subir archivos uno por uno
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch(`/api/vehiculos/${vehiculo.id}/archivos`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          console.error('Error al subir archivo:', file.name)
        }
      }

      // Recargar lista de archivos después de subir todos
      await fetchArchivos()
    } catch (error) {
      console.error('Error al subir archivos:', error)
    } finally {
      setIsUploadingFile(false)
      // Limpiar el input para permitir subir los mismos archivos de nuevo
      if (archivosFileInputRef.current) {
        archivosFileInputRef.current.value = ''
      }
    }
  }

  const handleDeleteArchivo = async (fileId: string) => {
    try {
      const response = await fetch(
        `/api/vehiculos/${vehiculo.id}/archivos/${fileId}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        await fetchArchivos()
      } else {
        console.error('Error al eliminar archivo')
      }
    } catch (error) {
      console.error('Error al eliminar archivo:', error)
    }
  }

  const handleDownloadArchivo = (archivo: {
    id: string
    name: string
    path: string
  }) => {
    const link = document.createElement('a')
    link.href = archivo.path
    link.download = archivo.name
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  // Cargar archivos cuando se expande la sección
  const toggleArchivosSection = () => {
    setIsArchivosExpanded(!isArchivosExpanded)
    if (!isArchivosExpanded && archivos.length === 0) {
      fetchArchivos()
    }
  }

  return (
    <div className="rounded-xl border shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden bg-white border-gray-200">
      {/* Header con estado destacado */}
      <div
        className={`px-5 py-4 border-b ${
          esVendido
            ? 'bg-gradient-to-r from-gray-300 to-gray-400 border-gray-400 opacity-60 grayscale'
            : esDeposito
              ? 'bg-gradient-to-r from-orange-200 to-orange-300 border-orange-300'
              : esTipoR
                ? 'bg-gradient-to-r from-red-200 to-red-300 border-red-300'
                : esInversor
                  ? 'bg-gradient-to-r from-purple-200 to-purple-300 border-purple-300'
                  : 'bg-gradient-to-r from-green-200 to-green-300 border-green-300'
        }`}
      >
        <div className="flex justify-between items-start">
          <div className="flex items-start space-x-4">
            <div
              className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-sm ${
                esDeposito
                  ? 'bg-gradient-to-br from-orange-500 to-orange-600'
                  : esTipoR
                    ? 'bg-gradient-to-br from-red-500 to-red-600'
                    : esInversor
                      ? 'bg-gradient-to-br from-purple-500 to-purple-600'
                      : 'bg-gradient-to-br from-green-500 to-green-600'
              }`}
            >
              <span className="text-white font-bold text-xs px-1 text-center leading-tight">
                {formatVehicleReferenceShort(
                  vehiculo.referencia,
                  vehiculo.tipo
                )}
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900">
                {capitalizeText(vehiculo.marca)}{' '}
                {capitalizeText(vehiculo.modelo)}
              </h3>
              {/* Alerta de ITV vencida o info básica */}
              {vehiculo.itv !== null &&
              vehiculo.itv !== undefined &&
              vehiculo.itv !== '' &&
              !isPositive(vehiculo.itv) ? (
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-red-600 rounded-full">
                  <svg
                    className="w-3.5 h-3.5 text-yellow-400"
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
              ) : (
                <p className="text-sm text-gray-600">Vehículo</p>
              )}
              {/* Información del inversor en el header */}
              {inversor && (
                <p className="text-xs text-purple-600 font-medium mt-1">
                  Inversor: {inversor.nombre}
                </p>
              )}
            </div>
          </div>

          <div className="flex space-x-1">
            {onEdit && !isReadOnly && (
              <button
                onClick={() => onEdit(vehiculo)}
                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                title="Editar vehículo"
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
            <button
              onClick={() => onView(vehiculo.id)}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
              title="Ver detalles"
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
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Estado destacado */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="text-sm font-medium text-gray-700">
              Estado Actual:
            </span>
            <span
              className={`px-2 py-1 text-xs font-semibold rounded-full ${
                esVendido
                  ? 'bg-red-600 text-white'
                  : getEstadoColor(vehiculo.estado)
              }`}
            >
              {esVendido ? 'VENDIDO' : vehiculo.estado || 'Inicial'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <svg
              className="w-4 h-4 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm text-gray-600">Días en stock:</span>
            <span className="text-sm font-medium text-blue-600">
              {diasEnStock}
            </span>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="p-5">
        {/* Información básica del vehículo */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 mb-4 border border-blue-200">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {/* Columna izquierda */}
            <div className="space-y-3">
              <div className="flex items-center">
                <span className="text-gray-600 font-medium mr-2">
                  Matrícula:
                </span>
                <span className="font-semibold text-gray-900">
                  {vehiculo.matricula || 'No especificada'}
                </span>
              </div>
              <div className="flex items-center">
                <span className="text-gray-600 font-medium mr-2">Color:</span>
                <span className="font-semibold text-gray-900">
                  {(vehiculo as any).color || 'No especificado'}
                </span>
              </div>
              <div className="flex items-center">
                <span className="text-gray-600 font-medium mr-2">KMs:</span>
                <span className="font-semibold text-gray-900">
                  {vehiculo.kms?.toLocaleString() || 'No especificados'}
                </span>
              </div>
            </div>

            {/* Columna derecha */}
            <div className="space-y-3">
              <div className="flex items-center">
                <span className="text-gray-600 font-medium mr-2">
                  Fecha Matriculación:
                </span>
                <span className="font-semibold text-gray-900">
                  {vehiculo.fechaMatriculacion
                    ? new Date(vehiculo.fechaMatriculacion).toLocaleDateString(
                        'es-ES'
                      )
                    : 'No especificada'}
                </span>
              </div>
              <div className="flex items-center">
                <span className="text-gray-600 font-medium mr-2">
                  Bastidor:
                </span>
                <span className="font-semibold text-gray-900 text-xs break-all">
                  {vehiculo.bastidor || 'No especificado'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bloque de Beneficio Prominente (solo si está vendido) - Visible antes del acordeón */}
        {esVendido && vehiculo.precioVenta && (
          <div
            className={`rounded-lg p-4 border-2 mb-6 ${
              valoresFiscales.esBeneficio
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
                : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300'
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span
                  className={`text-base font-bold ${
                    valoresFiscales.esBeneficio
                      ? 'text-green-800'
                      : 'text-red-800'
                  }`}
                >
                  BENEFICIO:
                </span>
                {valoresFiscales.porcentajeBeneficio > 0 && (
                  <span
                    className={`text-xs mt-1 ${
                      valoresFiscales.esBeneficio
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    ({valoresFiscales.porcentajeBeneficio.toFixed(1)}% sobre
                    costo total)
                  </span>
                )}
              </div>
              <span
                className={`font-bold text-2xl ${
                  valoresFiscales.esBeneficio
                    ? 'text-green-700'
                    : 'text-red-700'
                }`}
              >
                {formatCurrency(valoresFiscales.beneficioNeto)}
              </span>
            </div>
          </div>
        )}

        {/* Acordeón de Desglose de Gastos */}
        <div className="space-y-4">
          {/* Mensaje informativo si faltan datos financieros */}
          {!tieneDatosFinancieros && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <svg
                  className="w-5 h-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">
                    Información financiera pendiente.
                  </span>{' '}
                  Completa los datos de precio de compra para ver el análisis
                  completo.
                </p>
              </div>
            </div>
          )}

          {/* Botón del acordeón */}
          <div className="bg-blue-50 rounded-lg border border-blue-200">
            <button
              onClick={() => {
                console.log(
                  `Toggling acordeón for vehicle ${vehiculo.id}, current state: ${isExpanded}`
                )
                setIsExpanded(!isExpanded)
              }}
              className="w-full p-4 text-left flex items-center justify-between hover:bg-blue-100 transition-colors rounded-lg"
            >
              <div className="flex items-center">
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-sm font-semibold text-blue-800">
                  Desglose de Gastos
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {onEditVehiculo && !isReadOnly && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditVehiculo(vehiculo)
                    }}
                    className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-200 rounded-full transition-colors cursor-pointer"
                    title="Editar gastos"
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
                  </div>
                )}
                <svg
                  className={`w-5 h-5 text-blue-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
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
              </div>
            </button>

            {/* Contenido expandible del acordeón */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-4">
                {/* Información de venta si está vendido */}
                {esVendido && vehiculo.precioVenta && (
                  <>
                    {/* Bloque Gastos de Compra (azul) */}
                    <div className="space-y-2 bg-blue-50 rounded-lg p-3 border-2 border-blue-300">
                      <h4 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
                        <span className="text-base">💰</span>
                        Gastos de Compra
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between bg-blue-100 rounded px-2 py-1.5 border border-blue-200">
                          <span className="text-blue-700 font-medium">
                            Precio compra:
                          </span>
                          <span className="font-bold text-blue-900">
                            {formatCurrency(vehiculo.precioCompra || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between bg-blue-100 rounded px-2 py-1.5 border border-blue-200">
                          <span className="text-blue-700 font-medium">
                            Transporte:
                          </span>
                          <span className="font-bold text-blue-900">
                            {formatCurrency(vehiculo.gastosTransporte || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between bg-blue-100 rounded px-2 py-1.5 border border-blue-200">
                          <span className="text-blue-700 font-medium">
                            Tasas/Gestoría:
                          </span>
                          <span className="font-bold text-blue-900">
                            {formatCurrency(vehiculo.gastosTasas || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between bg-blue-100 rounded px-2 py-1.5 border border-blue-200">
                          <span className="text-blue-700 font-medium">
                            Mecánica:
                          </span>
                          <span className="font-bold text-blue-900">
                            {formatCurrency(vehiculo.gastosMecanica || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between bg-blue-100 rounded px-2 py-1.5 border border-blue-200">
                          <span className="text-blue-700 font-medium">
                            Pintura:
                          </span>
                          <span className="font-bold text-blue-900">
                            {formatCurrency(vehiculo.gastosPintura || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between bg-blue-100 rounded px-2 py-1.5 border border-blue-200">
                          <span className="text-blue-700 font-medium">
                            Limpieza:
                          </span>
                          <span className="font-bold text-blue-900">
                            {formatCurrency(vehiculo.gastosLimpieza || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between bg-blue-100 rounded px-2 py-1.5 border border-blue-200">
                          <span className="text-blue-700 font-medium">
                            Otros:
                          </span>
                          <span className="font-bold text-blue-900">
                            {formatCurrency(vehiculo.gastosOtros || 0)}
                          </span>
                        </div>
                        {/* CN y Garantía - incluido en costos de compra */}
                        <div className="flex justify-between bg-blue-100 rounded px-2 py-1.5 border border-blue-200">
                          <span className="text-blue-700 font-medium">
                            CN y Garantía:
                          </span>
                          <span className="font-bold text-blue-900">
                            {formatCurrency(vehiculo.gastosCNGarantia || 0)}
                          </span>
                        </div>
                      </div>
                      {/* Total costos compra */}
                      <div className="flex justify-between bg-blue-200 rounded-md px-3 py-2.5 border-2 border-blue-400 mt-3 shadow-sm">
                        <span className="text-sm font-bold text-blue-900">
                          Total costos compra:
                        </span>
                        <span className="text-sm font-bold text-blue-900">
                          {formatCurrency(valoresFiscales.costoTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Bloque Gastos de Venta (naranja) */}
                    <div className="space-y-2 bg-orange-50 rounded-lg p-3 border-2 border-orange-300">
                      {/* Precio de venta */}
                      <div className="flex justify-between bg-orange-100 rounded-md px-3 py-2 border-2 border-orange-200 mb-2">
                        <span className="text-sm font-bold text-orange-800">
                          Precio venta:
                        </span>
                        <span className="text-sm font-bold text-orange-900">
                          {formatCurrency(valoresFiscales.precioVenta)}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-orange-800 mb-2 flex items-center gap-2">
                        <span className="text-base">💸</span>
                        Gastos de Venta
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {/* IVA */}
                        <div className="flex justify-between bg-orange-100 rounded px-2 py-1.5 border border-orange-200">
                          <span className="text-orange-700 font-medium">
                            IVA:
                          </span>
                          <span className="font-bold text-orange-900">
                            {formatCurrency(valoresFiscales.iva)}
                          </span>
                        </div>
                        {/* Impuesto Sociedades */}
                        <div className="flex justify-between bg-orange-100 rounded px-2 py-1.5 border border-orange-200">
                          <span className="text-orange-700 font-medium">
                            Impuesto Sociedades:
                          </span>
                          <span className="font-bold text-orange-900">
                            {formatCurrency(valoresFiscales.impuestoSociedades)}
                          </span>
                        </div>
                      </div>
                      {/* Total gastos venta (solo IVA + Impuesto Sociedades, CN y Garantía está en costo total) */}
                      <div className="flex justify-between bg-orange-200 rounded-md px-3 py-2.5 border-2 border-orange-400 mt-3 shadow-sm">
                        <span className="text-sm font-bold text-orange-900">
                          Total gastos venta (IVA + Imp. Soc.):
                        </span>
                        <span className="text-sm font-bold text-orange-900">
                          {formatCurrency(
                            (valoresFiscales.iva || 0) +
                              (valoresFiscales.impuestoSociedades || 0)
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Beneficio destacado */}
                    <div
                      className={`rounded-lg p-3 border-2 ${
                        valoresFiscales.esBeneficio
                          ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
                          : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span
                          className={`text-base font-bold ${
                            valoresFiscales.esBeneficio
                              ? 'text-green-800'
                              : 'text-red-800'
                          }`}
                        >
                          BENEFICIO:
                        </span>
                        <span
                          className={`font-bold text-xl ${
                            valoresFiscales.esBeneficio
                              ? 'text-green-700'
                              : 'text-red-700'
                          }`}
                        >
                          {formatCurrency(valoresFiscales.beneficioNeto)}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {/* Costo total si NO está vendido */}
                {!esVendido && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-2 border border-green-200">
                    <div className="flex justify-between items-center bg-green-100 rounded-lg px-3 py-1.5 border border-green-300">
                      <span className="text-xs font-bold text-green-800">
                        COSTO TOTAL:
                      </span>
                      <span className="font-bold text-green-900 text-sm">
                        {(() => {
                          const totalGastos =
                            (vehiculo.gastosTransporte || 0) +
                            (vehiculo.gastosTasas || 0) +
                            (vehiculo.gastosMecanica || 0) +
                            (vehiculo.gastosPintura || 0) +
                            (vehiculo.gastosLimpieza || 0) +
                            (vehiculo.gastosOtros || 0)
                          const precioCompra = vehiculo.precioCompra || 0
                          const costoTotal = precioCompra + totalGastos
                          return formatCurrency(costoTotal)
                        })()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sección de Archivos */}
        <div className="mt-4 space-y-4">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
            <button
              onClick={toggleArchivosSection}
              className="w-full p-4 text-left flex items-center justify-between hover:bg-indigo-100 transition-colors rounded-lg"
            >
              <div className="flex items-center">
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-sm font-semibold text-indigo-800">
                  Archivos
                </span>
              </div>
              <svg
                className={`w-5 h-5 text-indigo-600 transition-transform duration-200 ${
                  isArchivosExpanded ? 'rotate-180' : ''
                }`}
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

            {/* Contenido expandible de archivos */}
            {isArchivosExpanded && (
              <div className="px-4 pb-4 space-y-4">
                {/* Botón para subir archivo */}
                {!isReadOnly && (
                  <label className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors cursor-pointer">
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                    {isUploadingFile ? 'Subiendo...' : 'Subir Archivos'}
                    <input
                      ref={archivosFileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleArchivoUpload}
                    />
                  </label>
                )}

                {/* Lista de archivos */}
                <div className="space-y-2">
                  {archivos.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <svg
                        className="w-12 h-12 mx-auto mb-2 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <p className="text-sm">No hay archivos subidos</p>
                    </div>
                  ) : (
                    archivos.map((archivo) => (
                      <div
                        key={archivo.id}
                        className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors bg-white border border-gray-200"
                      >
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-4 h-4 text-indigo-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-medium text-gray-900 truncate"
                              title={archivo.name}
                            >
                              {archivo.name.length > 30
                                ? `${archivo.name.substring(0, 30)}...`
                                : archivo.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatFileSize(archivo.size)} •{' '}
                              {new Date(archivo.uploadDate).toLocaleDateString(
                                'es-ES'
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <button
                            onClick={() => handleDownloadArchivo(archivo)}
                            className="px-3 py-1 bg-green-100 text-green-700 rounded-md text-sm font-medium hover:bg-green-200 transition-colors"
                            title="Descargar"
                          >
                            Descargar
                          </button>
                          {!isReadOnly && (
                            <button
                              onClick={() => handleDeleteArchivo(archivo.id)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              title="Eliminar"
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
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Foto siempre visible (debajo de archivos) */}
        <div className="mt-4">
          {vehiculo.fotoInversor || localPhotoUrl ? (
            <div
              className="cursor-pointer group relative"
              onClick={handlePhotoClick}
            >
              <img
                src={localPhotoUrl || vehiculo.fotoInversor}
                alt={`${capitalizeText(vehiculo.marca)} ${capitalizeText(vehiculo.modelo)}`}
                className="w-full h-32 object-cover rounded-lg shadow-sm group-hover:shadow-md transition-shadow border border-gray-200"
                onError={(e) => {
                  console.error('Error al cargar imagen:', e)
                  setImageError(true)
                }}
                onLoad={() => {
                  console.log('Imagen cargada correctamente')
                  setImageError(false)
                }}
              />
              <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                Ver grande
              </div>
            </div>
          ) : (
            <div
              className="bg-gray-100 rounded-lg h-32 flex items-center justify-center border-2 border-dashed border-gray-300 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
              onClick={handlePhotoClick}
            >
              <div className="text-center text-gray-500">
                {isUploading ? (
                  <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500 mb-2"></div>
                    <p className="text-sm font-medium">Cargando...</p>
                  </div>
                ) : (
                  <>
                    <svg
                      className="w-8 h-8 mx-auto mb-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-sm font-medium">
                      Haz clic para cargar foto
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Input oculto para carga de archivos */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Modal para ver foto en grande */}
      {showPhotoModal && vehiculo.fotoInversor && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={() => setShowPhotoModal(false)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            >
              <svg
                className="w-8 h-8"
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
            </button>
            <img
              src={vehiculo.fotoInversor}
              alt={`${vehiculo.marca} ${vehiculo.modelo}`}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
            <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-50 text-white p-3 rounded-lg">
              <p className="text-sm font-medium">
                {capitalizeText(vehiculo.marca)}{' '}
                {capitalizeText(vehiculo.modelo)}
              </p>
              <p className="text-xs text-gray-300">
                Haz clic fuera para cerrar
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
