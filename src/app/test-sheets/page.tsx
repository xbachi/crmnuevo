'use client'

import { useState } from 'react'

export default function TestSheetsPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string>('')

  const testGoogleSheets = async () => {
    setLoading(true)
    setResult('')

    try {
      const response = await fetch('/api/test-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (data.success) {
        setResult(`✅ ${data.message}`)
      } else {
        setResult(`❌ Error: ${data.error}`)
      }
    } catch (error: any) {
      setResult(`❌ Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            Prueba Google Sheets
          </h1>
          
          <p className="text-gray-600 mb-6">
            Esta página te permite probar la integración con Google Sheets.
            Asegúrate de haber configurado las variables de entorno correctamente.
          </p>

          <button
            onClick={testGoogleSheets}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Probando...' : 'Probar Google Sheets'}
          </button>

          {result && (
            <div className={`mt-4 p-4 rounded-md ${
              result.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {result}
            </div>
          )}

          <div className="mt-6 text-sm text-gray-500">
            <h3 className="font-semibold mb-2">Variables de entorno requeridas:</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>GOOGLE_SERVICE_ACCOUNT_EMAIL</li>
              <li>GOOGLE_PRIVATE_KEY</li>
            </ul>
            <p className="mt-2 text-xs">
              <strong>Nota:</strong> Los IDs de las hojas ya están configurados en el código:
              <br />• Ventas-Sevencars: 1RwnqBYlPMXj2rUJ3XqegrSQ-kM5RIJG61uGALy-pEH8
              <br />• COMPRAS: 1asyKq66_4_GUwkYQdgjSIOLR5wY3ur06ebgleFFWiW0
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
