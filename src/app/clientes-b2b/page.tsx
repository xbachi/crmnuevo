'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'

interface ClienteB2B {
  id: number
  tipo: 'empresa' | 'autonomo' | 'profesional'
  razon_social: string
  cif_nif: string
  contacto_nombre: string | null
  telefono: string | null
  email: string | null
  ciudad: string | null
  notas: string | null
  created_at: string
}

const TIPO_LABEL: Record<ClienteB2B['tipo'], string> = {
  empresa: 'Empresa',
  autonomo: 'Autónomo',
  profesional: 'Profesional',
}
const TIPO_BADGE: Record<ClienteB2B['tipo'], string> = {
  empresa: 'bg-blue-100 text-blue-700',
  autonomo: 'bg-amber-100 text-amber-700',
  profesional: 'bg-purple-100 text-purple-700',
}

function ClientesB2BPage() {
  const router = useRouter()
  const [clientes, setClientes] = useState<ClienteB2B[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/clientes-b2b')
      .then((r) => {
        if (!r.ok) throw new Error('Error al cargar clientes B2B')
        return r.json()
      })
      .then(setClientes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = clientes.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.razon_social.toLowerCase().includes(q) ||
      c.cif_nif.toLowerCase().includes(q) ||
      (c.contacto_nombre?.toLowerCase().includes(q) ?? false) ||
      (c.email?.toLowerCase().includes(q) ?? false) ||
      (c.telefono?.includes(q) ?? false)
    )
  })

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-100">
      <main className="w-[80%] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Header */}
        <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 mb-4">
          <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white">Clientes B2B</h1>
                <p className="text-slate-300 text-xs">
                  {clientes.length} cliente(s) profesional(es)
                </p>
              </div>
            </div>
            <Link
              href="/clientes-b2b/crear"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + Nuevo cliente B2B
            </Link>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="bg-white rounded-xl shadow border border-gray-200 p-4 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por razón social, CIF/NIF, contacto, teléfono o email..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Lista */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
            Cargando...
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
            {search
              ? 'Sin resultados para la búsqueda.'
              : 'Aún no hay clientes B2B. Creá el primero.'}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Razón social</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">CIF/NIF</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Contacto</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Teléfono</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Ciudad</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-100 hover:bg-emerald-50/40 cursor-pointer"
                    onClick={() => router.push(`/clientes-b2b/${c.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{c.razon_social}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_BADGE[c.tipo]}`}>
                        {TIPO_LABEL[c.tipo]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">{c.cif_nif}</td>
                    <td className="px-4 py-3 text-gray-700">{c.contacto_nombre || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{c.telefono || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{c.ciudad || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/clientes-b2b/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-200"
                      >
                        Ver / editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

export default function Page() {
  return (
    <ProtectedRoute>
      <ClientesB2BPage />
    </ProtectedRoute>
  )
}
