'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  formatVehicleReference,
  formatVehicleReferenceShort,
} from '@/lib/utils'

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
  segundaLlave?: string
  documentacion?: string
  carpeta?: string
  master?: string
  hojasA?: string
}

interface DraggableVehicleCardProps {
  vehiculo: Vehiculo
}

export default function DraggableVehicleCard({
  vehiculo,
}: DraggableVehicleCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Determinar si es un vehículo de depósito o inversor
  const esDeposito =
    vehiculo.tipo === 'Depósito' ||
    vehiculo.tipo === 'D' ||
    vehiculo.tipo === 'Deposito Venta'
  const esInversor = vehiculo.tipo === 'I' || vehiculo.tipo === 'Inversor'

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

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: vehiculo.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Función helper para detectar tipo de vehículo basado en la referencia
  const detectVehicleType = (referencia: string) => {
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

  const getTipoColor = (referencia: string) => {
    const detectedType = detectVehicleType(referencia)
    console.log(
      `🎨 [DraggableVehicleCard] Referencia: "${referencia}" -> Detectado: "${detectedType}"`
    )

    switch (detectedType) {
      case 'Compra':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'R':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'Depósito':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'Inversor':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getTipoLetra = (referencia: string) => {
    const detectedType = detectVehicleType(referencia)

    switch (detectedType) {
      case 'Compra':
        return 'C'
      case 'R':
        return 'COCHE R'
      case 'Depósito':
        return 'D'
      case 'Inversor':
        return 'I'
      default:
        return 'C'
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getStatusIcon = (field: string | boolean | undefined) => {
    if (field === undefined || field === null || field === '') return '❌'
    if (typeof field === 'boolean') return field ? '✅' : '❌'
    return '✅'
  }

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-xl border shadow-sm hover:shadow-md transition-all bg-white border-gray-200 ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      }`}
    >
      {/* Header del acordeón - Siempre visible */}
      <div
        className={`p-3 cursor-pointer transition-colors ${
          detectVehicleType(vehiculo.referencia) === 'Depósito'
            ? 'hover:bg-orange-100'
            : detectVehicleType(vehiculo.referencia) === 'R'
              ? 'hover:bg-red-100'
              : detectVehicleType(vehiculo.referencia) === 'Inversor'
                ? 'hover:bg-purple-100'
                : 'hover:bg-gray-50'
        }`}
        onClick={handleCardClick}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            {/* Logo del vehículo - últimos 2 números */}
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                detectVehicleType(vehiculo.referencia) === 'Depósito'
                  ? 'bg-gradient-to-br from-orange-500 to-orange-600'
                  : detectVehicleType(vehiculo.referencia) === 'R'
                    ? 'bg-gradient-to-br from-red-500 to-red-600'
                    : detectVehicleType(vehiculo.referencia) === 'Inversor'
                      ? 'bg-gradient-to-br from-purple-500 to-purple-600'
                      : 'bg-gradient-to-br from-green-500 to-green-600'
              }`}
            >
              <span className="text-white font-bold text-xs">
                {formatVehicleReferenceShort(
                  vehiculo.referencia,
                  vehiculo.tipo
                )}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-gray-900 min-w-0 flex-1">
                  {vehiculo.marca} {vehiculo.modelo}
                </h3>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-lg border ${getTipoColor(vehiculo.referencia)} flex-shrink-0 ml-2`}
                >
                  {getTipoLetra(vehiculo.referencia)}
                </span>
              </div>
              {/* Matrícula */}
              <div className="text-xs text-gray-600 font-mono">
                {vehiculo.matricula}
              </div>
            </div>
          </div>
          <div className="ml-2 flex-shrink-0">
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
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
          </div>
        </div>
      </div>

      {/* Contenido desplegable */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          <div className="pt-3 space-y-3">
            {/* Información básica en formato limpio */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Bastidor</span>
                <span className="text-xs font-semibold text-gray-900 font-mono">
                  {vehiculo.bastidor}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Kilómetros</span>
                <span className="text-xs font-semibold text-gray-900">
                  {vehiculo.kms.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Año</span>
                <span className="text-xs font-semibold text-gray-900">
                  {vehiculo.año || 'N/A'}
                </span>
              </div>
            </div>

            {/* Alerta de ITV vencida */}
            {vehiculo.itv !== null &&
              vehiculo.itv !== undefined &&
              vehiculo.itv !== '' &&
              !isPositive(vehiculo.itv) && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <svg
                      className="w-4 h-4 text-red-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-red-800">
                      ITV VENCIDA
                    </span>
                  </div>
                  <p className="text-xs text-red-600 mt-1">
                    Revisar estado de la ITV antes de continuar
                  </p>
                </div>
              )}

            {/* Información adicional de Google Sheets */}
            {true && (
              <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                <div className="text-xs font-medium text-blue-900 mb-2">
                  Información Adicional
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-blue-600">2ª Llave:</span>
                    <span className="font-medium text-blue-900">
                      {vehiculo.segundaLlave || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Carpeta:</span>
                    <span className="font-medium text-blue-900">
                      {vehiculo.carpeta || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Master:</span>
                    <span className="font-medium text-blue-900">
                      {vehiculo.master || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Hojas A:</span>
                    <span className="font-medium text-blue-900">
                      {vehiculo.hojasA || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Docu:</span>
                    <span className="font-medium text-blue-900">
                      {vehiculo.documentacion || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">ITV:</span>
                    <span className="font-medium text-blue-900">
                      {vehiculo.itv || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Seguro:</span>
                    <span className="font-medium text-blue-900">
                      {vehiculo.seguro || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Fecha de creación */}
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-xs font-medium text-gray-600 mb-1">
                Fecha de Registro
              </div>
              <div className="text-xs font-semibold text-gray-900">
                {formatDate(vehiculo.createdAt)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
