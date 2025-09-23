'use client'

import { useState } from 'react'
import { generarContratoVenta, generarFactura } from '@/lib/contractGenerator'

export default function TestDocumentosPage() {
  const [isGenerating, setIsGenerating] = useState(false)

  // Datos de ejemplo para testing
  const sampleDealData = {
    id: 999,
    numero: 'TEST-2025-0001',
    fechaCreacion: new Date('2025-09-23T10:00:00'),
    cliente: {
      id: 1,
      nombre: 'Juan',
      apellidos: 'Pérez García',
      dni: '12345678A',
      telefono: '666123456',
      email: 'juan.perez@email.com',
      direccion: 'Calle Mayor 123',
      ciudad: 'Valencia',
      provincia: 'Valencia',
      cod_postal: '46001',
    },
    vehiculo: {
      id: 1,
      marca: 'Peugeot',
      modelo: '207',
      matricula: '1234ABC',
      bastidor: 'VF3ABC12345678901',
      kms: 125000,
      año: 2015,
      color: 'Blanco',
      fecha_matriculacion: new Date('2015-03-15'),
      precio_venta: 8500,
    },
    importeTotal: 8500,
    importeSena: 1000,
    formaPagoSena: 'transferencia',
    fechaReservaDesde: new Date('2025-09-23T10:00:00'),
    fechaReservaExpira: new Date('2025-09-30T10:00:00'),
    fechaVentaFirmada: new Date('2025-09-23T11:00:00'),
    fechaFacturada: new Date('2025-09-23T12:00:00'),
    responsableComercial: 'Sebastian',
  }

  const handleGenerarContratoVenta = async () => {
    try {
      setIsGenerating(true)
      await generarContratoVenta(sampleDealData)
      alert('Contrato de venta generado correctamente')
    } catch (error) {
      console.error('Error generando contrato:', error)
      alert('Error al generar el contrato de venta')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerarFacturaIVA = async () => {
    try {
      setIsGenerating(true)
      await generarFactura(sampleDealData, 'IVA')
      alert('Factura IVA generada correctamente')
    } catch (error) {
      console.error('Error generando factura:', error)
      alert('Error al generar la factura IVA')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerarFacturaREBU = async () => {
    try {
      setIsGenerating(true)
      await generarFactura(sampleDealData, 'REBU')
      alert('Factura REBU generada correctamente')
    } catch (error) {
      console.error('Error generando factura:', error)
      alert('Error al generar la factura REBU')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            🧪 Página de Prueba - Documentos
          </h1>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Datos de Ejemplo Utilizados:
            </h2>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div>
                <strong>Deal:</strong> {sampleDealData.numero}
              </div>
              <div>
                <strong>Cliente:</strong> {sampleDealData.cliente.nombre}{' '}
                {sampleDealData.cliente.apellidos}
              </div>
              <div>
                <strong>DNI:</strong> {sampleDealData.cliente.dni}
              </div>
              <div>
                <strong>Vehículo:</strong> {sampleDealData.vehiculo.marca}{' '}
                {sampleDealData.vehiculo.modelo}
              </div>
              <div>
                <strong>Matrícula:</strong> {sampleDealData.vehiculo.matricula}
              </div>
              <div>
                <strong>Bastidor:</strong> {sampleDealData.vehiculo.bastidor}
              </div>
              <div>
                <strong>Precio:</strong>{' '}
                {sampleDealData.importeTotal.toLocaleString('es-ES')}€
              </div>
              <div>
                <strong>Seña:</strong>{' '}
                {sampleDealData.importeSena.toLocaleString('es-ES')}€
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contrato de Venta */}
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-blue-900 mb-4">
                📄 Contrato de Venta
              </h3>
              <p className="text-blue-700 text-sm mb-4">
                Genera un contrato de compraventa de vehículo usado con los
                datos de ejemplo.
              </p>
              <button
                onClick={handleGenerarContratoVenta}
                disabled={isGenerating}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? 'Generando...' : 'Generar Contrato de Venta'}
              </button>
            </div>

            {/* Factura IVA */}
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-green-900 mb-4">
                🧾 Factura IVA
              </h3>
              <p className="text-green-700 text-sm mb-4">
                Genera una factura con IVA (21%) incluido.
              </p>
              <button
                onClick={handleGenerarFacturaIVA}
                disabled={isGenerating}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? 'Generando...' : 'Generar Factura IVA'}
              </button>
            </div>

            {/* Factura REBU */}
            <div className="bg-orange-50 rounded-lg p-6 border border-orange-200">
              <h3 className="text-lg font-semibold text-orange-900 mb-4">
                🧾 Factura REBU
              </h3>
              <p className="text-orange-700 text-sm mb-4">
                Genera una factura REBU (Régimen Especial de Bienes Usados) sin
                IVA.
              </p>
              <button
                onClick={handleGenerarFacturaREBU}
                disabled={isGenerating}
                className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? 'Generando...' : 'Generar Factura REBU'}
              </button>
            </div>

            {/* Información adicional */}
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                ℹ️ Información
              </h3>
              <div className="text-gray-700 text-sm space-y-2">
                <p>• Los documentos se descargarán automáticamente</p>
                <p>• Puedes modificar los datos de ejemplo en el código</p>
                <p>• Esta página es solo para testing y desarrollo</p>
                <p>• Los archivos se guardan en la carpeta Downloads</p>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <h4 className="font-semibold text-yellow-800 mb-2">
              ⚠️ Nota Importante:
            </h4>
            <p className="text-yellow-700 text-sm">
              Esta página utiliza datos de ejemplo predefinidos. Para modificar
              los datos, edita la variable{' '}
              <code className="bg-yellow-100 px-1 rounded">sampleDealData</code>
              en el archivo{' '}
              <code className="bg-yellow-100 px-1 rounded">
                src/app/test-documentos/page.tsx
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
