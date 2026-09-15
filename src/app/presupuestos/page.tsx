'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PaginadorLista from '@/components/PaginadorLista'
import ProtectedRoute from '@/components/ProtectedRoute'
import EstadoPresupuestoBadge, {
  ESTADO_PRESUPUESTO_LABEL,
} from '@/components/presupuesto/EstadoPresupuestoBadge'
import { useAuth } from '@/contexts/AuthContext'
import { LIMIT_POR_DEFECTO, type Pagination } from '@/lib/listPagination'
import { formatearEuros, formatearFecha } from '@/lib/plantillasMensajes'
import type { ResumenPresupuesto } from '@/lib/presupuesto/repo'
import {
  ESTADOS_PRESUPUESTO,
  type EstadoPresupuesto,
} from '@/lib/presupuesto/tipos'

type Fila = ResumenPresupuesto & { urlPublica: string }

const CLASE_INPUT =
  'px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500'

export default function PresupuestosPage() {
  const { isAdmin } = useAuth()
  const [estado, setEstado] = useState<EstadoPresupuesto | ''>('')
  const [vencidos, setVencidos] = useState(false)
  const [q, setQ] = useState('')
  const [qAplicada, setQAplicada] = useState('')
  const [page, setPage] = useState(1)
  const [filas, setFilas] = useState<Fila[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const sp = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT_POR_DEFECTO),
      })
      if (estado) sp.set('estado', estado)
      if (vencidos) sp.set('vencidos', 'true')
      if (qAplicada) sp.set('q', qAplicada)
      const res = await fetch(`/api/presupuestos?${sp.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as {
        presupuestos: Fila[]
        pagination: Pagination
      }
      setFilas(json.presupuestos ?? [])
      setPagination(json.pagination ?? null)
    } catch (err) {
      console.error('presupuestos lista:', err)
      setError('Error al cargar los presupuestos')
    } finally {
      setCargando(false)
    }
  }, [page, estado, vencidos, qAplicada])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const buscar = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setQAplicada(q.trim())
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Presupuestos
            </h1>
            {isAdmin ? (
              <Link
                href="/admin/presupuestos-parametros"
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Parámetros y tarifas
              </Link>
            ) : null}
          </div>

          <form
            onSubmit={buscar}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 mb-4 flex flex-wrap items-center gap-3"
          >
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nº, cliente, matrícula o vehículo…"
              className={`${CLASE_INPUT} flex-1 min-w-[200px]`}
            />
            <select
              value={estado}
              onChange={(e) => {
                setPage(1)
                setEstado(e.target.value as EstadoPresupuesto | '')
              }}
              className={CLASE_INPUT}
            >
              <option value="">Todos los estados</option>
              {ESTADOS_PRESUPUESTO.map((s) => (
                <option key={s} value={s}>
                  {ESTADO_PRESUPUESTO_LABEL[s]}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={vencidos}
                onChange={(e) => {
                  setPage(1)
                  setVencidos(e.target.checked)
                }}
                className="rounded border-slate-300"
              />
              Sólo vencidos
            </label>
            <button
              type="submit"
              className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Buscar
            </button>
          </form>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
            {error ? (
              <p className="p-4 text-sm text-red-600">{error}</p>
            ) : cargando && filas.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Cargando…</p>
            ) : filas.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Sin presupuestos.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="px-3 py-2">Nº</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Vehículo</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Total premium</th>
                    <th className="px-3 py-2">Válido hasta</th>
                    <th className="px-3 py-2">Enlaces</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filas.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        {f.numero}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatearFecha(f.created_at)}
                      </td>
                      <td className="px-3 py-2">{f.nombre_cliente}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/vehiculos/${f.vehiculo_id}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {f.marca} {f.modelo}
                        </Link>
                        <span className="block text-xs text-slate-500">
                          {f.matricula}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <EstadoPresupuestoBadge
                          estado={f.estado}
                          validoHasta={f.valido_hasta}
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {formatearEuros(f.total_premium)}
                        {f.desde_premium != null ? (
                          <span className="block text-xs text-slate-500">
                            desde {f.desde_premium} €/mes
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatearFecha(f.valido_hasta)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <a
                          href={f.urlPublica}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Público
                        </a>
                        {f.pdf_url ? (
                          <>
                            <span className="text-slate-300"> · </span>
                            <a
                              href={`/api/presupuestos/${f.id}/pdf`}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              PDF
                            </a>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <PaginadorLista
            pagination={pagination}
            onCambiarPagina={setPage}
            etiqueta="presupuestos"
            disabled={cargando}
          />
        </div>
      </div>
    </ProtectedRoute>
  )
}
