'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useSimpleToast } from '@/hooks/useSimpleToast'

function CrearClienteB2BPage() {
  const router = useRouter()
  const { showToast, ToastContainer } = useSimpleToast()
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    tipo: 'empresa' as 'empresa' | 'autonomo' | 'profesional',
    razon_social: '',
    cif_nif: '',
    contacto_nombre: '',
    telefono: '',
    email: '',
    direccion: '',
    ciudad: '',
    codigo_postal: '',
    provincia: '',
    notas: '',
  })

  const handle = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.razon_social.trim() || !form.cif_nif.trim()) {
      showToast('Razón social y CIF/NIF son obligatorios', 'error')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/clientes-b2b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data?.error ?? 'Error al crear cliente B2B', 'error')
        return
      }
      showToast('Cliente B2B creado', 'success')
      router.push(`/clientes-b2b/${data.id}`)
    } catch (err) {
      console.error(err)
      showToast('Error de red', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-100">
      <ToastContainer />
      <main className="w-[80%] max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-slate-800 rounded-xl shadow-xl p-4 mb-4 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-bold text-white">Nuevo cliente B2B</h1>
          <Link href="/clientes-b2b" className="text-emerald-300 text-sm hover:underline">
            ← Volver al listado
          </Link>
        </div>

        <form onSubmit={onSubmit} className="bg-white rounded-xl shadow border border-gray-200 p-6 space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de cliente *</label>
            <div className="flex gap-2">
              {(['empresa', 'autonomo', 'profesional'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, tipo: t }))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition ${
                    form.tipo === t
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {t === 'empresa' ? 'Empresa' : t === 'autonomo' ? 'Autónomo' : 'Profesional'}
                </button>
              ))}
            </div>
          </div>

          {/* Razón social + CIF */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {form.tipo === 'empresa' ? 'Razón social *' : 'Nombre completo *'}
              </label>
              <input
                value={form.razon_social}
                onChange={handle('razon_social')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {form.tipo === 'empresa' ? 'CIF *' : 'NIF/DNI *'}
              </label>
              <input
                value={form.cif_nif}
                onChange={handle('cif_nif')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none uppercase"
                required
              />
            </div>
          </div>

          {/* Contacto */}
          {form.tipo === 'empresa' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Persona de contacto</label>
              <input
                value={form.contacto_nombre}
                onChange={handle('contacto_nombre')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          )}

          {/* Tel + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                type="tel"
                value={form.telefono}
                onChange={handle('telefono')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={handle('email')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Dirección */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <input
              value={form.direccion}
              onChange={handle('direccion')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
              <input
                value={form.ciudad}
                onChange={handle('ciudad')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cód. postal</label>
              <input
                value={form.codigo_postal}
                onChange={handle('codigo_postal')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
              <input
                value={form.provincia}
                onChange={handle('provincia')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              value={form.notas}
              onChange={handle('notas')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href="/clientes-b2b"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Creando...' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

export default function Page() {
  return (
    <ProtectedRoute>
      <CrearClienteB2BPage />
    </ProtectedRoute>
  )
}
