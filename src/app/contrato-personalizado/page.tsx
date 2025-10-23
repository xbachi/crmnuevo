'use client'

import { useState } from 'react'

export default function ContratoPersonalizadoPage() {
  const [cliente, setCliente] = useState({
    nombre: 'Juan',
    apellidos: 'Pérez García',
    dni: '12345678A',
    direccion: 'Calle Ejemplo, 123',
    ciudad: 'Valencia',
    provincia: 'Valencia',
  })

  const [vehiculo, setVehiculo] = useState({
    marca: '',
    modelo: '',
    bastidor: '',
    matricula: '',
    fechaMatriculacion: '',
    kms: '',
    color: '',
  })

  const [generando, setGenerando] = useState(false)

  const generarContrato = async () => {
    setGenerando(true)
    try {
      const response = await fetch('/api/contrato-personalizado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cliente,
          vehiculo: {
            ...vehiculo,
            fechaMatriculacion: vehiculo.fechaMatriculacion || null,
            kms: vehiculo.kms ? parseInt(vehiculo.kms) : null,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Error generando contrato')
      }

      // Crear blob y descargar
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'contrato-personalizado-garantia-14-dias.pdf'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error:', error)
      alert('Error generando el contrato')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Generador de Contrato de Venta
          </h1>

          <div className="mb-8 p-4 bg-blue-50 rounded-lg">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">
              📋 Cláusula de Garantía de 14 Días
            </h2>
            <p className="text-blue-800 text-sm">
              Este contrato de VENTA incluye una cláusula especial que otorga al
              comprador un plazo de 14 días naturales para comprobar el correcto
              funcionamiento del vehículo, con derecho a reparación sin coste
              adicional o devolución en caso de anomalías no atribuibles al mal
              uso.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Datos del Cliente */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-gray-800 border-b pb-2">
                👤 Datos del Comprador
              </h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  value={cliente.nombre}
                  onChange={(e) =>
                    setCliente({ ...cliente, nombre: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Apellidos
                </label>
                <input
                  type="text"
                  value={cliente.apellidos}
                  onChange={(e) =>
                    setCliente({ ...cliente, apellidos: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  DNI
                </label>
                <input
                  type="text"
                  value={cliente.dni}
                  onChange={(e) =>
                    setCliente({ ...cliente, dni: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección
                </label>
                <input
                  type="text"
                  value={cliente.direccion}
                  onChange={(e) =>
                    setCliente({ ...cliente, direccion: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={cliente.ciudad}
                    onChange={(e) =>
                      setCliente({ ...cliente, ciudad: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Provincia
                  </label>
                  <input
                    type="text"
                    value={cliente.provincia}
                    onChange={(e) =>
                      setCliente({ ...cliente, provincia: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Datos del Vehículo */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-gray-800 border-b pb-2">
                🚗 Datos del Vehículo
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Los campos del vehículo se dejarán en blanco para completar
                manualmente
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Marca
                  </label>
                  <input
                    type="text"
                    value={vehiculo.marca}
                    onChange={(e) =>
                      setVehiculo({ ...vehiculo, marca: e.target.value })
                    }
                    placeholder="Dejar en blanco"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={vehiculo.modelo}
                    onChange={(e) =>
                      setVehiculo({ ...vehiculo, modelo: e.target.value })
                    }
                    placeholder="Dejar en blanco"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bastidor
                </label>
                <input
                  type="text"
                  value={vehiculo.bastidor}
                  onChange={(e) =>
                    setVehiculo({ ...vehiculo, bastidor: e.target.value })
                  }
                  placeholder="Dejar en blanco"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Matrícula
                </label>
                <input
                  type="text"
                  value={vehiculo.matricula}
                  onChange={(e) =>
                    setVehiculo({ ...vehiculo, matricula: e.target.value })
                  }
                  placeholder="Dejar en blanco"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha Matriculación
                  </label>
                  <input
                    type="date"
                    value={vehiculo.fechaMatriculacion}
                    onChange={(e) =>
                      setVehiculo({
                        ...vehiculo,
                        fechaMatriculacion: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kilometraje
                  </label>
                  <input
                    type="number"
                    value={vehiculo.kms}
                    onChange={(e) =>
                      setVehiculo({ ...vehiculo, kms: e.target.value })
                    }
                    placeholder="Dejar en blanco"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <input
                  type="text"
                  value={vehiculo.color}
                  onChange={(e) =>
                    setVehiculo({ ...vehiculo, color: e.target.value })
                  }
                  placeholder="Dejar en blanco"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Botón de generar */}
          <div className="mt-8 text-center">
            <button
              onClick={generarContrato}
              disabled={generando}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 flex items-center justify-center mx-auto"
            >
              {generando ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Generando contrato...
                </>
              ) : (
                <>📄 Generar Contrato PDF</>
              )}
            </button>
          </div>

          {/* Información adicional */}
          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-semibold text-gray-800 mb-2">
              ℹ️ Información del Contrato
            </h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>
                • <strong>VENDEDOR:</strong> Sebastian Pelella, Sevencars Motors
                SL (tus datos reales)
              </li>
              <li>
                • <strong>COMPRADOR:</strong> Datos del cliente que compra el
                vehículo
              </li>
              <li>
                • Los datos del vehículo se pueden dejar en blanco para
                completar manualmente
              </li>
              <li>
                • El precio se puede dejar en blanco para completar manualmente
              </li>
              <li>• Incluye la cláusula especial de garantía de 14 días</li>
              <li>• Contrato de VENTA listo para imprimir y firmar</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
