'use client'

import { useState } from 'react'
import { useToast } from '@/components/Toast'
import { generarContratoCompraventa } from '@/lib/contractGenerator'

// Datos de ejemplo para probar
const datosEjemplo = {
  id: 1,
  cliente: {
    nombre: 'Juan',
    apellidos: 'Pérez García',
    dni: '12345678A',
    direccion: 'Calle Mayor 123',
    ciudad: 'Valencia',
    provincia: 'Valencia',
    codPostal: '46001',
  },
  vehiculo: {
    marca: 'Toyota',
    modelo: 'Corolla',
    bastidor: '1HGBH41JXMN109186',
    matricula: '1234ABC',
    fechaMatriculacion: '2020-03-15',
    kms: 50000,
  },
  deposito: {
    monto_recibir: 15000,
    dias_gestion: 30,
    multa_retiro_anticipado: 500,
    numero_cuenta: 'ES1234567890123456789012',
  },
}

export default function TestContratoPage() {
  const [isGenerando, setIsGenerando] = useState(false)
  const { showToast } = useToast()

  const handleGenerarContrato = async () => {
    try {
      setIsGenerando(true)
      await generarContratoCompraventa(datosEjemplo)
      showToast('Contrato de compraventa generado correctamente', 'success')
    } catch (error) {
      console.error('Error generando contrato:', error)
      showToast('Error al generar el contrato', 'error')
    } finally {
      setIsGenerando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🧪 Página de Prueba - Contrato de Compraventa
            </h1>
            <p className="text-gray-600">
              Genera un contrato de compraventa con datos de ejemplo para ver el
              formato
            </p>
          </div>

          {/* Botón de generación */}
          <div className="text-center mb-8">
            <button
              onClick={handleGenerarContrato}
              disabled={isGenerando}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-lg font-semibold transition-colors flex items-center space-x-3 mx-auto"
            >
              {isGenerando ? (
                <>
                  <svg
                    className="animate-spin w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Generando...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-6 h-6"
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
                  <span>Generar Contrato de Compraventa</span>
                </>
              )}
            </button>
          </div>

          {/* Datos que se usarán */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Datos del Cliente */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <svg
                  className="w-5 h-5 mr-2 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                Datos del Cliente (Vendedor)
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Nombre:</span>{' '}
                  {datosEjemplo.cliente.nombre} {datosEjemplo.cliente.apellidos}
                </div>
                <div>
                  <span className="font-medium">DNI:</span>{' '}
                  {datosEjemplo.cliente.dni}
                </div>
                <div>
                  <span className="font-medium">Dirección:</span>{' '}
                  {datosEjemplo.cliente.direccion}
                </div>
                <div>
                  <span className="font-medium">Ciudad:</span>{' '}
                  {datosEjemplo.cliente.ciudad}
                </div>
                <div>
                  <span className="font-medium">Provincia:</span>{' '}
                  {datosEjemplo.cliente.provincia}
                </div>
                <div>
                  <span className="font-medium">Código Postal:</span>{' '}
                  {datosEjemplo.cliente.codPostal}
                </div>
              </div>
            </div>

            {/* Datos del Vehículo */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <svg
                  className="w-5 h-5 mr-2 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Datos del Vehículo
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Marca:</span>{' '}
                  {datosEjemplo.vehiculo.marca}
                </div>
                <div>
                  <span className="font-medium">Modelo:</span>{' '}
                  {datosEjemplo.vehiculo.modelo}
                </div>
                <div>
                  <span className="font-medium">Matrícula:</span>{' '}
                  {datosEjemplo.vehiculo.matricula}
                </div>
                <div>
                  <span className="font-medium">Bastidor:</span>{' '}
                  {datosEjemplo.vehiculo.bastidor}
                </div>
                <div>
                  <span className="font-medium">Fecha Matriculación:</span>{' '}
                  {datosEjemplo.vehiculo.fechaMatriculacion}
                </div>
                <div>
                  <span className="font-medium">Kilometraje:</span>{' '}
                  {datosEjemplo.vehiculo.kms.toLocaleString('es-ES')} km
                </div>
              </div>
            </div>

            {/* Datos del Depósito */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <svg
                  className="w-5 h-5 mr-2 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                  />
                </svg>
                Datos del Depósito
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Monto a Recibir:</span> €
                  {datosEjemplo.deposito.monto_recibir.toLocaleString('es-ES')}
                </div>
                <div>
                  <span className="font-medium">Días de Gestión:</span>{' '}
                  {datosEjemplo.deposito.dias_gestion} días
                </div>
                <div>
                  <span className="font-medium">Multa Retiro Anticipado:</span>{' '}
                  €{datosEjemplo.deposito.multa_retiro_anticipado}
                </div>
                <div>
                  <span className="font-medium">Número de Cuenta:</span>{' '}
                  {datosEjemplo.deposito.numero_cuenta}
                </div>
              </div>
            </div>

            {/* Información del Contrato */}
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <svg
                  className="w-5 h-5 mr-2 text-blue-600"
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
                Información del Contrato
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Tipo:</span> Contrato de
                  Compraventa de Vehículo Usado
                </div>
                <div>
                  <span className="font-medium">Comprador:</span> D. Sebastian
                  Pelella (Sevencars Motors SL)
                </div>
                <div>
                  <span className="font-medium">Vendedor:</span>{' '}
                  {datosEjemplo.cliente.nombre} {datosEjemplo.cliente.apellidos}
                </div>
                <div>
                  <span className="font-medium">Precio:</span> €
                  {datosEjemplo.deposito.monto_recibir.toLocaleString('es-ES')}
                </div>
                <div>
                  <span className="font-medium">Régimen:</span> REBU (Régimen
                  Especial de Bienes Usados)
                </div>
              </div>
            </div>
          </div>

          {/* Instrucciones */}
          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-semibold text-yellow-800 mb-2">
              📋 Instrucciones:
            </h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>
                • Haz clic en "Generar Contrato de Compraventa" para crear el
                PDF
              </li>
              <li>• El archivo se descargará automáticamente</li>
              <li>• El contrato incluye fecha y hora actual de generación</li>
              <li>
                • Todos los datos mostrados arriba se incluirán en el contrato
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
