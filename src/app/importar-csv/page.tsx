'use client'

import { useState } from 'react'
import { useToast } from '@/components/Toast'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function ImportarCSV() {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [csvData, setCsvData] = useState<any[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const { showToast, ToastContainer } = useToast()

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      showToast('Por favor selecciona un archivo CSV', 'error')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    const reader = new FileReader()

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100
        setUploadProgress(progress)
      }
    }

    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string
        const parsedData = parseCSV(csvText)

        setCsvData(parsedData)
        setShowPreview(true)
        setIsUploading(false)
        showToast(
          `CSV cargado exitosamente: ${parsedData.length} registros`,
          'success'
        )
      } catch (error) {
        console.error('Error parsing CSV:', error)
        showToast('Error al procesar el archivo CSV', 'error')
        setIsUploading(false)
      }
    }

    reader.readAsText(file)
  }

  const parseCSV = (csvText: string) => {
    const lines = csvText.split('\n')
    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''))

    const data = []
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i]
          .split(',')
          .map((v) => v.trim().replace(/"/g, ''))
        const row: any = {}

        headers.forEach((header, index) => {
          row[header] = values[index] || ''
        })

        data.push(row)
      }
    }

    return data
  }

  const handleImport = async () => {
    if (csvData.length === 0) {
      showToast('No hay datos para importar', 'error')
      return
    }

    setIsUploading(true)

    try {
      const response = await fetch('/api/vehiculos/import-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: csvData }),
      })

      if (response.ok) {
        const result = await response.json()
        showToast(
          `✅ Importación exitosa: ${result.imported} vehículos importados`,
          'success'
        )
        setCsvData([])
        setShowPreview(false)
      } else {
        const error = await response.json()
        showToast(`❌ Error: ${error.error}`, 'error')
      }
    } catch (error) {
      console.error('Error importing data:', error)
      showToast('Error al importar los datos', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  const clearData = () => {
    setCsvData([])
    setShowPreview(false)
    setUploadProgress(0)
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Importar Datos CSV
                </h1>
                <p className="text-gray-600 mt-1">
                  Importa vehículos desde un archivo CSV descargado de Google
                  Sheets
                </p>
              </div>
              <button
                onClick={() => window.history.back()}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                ← Volver
              </button>
            </div>
          </div>

          {/* Upload Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              1. Seleccionar Archivo CSV
            </h2>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer block">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400 mb-4"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="text-lg text-gray-600 mb-2">
                  {isUploading
                    ? 'Procesando archivo...'
                    : 'Haz clic para seleccionar archivo CSV'}
                </p>
                <p className="text-sm text-gray-500">
                  Solo archivos .csv son permitidos
                </p>
              </label>
            </div>

            {isUploading && (
              <div className="mt-4">
                <div className="bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-2 text-center">
                  Progreso: {Math.round(uploadProgress)}%
                </p>
              </div>
            )}
          </div>

          {/* Preview Section */}
          {showPreview && csvData.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  2. Vista Previa ({csvData.length} registros)
                </h2>
                <button
                  onClick={clearData}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-800 transition-colors"
                >
                  Limpiar
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(csvData[0] || {}).map((header, index) => (
                        <th
                          key={index}
                          className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {csvData.slice(0, 5).map((row, index) => (
                      <tr key={index}>
                        {Object.values(row).map((value, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="px-3 py-2 whitespace-nowrap text-sm text-gray-900"
                          >
                            {String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvData.length > 5 && (
                  <p className="text-sm text-gray-500 mt-2 text-center">
                    ... y {csvData.length - 5} registros más
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Import Section */}
          {showPreview && csvData.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                3. Importar Datos
              </h2>
              <p className="text-gray-600 mb-4">
                Los datos se importarán a la base de datos. Esta acción
                reemplazará todos los vehículos existentes.
              </p>

              <div className="flex space-x-4">
                <button
                  onClick={handleImport}
                  disabled={isUploading}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isUploading
                    ? 'Importando...'
                    : `Importar ${csvData.length} vehículos`}
                </button>

                <button
                  onClick={clearData}
                  disabled={isUploading}
                  className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">
              📋 Instrucciones para Google Sheets
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-blue-800">
              <li>Abre tu Google Sheet con los datos de vehículos</li>
              <li>
                Selecciona todas las filas de datos (incluyendo la fila de
                encabezados)
              </li>
              <li>
                Ve a{' '}
                <strong>
                  Archivo → Descargar → Valores separados por comas (.csv)
                </strong>
              </li>
              <li>Guarda el archivo en tu computadora</li>
              <li>Sube el archivo usando el formulario de arriba</li>
            </ol>

            <div className="mt-4 p-3 bg-blue-100 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">
                📝 Columnas esperadas:
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-blue-800">
                <span>• referencia</span>
                <span>• marca</span>
                <span>• modelo</span>
                <span>• matricula</span>
                <span>• bastidor</span>
                <span>• kms</span>
                <span>• tipo</span>
                <span>• estado</span>
                <span>• año</span>
                <span>• color</span>
                <span>• itv</span>
                <span>• seguro</span>
                <span>• segundaLlave</span>
                <span>• documentacion</span>
                <span>• carpeta</span>
                <span>• master</span>
                <span>• hojasA</span>
              </div>

              <div className="mt-3 p-2 bg-yellow-100 rounded-lg">
                <h5 className="font-semibold text-yellow-900 mb-1">
                  💡 Nota sobre la columna "estado":
                </h5>
                <p className="text-xs text-yellow-800">
                  • <strong>Vacío o "disponible"</strong>: Vehículo activo (se
                  puede ver, editar, eliminar)
                  <br />• <strong>"vendido"</strong>: Vehículo vendido (aparece
                  con opacidad reducida y botones deshabilitados)
                </p>
              </div>
            </div>
          </div>
        </div>

        <ToastContainer />
      </div>
    </ProtectedRoute>
  )
}
