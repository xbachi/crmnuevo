'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'

interface Interesado {
  id: number
  nombre: string
  apellidos: string
  telefono: string
  vehiculosInteres?: string
  presupuestoMaximo?: number
  kilometrajeMaximo?: number
  añoMinimo?: number
  combustiblePreferido?: string
  cambioPreferido?: string
  formaPagoPreferida?: string
}

export default function InteresadosPage() {
  const router = useRouter()
  const [items, setItems] = useState<Interesado[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchItems = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/interesados')
      if (!res.ok) {
        setItems([])
        return
      }
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  const safeItems: Interesado[] = Array.isArray(items) ? items : []
  const filtered = safeItems.filter((i) => {
    const v = i.vehiculosInteres
      ? (() => {
          try {
            return JSON.parse(i.vehiculosInteres)
          } catch {
            return []
          }
        })()
      : []
    return (
      !search ||
      i.nombre.toLowerCase().includes(search.toLowerCase()) ||
      i.apellidos.toLowerCase().includes(search.toLowerCase()) ||
      i.telefono.includes(search) ||
      v.some((s: string) => s.toLowerCase().includes(search.toLowerCase()))
    )
  })

  return (
    <ProtectedRoute>
      <div className="min-h-full bg-gradient-to-br from-slate-50 via-orange-50 to-red-100">
        <main className="w-[80%] mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Interesados</h1>
              <p className="text-slate-600 text-sm">
                {filtered.length} mostrados
              </p>
            </div>
            <button
              onClick={() => router.push('/interesados/crear')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Nuevo
            </button>
          </div>

          <div className="bg-white rounded-xl shadow border border-slate-200 p-4 mb-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, teléfono o vehículo de interés..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          {loading ? (
            <div className="text-slate-600">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-600">Sin resultados</div>
          ) : (
            <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Interesado
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Contacto
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Vehículo Interesado
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Precio Máx
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Forma de Pago
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filtered.map((i) => {
                      const vehs = i.vehiculosInteres
                        ? (() => {
                            try {
                              return JSON.parse(i.vehiculosInteres)
                            } catch {
                              return []
                            }
                          })()
                        : []
                      return (
                        <tr
                          key={i.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push(`/interesados/${i.id}`)}
                        >
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {i.nombre} {i.apellidos}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {i.telefono}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {vehs.join(', ') || 'No especificado'}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {i.presupuestoMaximo
                              ? `€${i.presupuestoMaximo.toLocaleString()}`
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-700 capitalize">
                            {i.formaPagoPreferida || '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  )
}
