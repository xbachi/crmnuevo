'use client'

import { useState } from 'react'
import {
  generarContratoReserva,
  generarContratoVenta,
  generarFactura,
  generarContratoDeposito,
  generarContratoCompraventa,
} from '@/lib/contractGenerator'

export default function TestContratosPage() {
  const [isGenerating, setIsGenerating] = useState<string | null>(null)

  // Datos de prueba para deals
  const dealData = {
    numero: 'TEST-001',
    fechaCreacion: new Date(),
    cliente: {
      nombre: 'Juan',
      apellidos: 'Pérez García',
      dni: '12345678A',
      telefono: '666123456',
      email: 'juan.perez@email.com',
      direccion: 'Calle Mayor 123',
      ciudad: 'Madrid',
      provincia: 'Madrid',
      codPostal: '28001',
    },
    vehiculo: {
      marca: 'BMW',
      modelo: 'X5',
      matricula: '1234ABC',
      bastidor: 'WBAFR9C50DD123456',
      precioPublicacion: 45000,
      fechaMatriculacion: '2020-03-15', // Fecha de prueba
      año: 2020,
    },
    importeTotal: 45000,
    importeSena: 5000,
    formaPagoSena: 'transferencia',
    fechaReservaDesde: new Date(),
    fechaReservaExpira: new Date(
      new Date().getTime() + 7 * 24 * 60 * 60 * 1000
    ), // 7 días
  }

  // Datos de prueba para depósito
  const depositoData = {
    id: 1,
    cliente: {
      nombre: 'María',
      apellidos: 'González López',
      dni: '87654321B',
      telefono: '666987654',
      email: 'maria.gonzalez@email.com',
      direccion: 'Avenida de la Paz 456',
      ciudad: 'Barcelona',
      provincia: 'Barcelona',
      codPostal: '08001',
    },
    vehiculo: {
      marca: 'Audi',
      modelo: 'A4',
      matricula: '5678DEF',
      bastidor: 'WAUZZZ8V9KA123456',
      fechaMatriculacion: '2019-05-20',
      kms: 45000,
    },
    deposito: {
      monto_recibir: 25000,
      dias_gestion: 90,
      multa_retiro_anticipado: 500,
      numero_cuenta: 'ES1234567890123456789012',
    },
  }

  const handleGenerarContrato = async (
    tipo: 'reserva' | 'venta' | 'factura' | 'deposito' | 'compra'
  ) => {
    setIsGenerating(tipo)
    try {
      console.log(
        `🔧 Generando ${tipo} con datos:`,
        tipo === 'compra' ? depositoData : dealData
      )

      let pdfBuffer: Uint8Array

      switch (tipo) {
        case 'reserva':
          console.log('📄 Generando contrato de reserva...')
          pdfBuffer = await generarContratoReserva(dealData)
          break
        case 'venta':
          console.log('📋 Generando contrato de venta...')
          pdfBuffer = await generarContratoVenta(dealData)
          break
        case 'factura':
          console.log('🧾 Generando factura...')
          pdfBuffer = await generarFactura(dealData)
          break
        case 'deposito':
          console.log('💰 Generando contrato de depósito...')
          pdfBuffer = await generarContratoDeposito(depositoData)
          break
        case 'compra':
          console.log('🛒 Generando contrato de compra a particulares...')
          pdfBuffer = await generarContratoCompraventa(depositoData)
          break
      }

      console.log(`✅ ${tipo} generado, tamaño:`, pdfBuffer.length, 'bytes')

      // Convertir Uint8Array a Blob
      const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' })

      // Crear URL del blob y descargar
      const url = window.URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `test-${tipo}-${new Date().getTime()}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      alert(
        `✅ ${tipo.charAt(0).toUpperCase() + tipo.slice(1)} generado correctamente!`
      )
    } catch (error) {
      console.error(`❌ Error generando ${tipo}:`, error)
      alert(`❌ Error generando ${tipo}: ${error}`)
    } finally {
      setIsGenerating(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            🧪 Test de Contratos y Facturas
          </h1>

          <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Datos para Deals */}
            <div className="p-6 bg-blue-50 rounded-lg">
              <h2 className="text-lg font-semibold text-blue-900 mb-4">
                📋 Datos para Deals (Reserva, Venta, Factura)
              </h2>
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div>
                  <strong>Cliente:</strong> {dealData.cliente.nombre}{' '}
                  {dealData.cliente.apellidos}
                </div>
                <div>
                  <strong>Vehículo:</strong> {dealData.vehiculo.marca}{' '}
                  {dealData.vehiculo.modelo}
                </div>
                <div>
                  <strong>Matrícula:</strong> {dealData.vehiculo.matricula}
                </div>
                <div>
                  <strong>Fecha Matriculación:</strong>{' '}
                  {dealData.vehiculo.fechaMatriculacion}
                </div>
                <div>
                  <strong>Precio:</strong>{' '}
                  {dealData.importeTotal?.toLocaleString()}€
                </div>
                <div>
                  <strong>Seña:</strong>{' '}
                  {dealData.importeSena?.toLocaleString()}€
                </div>
              </div>
            </div>

            {/* Datos para Depósitos */}
            <div className="p-6 bg-purple-50 rounded-lg">
              <h2 className="text-lg font-semibold text-purple-900 mb-4">
                💰 Datos para Depósitos (Depósito, Compra)
              </h2>
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div>
                  <strong>Cliente:</strong> {depositoData.cliente.nombre}{' '}
                  {depositoData.cliente.apellidos}
                </div>
                <div>
                  <strong>Vehículo:</strong> {depositoData.vehiculo.marca}{' '}
                  {depositoData.vehiculo.modelo}
                </div>
                <div>
                  <strong>Matrícula:</strong> {depositoData.vehiculo.matricula}
                </div>
                <div>
                  <strong>Fecha Matriculación:</strong>{' '}
                  {depositoData.vehiculo.fechaMatriculacion}
                </div>
                <div>
                  <strong>Monto a Recibir:</strong>{' '}
                  {depositoData.deposito.monto_recibir?.toLocaleString()}€
                </div>
                <div>
                  <strong>Días Gestión:</strong>{' '}
                  {depositoData.deposito.dias_gestion} días
                </div>
                <div>
                  <strong>Multa Retiro:</strong>{' '}
                  {depositoData.deposito.multa_retiro_anticipado}€
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {/* Botón Contrato de Reserva */}
            <div className="text-center">
              <button
                onClick={() => handleGenerarContrato('reserva')}
                disabled={isGenerating !== null}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
                  isGenerating === 'reserva'
                    ? 'bg-orange-400 cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-600 hover:shadow-lg'
                }`}
              >
                {isGenerating === 'reserva' ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Generando...
                  </div>
                ) : (
                  <>
                    📄 Contrato de Reserva
                    <div className="text-sm mt-1 opacity-90">
                      Generar PDF de reserva
                    </div>
                  </>
                )}
              </button>
            </div>

            {/* Botón Contrato de Venta */}
            <div className="text-center">
              <button
                onClick={() => handleGenerarContrato('venta')}
                disabled={isGenerating !== null}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
                  isGenerating === 'venta'
                    ? 'bg-green-400 cursor-not-allowed'
                    : 'bg-green-500 hover:bg-green-600 hover:shadow-lg'
                }`}
              >
                {isGenerating === 'venta' ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Generando...
                  </div>
                ) : (
                  <>
                    📋 Contrato de Venta
                    <div className="text-sm mt-1 opacity-90">
                      Generar PDF de venta
                    </div>
                  </>
                )}
              </button>
            </div>

            {/* Botón Factura */}
            <div className="text-center">
              <button
                onClick={() => handleGenerarContrato('factura')}
                disabled={isGenerating !== null}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
                  isGenerating === 'factura'
                    ? 'bg-blue-400 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600 hover:shadow-lg'
                }`}
              >
                {isGenerating === 'factura' ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Generando...
                  </div>
                ) : (
                  <>
                    🧾 Factura
                    <div className="text-sm mt-1 opacity-90">
                      Generar PDF de factura
                    </div>
                  </>
                )}
              </button>
            </div>

            {/* Botón Contrato de Depósito */}
            <div className="text-center">
              <button
                onClick={() => handleGenerarContrato('deposito')}
                disabled={isGenerating !== null}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
                  isGenerating === 'deposito'
                    ? 'bg-purple-400 cursor-not-allowed'
                    : 'bg-purple-500 hover:bg-purple-600 hover:shadow-lg'
                }`}
              >
                {isGenerating === 'deposito' ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Generando...
                  </div>
                ) : (
                  <>
                    💰 Contrato de Depósito
                    <div className="text-sm mt-1 opacity-90">
                      Generar PDF de depósito
                    </div>
                  </>
                )}
              </button>
            </div>

            {/* Botón Contrato de Compra a Particulares */}
            <div className="text-center">
              <button
                onClick={() => handleGenerarContrato('compra')}
                disabled={isGenerating !== null}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all duration-200 ${
                  isGenerating === 'compra'
                    ? 'bg-indigo-400 cursor-not-allowed'
                    : 'bg-indigo-500 hover:bg-indigo-600 hover:shadow-lg'
                }`}
              >
                {isGenerating === 'compra' ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Generando...
                  </div>
                ) : (
                  <>
                    🛒 Contrato de Compra
                    <div className="text-sm mt-1 opacity-90">
                      Compra a particulares
                    </div>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-8 p-4 bg-yellow-50 rounded-lg">
            <h3 className="font-semibold text-yellow-800 mb-2">
              🔍 ¿Qué Verificar?
            </h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>
                • <strong>Fecha de Matriculación:</strong> Debe aparecer "15 de
                marzo de 2020" (no "No especificada")
              </li>
              <li>
                • <strong>Datos del Cliente:</strong> Nombre, DNI, teléfono,
                dirección
              </li>
              <li>
                • <strong>Datos del Vehículo:</strong> Marca, modelo, matrícula,
                bastidor, precio
              </li>
              <li>
                • <strong>Formato del PDF:</strong> Debe generarse correctamente
                y ser descargable
              </li>
            </ul>
          </div>

          <div className="mt-6 text-center">
            <a
              href="/deals"
              className="text-gray-600 hover:text-gray-800 underline"
            >
              ← Volver a Deals
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
