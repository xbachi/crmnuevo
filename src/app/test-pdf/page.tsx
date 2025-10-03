'use client'

import { useState } from 'react'
import {
  generarContratoReserva,
  generarContratoVenta,
  generarFactura,
} from '@/lib/contractGenerator'
import FacturaTypeModal from '@/components/FacturaTypeModal'

export default function TestPDFPage() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [showFacturaModal, setShowFacturaModal] = useState(false)

  // Datos de ejemplo para el contrato
  const dealEjemplo = {
    numero: 'TEST-001',
    fechaCreacion: new Date(),
    cliente: {
      nombre: 'Juan',
      apellidos: 'Pérez García',
      dni: '12345678A',
      telefono: '666123456',
      email: 'juan.perez@email.com',
    },
    vehiculo: {
      marca: 'Toyota',
      modelo: 'Corolla',
      matricula: '1234ABC',
      año: 2020,
      referencia: 'REF-001',
      kms: 45000,
      bastidor: 'JT2BF28K123456789',
    },
    importeTotal: 15000,
    importeSena: 3000,
    formaPagoSena: 'transferencia',
    fechaReservaDesde: new Date(),
    fechaReservaExpira: new Date(
      new Date().getTime() + 7 * 24 * 60 * 60 * 1000
    ), // 7 días
  }

  const handleGenerarContratoReserva = async () => {
    setIsGenerating(true)
    try {
      await generarContratoReserva(dealEjemplo)
      alert('✅ Contrato de reserva generado! Revisa tu carpeta de descargas.')
    } catch (error) {
      console.error('Error:', error)
      alert('❌ Error generando PDF: ' + (error as Error).message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerarContratoVenta = async () => {
    setIsGenerating(true)
    try {
      await generarContratoVenta(dealEjemplo)
      alert('✅ Contrato de venta generado! Revisa tu carpeta de descargas.')
    } catch (error) {
      console.error('Error:', error)
      alert('❌ Error generando PDF: ' + (error as Error).message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerarFactura = () => {
    setShowFacturaModal(true)
  }

  const handleConfirmFactura = async (
    tipoFactura: 'IVA' | 'REBU',
    numeroFactura?: string
  ) => {
    setIsGenerating(true)
    try {
      await generarFactura(dealEjemplo, tipoFactura, numeroFactura)
      alert(
        `✅ Factura ${tipoFactura} generada! Revisa tu carpeta de descargas.`
      )
    } catch (error) {
      console.error('Error:', error)
      alert('❌ Error generando PDF: ' + (error as Error).message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            🧪 Prueba de Generación de PDFs
          </h1>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Datos de Prueba:
            </h2>
            <div className="bg-gray-50 rounded-lg p-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <strong>Cliente:</strong> {dealEjemplo.cliente.nombre}{' '}
                  {dealEjemplo.cliente.apellidos}
                </div>
                <div>
                  <strong>Vehículo:</strong> {dealEjemplo.vehiculo.marca}{' '}
                  {dealEjemplo.vehiculo.modelo}
                </div>
                <div>
                  <strong>Matrícula:</strong> {dealEjemplo.vehiculo.matricula}
                </div>
                <div>
                  <strong>Precio:</strong>{' '}
                  {dealEjemplo.importeTotal.toLocaleString()}€
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Generar PDFs:
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={handleGenerarContratoReserva}
                disabled={isGenerating}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? '⏳ Generando...' : '📄 Contrato de Reserva'}
              </button>

              <button
                onClick={handleGenerarContratoVenta}
                disabled={isGenerating}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? '⏳ Generando...' : '📋 Contrato de Venta'}
              </button>

              <button
                onClick={handleGenerarFactura}
                disabled={isGenerating}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? '⏳ Generando...' : '🧾 Factura'}
              </button>
            </div>
          </div>

          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-800 mb-2">
              📝 Instrucciones:
            </h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>
                • Haz clic en cualquiera de los botones para generar un PDF de
                prueba
              </li>
              <li>
                • El PDF se descargará automáticamente en tu carpeta de
                descargas
              </li>
              <li>• Revisa que el logo aparezca correctamente en negro</li>
              <li>
                • Verifica que el tamaño del logo sea apropiado (no muy alto)
              </li>
              <li>• Comprueba que todo el contenido quepa en una página A4</li>
            </ul>
          </div>
        </div>
      </div>

      <FacturaTypeModal
        isOpen={showFacturaModal}
        onClose={() => setShowFacturaModal(false)}
        onConfirm={handleConfirmFactura}
      />
    </div>
  )
}
