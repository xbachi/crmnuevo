'use client'

import { useState } from 'react'

export default function ContratoVentaConGarantiaPage() {
  const [dealData, setDealData] = useState({
    numero: 'RES-2025-482593',
    cliente: {
      nombre: 'Damián',
      apellidos: 'Rodríguez García',
      dni: '44178754D',
      direccion: 'C/ Pizarro 17, P04-10',
      ciudad: 'Misla',
      provincia: 'Valencia',
      telefono: '693339752',
      email: 'damiyeste@hotmail.com',
    },
    vehiculo: {
      marca: 'Peugeot',
      modelo: '308',
      bastidor: 'VF3LPHNYWGS088236',
      matricula: '1234ABC',
      fechaMatriculacion: '2020-01-15',
      kms: 125600,
      precioPublicacion: 11055,
    },
    importeTotal: 11055,
  })

  const [generando, setGenerando] = useState(false)

  const generarContrato = async () => {
    setGenerando(true)
    try {
      const response = await fetch('/api/contrato-venta-con-garantia', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dealData),
      })

      if (!response.ok) {
        throw new Error('Error generando contrato')
      }

      // Crear blob y descargar
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'contrato-venta-con-garantia-14-dias.pdf'
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
            Contrato de Venta con Garantía de 14 Días
          </h1>

          <div className="mb-8 p-4 bg-green-50 rounded-lg">
            <h2 className="text-lg font-semibold text-green-900 mb-2">
              ✅ Contrato IDÉNTICO al Original + Cláusula de Garantía
            </h2>
            <p className="text-green-800 text-sm">
              Este contrato es exactamente igual al contrato de venta que se
              genera cuando vendes un vehículo en deals, pero incluye la
              cláusula adicional de garantía de 14 días. El contrato original se
              mantiene sin cambios.
            </p>
          </div>

          <div className="mb-8 p-4 bg-blue-50 rounded-lg">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">
              📋 Cláusula de Garantía de 14 Días
            </h2>
            <p className="text-blue-800 text-sm">
              "El comprador dispondrá de un plazo de catorce (14) días naturales
              contados a partir de la fecha de entrega del vehículo, con el fin
              de comprobar su correcto funcionamiento. Durante éste periodo, el
              comprador podrá realizar las pruebas necesarias para verificar el
              estado mecánico y general del vehículo. En caso de detectar alguna
              anomalía ó defecto no atribuible al mal uso del comprador el
              vendedor se compromete a reparar sin coste adicional ó si no fuera
              posible a la devolución del mismo."
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Datos del Cliente */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-gray-800 border-b pb-2">
                👤 Datos del Comprador
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={dealData.cliente.nombre}
                    onChange={(e) =>
                      setDealData({
                        ...dealData,
                        cliente: {
                          ...dealData.cliente,
                          nombre: e.target.value,
                        },
                      })
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
                    value={dealData.cliente.apellidos}
                    onChange={(e) =>
                      setDealData({
                        ...dealData,
                        cliente: {
                          ...dealData.cliente,
                          apellidos: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  DNI
                </label>
                <input
                  type="text"
                  value={dealData.cliente.dni}
                  onChange={(e) =>
                    setDealData({
                      ...dealData,
                      cliente: { ...dealData.cliente, dni: e.target.value },
                    })
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
                  value={dealData.cliente.direccion}
                  onChange={(e) =>
                    setDealData({
                      ...dealData,
                      cliente: {
                        ...dealData.cliente,
                        direccion: e.target.value,
                      },
                    })
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
                    value={dealData.cliente.ciudad}
                    onChange={(e) =>
                      setDealData({
                        ...dealData,
                        cliente: {
                          ...dealData.cliente,
                          ciudad: e.target.value,
                        },
                      })
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
                    value={dealData.cliente.provincia}
                    onChange={(e) =>
                      setDealData({
                        ...dealData,
                        cliente: {
                          ...dealData.cliente,
                          provincia: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={dealData.cliente.telefono}
                    onChange={(e) =>
                      setDealData({
                        ...dealData,
                        cliente: {
                          ...dealData.cliente,
                          telefono: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={dealData.cliente.email}
                    onChange={(e) =>
                      setDealData({
                        ...dealData,
                        cliente: { ...dealData.cliente, email: e.target.value },
                      })
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Marca
                  </label>
                  <input
                    type="text"
                    value={dealData.vehiculo.marca}
                    onChange={(e) =>
                      setDealData({
                        ...dealData,
                        vehiculo: {
                          ...dealData.vehiculo,
                          marca: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={dealData.vehiculo.modelo}
                    onChange={(e) =>
                      setDealData({
                        ...dealData,
                        vehiculo: {
                          ...dealData.vehiculo,
                          modelo: e.target.value,
                        },
                      })
                    }
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
                  value={dealData.vehiculo.bastidor}
                  onChange={(e) =>
                    setDealData({
                      ...dealData,
                      vehiculo: {
                        ...dealData.vehiculo,
                        bastidor: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Matrícula
                </label>
                <input
                  type="text"
                  value={dealData.vehiculo.matricula}
                  onChange={(e) =>
                    setDealData({
                      ...dealData,
                      vehiculo: {
                        ...dealData.vehiculo,
                        matricula: e.target.value,
                      },
                    })
                  }
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
                    value={dealData.vehiculo.fechaMatriculacion}
                    onChange={(e) =>
                      setDealData({
                        ...dealData,
                        vehiculo: {
                          ...dealData.vehiculo,
                          fechaMatriculacion: e.target.value,
                        },
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
                    value={dealData.vehiculo.kms}
                    onChange={(e) =>
                      setDealData({
                        ...dealData,
                        vehiculo: {
                          ...dealData.vehiculo,
                          kms: parseInt(e.target.value),
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio Total (€)
                </label>
                <input
                  type="number"
                  value={dealData.importeTotal}
                  onChange={(e) =>
                    setDealData({
                      ...dealData,
                      importeTotal: parseInt(e.target.value),
                    })
                  }
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
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 flex items-center justify-center mx-auto"
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
                <>📄 Generar Contrato con Garantía de 14 Días</>
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
                • <strong>IDÉNTICO</strong> al contrato de venta original que se
                genera en deals
              </li>
              <li>
                • <strong>+ Cláusula de garantía de 14 días</strong> agregada
                como punto 4
              </li>
              <li>
                • <strong>VENDEDOR:</strong> Sebastian Pelella, Sevencars Motors
                SL (tus datos reales)
              </li>
              <li>
                • <strong>COMPRADOR:</strong> Datos del cliente que compra el
                vehículo
              </li>
              <li>
                • <strong>Puede ocupar 2 hojas</strong> debido a la cláusula
                adicional
              </li>
              <li>
                • <strong>Uso único:</strong> Solo para descargar cuando
                necesites esta cláusula especial
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
