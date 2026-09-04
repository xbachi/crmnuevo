'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useSimpleToast } from '@/hooks/useSimpleToast'

interface Vehiculo {
  id: number
  referencia: string
  marca: string
  modelo: string
  matricula: string
  bastidor: string
  kms: number
  estado: string
  año?: number
  fechaMatriculacion?: string
}
interface ClienteB2B {
  id: number
  razon_social: string
  cif_nif: string
}

const FORMA_PAGO_OPTS = [
  { v: 'transferencia', l: 'Transferencia bancaria' },
  { v: 'efectivo', l: 'Efectivo' },
  { v: 'financiado', l: 'Financiación' },
  { v: 'otro', l: 'Otro' },
] as const

function NuevaVentaB2BPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { showToast, ToastContainer } = useSimpleToast()

  const [cliente, setCliente] = useState<ClienteB2B | null>(null)
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [searchVeh, setSearchVeh] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const [vehMode, setVehMode] = useState<'select' | 'manual'>('select')
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    vehiculo_id: null as number | null,
    vehiculo_marca: '',
    vehiculo_modelo: '',
    vehiculo_matricula: '',
    vehiculo_bastidor: '',
    vehiculo_kms: '',
    vehiculo_anio: '',
    vehiculo_fecha_matriculacion: '',
    fecha_venta: new Date().toISOString().slice(0, 10),
    lugar_venta: 'Alaquàs',
    precio_venta: '',
    forma_pago: 'transferencia' as 'transferencia' | 'efectivo' | 'financiado' | 'otro',
    notas: '',
    notas_estado_vehiculo: '',
  })

  useEffect(() => {
    fetch(`/api/clientes-b2b/${id}`).then((r) => r.json()).then(setCliente)
    fetch('/api/vehiculos')
      .then((r) => r.json())
      .then((data) => {
        // /api/vehiculos puede devolver array o {vehiculos: [...]}
        const list = Array.isArray(data) ? data : data.vehiculos ?? []
        setVehiculos(list)
      })
      .catch(() => showToast('No se pudieron cargar vehículos', 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const filteredVeh = useMemo(() => {
    if (!searchVeh) return vehiculos.slice(0, 20)
    const q = searchVeh.toLowerCase()
    return vehiculos
      .filter(
        (v) =>
          v.marca?.toLowerCase().includes(q) ||
          v.modelo?.toLowerCase().includes(q) ||
          v.referencia?.toLowerCase().includes(q) ||
          v.matricula?.toLowerCase().includes(q) ||
          v.bastidor?.toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [vehiculos, searchVeh])

  const pickVehiculo = (v: Vehiculo) => {
    setForm((p) => ({
      ...p,
      vehiculo_id: v.id,
      vehiculo_marca: v.marca ?? '',
      vehiculo_modelo: v.modelo ?? '',
      vehiculo_matricula: v.matricula ?? '',
      vehiculo_bastidor: v.bastidor ?? '',
      vehiculo_kms: v.kms != null ? String(v.kms) : '',
      vehiculo_anio: v.año != null ? String(v.año) : '',
      vehiculo_fecha_matriculacion: v.fechaMatriculacion ?? '',
    }))
    setSearchVeh(`${v.marca} ${v.modelo} (${v.matricula})`)
    setShowSuggest(false)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.vehiculo_marca || !form.vehiculo_modelo || !form.vehiculo_matricula) {
      showToast('Datos del vehículo incompletos', 'error')
      return
    }
    const precio = parseFloat(form.precio_venta)
    if (!Number.isFinite(precio) || precio <= 0) {
      showToast('Precio inválido', 'error')
      return
    }
    setSubmitting(true)
    try {
      // 1) Crear la venta B2B (con snapshot vehículo)
      const res = await fetch(`/api/clientes-b2b/${id}/ventas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          precio_venta: precio,
        }),
      })
      const venta = await res.json()
      if (!res.ok) {
        showToast(venta?.error ?? 'Error creando venta', 'error')
        return
      }

      // 2) Generar PDF del contrato
      const pdfRes = await fetch(`/api/ventas-b2b/${venta.id}/contrato`, {
        method: 'POST',
      })
      if (!pdfRes.ok) {
        const e = await pdfRes.json().catch(() => ({}))
        showToast(
          `Venta creada (${venta.numero}) pero falló el PDF: ${e.error ?? 'error'}`,
          'warning'
        )
      } else {
        showToast(`Venta ${venta.numero} creada y contrato generado`, 'success')
      }
      router.push(`/clientes-b2b/${id}`)
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
          <div>
            <Link href={`/clientes-b2b/${id}`} className="text-emerald-300 text-xs hover:underline">
              ← Volver al cliente
            </Link>
            <h1 className="text-xl font-bold text-white mt-1">Nueva venta B2B</h1>
            {cliente && (
              <p className="text-slate-300 text-xs">
                Cliente: <span className="font-semibold">{cliente.razon_social}</span> ({cliente.cif_nif})
              </p>
            )}
          </div>
        </div>

        <form onSubmit={onSubmit} className="bg-white rounded-xl shadow border border-gray-200 p-6 space-y-5">
          {/* Vehículo */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Vehículo</label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setVehMode('select')}
                  className={`px-3 py-1 text-xs rounded ${vehMode === 'select' ? 'bg-emerald-100 text-emerald-800 font-medium' : 'bg-gray-100 text-gray-600'}`}
                >
                  Existente
                </button>
                <button
                  type="button"
                  onClick={() => setVehMode('manual')}
                  className={`px-3 py-1 text-xs rounded ${vehMode === 'manual' ? 'bg-emerald-100 text-emerald-800 font-medium' : 'bg-gray-100 text-gray-600'}`}
                >
                  + Crear nuevo (manual)
                </button>
              </div>
            </div>

            {vehMode === 'select' && (
              <div className="relative">
                <input
                  type="text"
                  value={searchVeh}
                  onChange={(e) => {
                    setSearchVeh(e.target.value)
                    setShowSuggest(true)
                  }}
                  onFocus={() => setShowSuggest(true)}
                  placeholder="Buscar por marca/modelo/matrícula/bastidor..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                {showSuggest && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {filteredVeh.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-gray-500">Sin resultados</div>
                    ) : (
                      filteredVeh.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => pickVehiculo(v)}
                          className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium text-gray-900">
                            {v.marca} {v.modelo}
                          </div>
                          <div className="text-xs text-gray-500">
                            {v.referencia} · {v.matricula} · {v.kms?.toLocaleString('es-ES')} km · {v.estado}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Campos del vehículo (siempre editables si modo manual; readonly-look si select) */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['vehiculo_marca', 'Marca *'],
                ['vehiculo_modelo', 'Modelo *'],
                ['vehiculo_matricula', 'Matrícula *'],
                ['vehiculo_bastidor', 'Bastidor (VIN)'],
                ['vehiculo_kms', 'Kilómetros'],
                ['vehiculo_anio', 'Año'],
                ['vehiculo_fecha_matriculacion', 'Fecha matriculación (DD/MM/AAAA)'],
              ].map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input
                    value={(form as any)[k]}
                    onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Datos de venta */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha venta *</label>
              <input
                type="date"
                value={form.fecha_venta}
                onChange={(e) => setForm((p) => ({ ...p, fecha_venta: e.target.value }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Lugar venta</label>
              <input
                value={form.lugar_venta}
                onChange={(e) => setForm((p) => ({ ...p, lugar_venta: e.target.value }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Forma de pago *</label>
              <select
                value={form.forma_pago}
                onChange={(e) => setForm((p) => ({ ...p, forma_pago: e.target.value as any }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                {FORMA_PAGO_OPTS.map((o) => (
                  <option key={o.v} value={o.v}>{o.l}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Precio de venta (€) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.precio_venta}
              onChange={(e) => setForm((p) => ({ ...p, precio_venta: e.target.value }))}
              className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas (comerciales)</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notas sobre estado del vehículo (opcional, queda en el contrato si quieres referenciarlo)
            </label>
            <textarea
              value={form.notas_estado_vehiculo}
              onChange={(e) => setForm((p) => ({ ...p, notas_estado_vehiculo: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href={`/clientes-b2b/${id}`}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Generando...' : 'Generar contrato B2B en el estado'}
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
      <NuevaVentaB2BPage />
    </ProtectedRoute>
  )
}
