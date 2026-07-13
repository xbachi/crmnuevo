'use client'

/**
 * /comisiones — comisiones de la vendedora por mes.
 *
 * Visible para admin y asesor. Tabla de ventas del mes (facturas emitidas)
 * con condiciones de pago y comisión por fila + total. El panel de
 * configuración de la tabla de comisiones es SOLO admin
 * (PATCH /api/comisiones/config). Config toda en 0 → banner amarillo.
 */

import { useState, useEffect, useCallback } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  FORMAS_PAGO,
  type ComisionConfig,
  type FormaPago,
} from '@/lib/comisiones'

interface VentaComision {
  invoiceId: number
  dealId: number | null
  numeroFactura: string
  fecha: string
  importe: number
  matricula: string | null
  vehiculo: string | null
  condiciones: {
    formaPago: FormaPago
    banco: string | null
    interes: number | null
    cuotas: number | null
    montoFinanciado: number | null
    montoContado: number | null
    garantiaPremium: boolean
  } | null
  comision: {
    base: number
    extraFinanciacion: number
    total: number
    pendienteConfig: boolean
  } | null
  sinDatos: boolean
}

interface ApiResponse {
  year: number
  month: number
  config: ComisionConfig
  configDisponible: boolean
  pendienteConfig: boolean
  condicionesDisponibles: boolean
  ventas: VentaComision[]
  totales: {
    ventas: number
    sinDatos: number
    base: number
    extraFinanciacion: number
    comision: number
  }
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const FORMA_PAGO_BADGE: Record<FormaPago, string> = {
  contado: 'bg-green-100 text-green-700',
  financiado: 'bg-blue-100 text-blue-700',
  mixto: 'bg-purple-100 text-purple-700',
}

const FORMA_PAGO_LABEL: Record<FormaPago, string> = {
  contado: 'Contado',
  financiado: 'Financiado',
  mixto: 'Mixto',
}

const eur = (n: number) =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

export default function ComisionesPage() {
  const { isAdmin } = useAuth()
  const { showToast, ToastContainer } = useToast()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchComisiones = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/comisiones?year=${year}&month=${month}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Error al cargar comisiones')
      setData(body as ApiResponse)
    } catch (err) {
      console.error(err)
      showToast(
        err instanceof Error ? err.message : 'Error al cargar las comisiones',
        'error'
      )
    } finally {
      setIsLoading(false)
    }
  }, [year, month, showToast])

  useEffect(() => {
    fetchComisiones()
  }, [fetchComisiones])

  const ventas = data?.ventas ?? []
  const totales = data?.totales

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <ToastContainer />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl shadow-lg p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white">
                  Comisiones
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm">
                  {totales
                    ? `${totales.ventas} ventas en ${MESES[month - 1]} ${year}` +
                      (totales.sinDatos > 0
                        ? ` · ${totales.sinDatos} sin datos de pago`
                        : '')
                    : 'Ventas del mes y comisión por operación'}
                </p>
              </div>
              {totales && (
                <div className="text-right">
                  <p className="text-slate-300 text-xs">Comisión del mes</p>
                  <p className="text-2xl font-bold text-white">
                    {eur(totales.comision)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Aviso config pendiente */}
          {data?.pendienteConfig && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 text-sm text-yellow-800 font-medium">
              Tabla de comisiones pendiente de configurar — las comisiones se
              muestran en 0.
              {!data.configDisponible &&
                ' (Falta aplicar la migración create-comision-config.sql.)'}
            </div>
          )}
          {data && !data.condicionesDisponibles && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 text-sm text-yellow-800 font-medium">
              La tabla de condiciones de pago no existe todavía (aplicar
              create-venta-condiciones-pago.sql): todas las ventas aparecen sin
              datos de pago.
            </div>
          )}

          {/* Selector de período */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">Mes:</span>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500"
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">Año:</span>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500"
              >
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabla de ventas */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                Cargando…
              </div>
            ) : ventas.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                Sin ventas facturadas en {MESES[month - 1]} {year}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {[
                        'Coche',
                        'Matrícula',
                        'Nº factura',
                        'Fecha',
                        'Forma de pago',
                        'G. premium',
                        'Financiado',
                        'Comisión',
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ventas.map((v) => (
                      <tr key={v.invoiceId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900">
                          {v.vehiculo || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                          {v.matricula || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {v.numeroFactura}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{v.fecha}</td>
                        <td className="px-4 py-3">
                          {v.condiciones ? (
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-bold ${FORMA_PAGO_BADGE[v.condiciones.formaPago]}`}
                              title={
                                v.condiciones.banco
                                  ? `${v.condiciones.banco} · ${v.condiciones.cuotas} cuotas · TIN ${v.condiciones.interes}%`
                                  : undefined
                              }
                            >
                              {FORMA_PAGO_LABEL[v.condiciones.formaPago]}
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                              sin datos de pago
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {v.condiciones
                            ? v.condiciones.garantiaPremium
                              ? '✓'
                              : '✗'
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {v.condiciones?.montoFinanciado != null
                            ? eur(v.condiciones.montoFinanciado)
                            : '—'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {v.comision ? (
                            eur(v.comision.total)
                          ) : (
                            <span
                              className="text-gray-400 font-normal"
                              title="Venta sin condiciones de pago registradas — comisión no calculable"
                            >
                              no calculable
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totales && (
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider"
                        >
                          Total del mes ({totales.ventas} ventas
                          {totales.sinDatos > 0
                            ? `, ${totales.sinDatos} sin datos`
                            : ''}
                          )
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900">
                          {eur(totales.comision)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* Panel de configuración — SOLO admin */}
          {isAdmin && data && (
            <ConfigPanel
              config={data.config}
              disponible={data.configDisponible}
              onSaved={fetchComisiones}
              showToast={showToast}
            />
          )}
        </main>
      </div>
    </ProtectedRoute>
  )
}

function ConfigPanel({
  config,
  disponible,
  onSaved,
  showToast,
}: {
  config: ComisionConfig
  disponible: boolean
  onSaved: () => void
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
}) {
  const [draft, setDraft] = useState<ComisionConfig>(config)
  const [saving, setSaving] = useState(false)

  // Re-sincronizar el borrador cuando llega config nueva del server.
  useEffect(() => {
    setDraft(config)
  }, [config])

  const setBase = (
    forma: FormaPago,
    campo: 'conGarantiaPremium' | 'sinGarantiaPremium',
    value: string
  ) => {
    const n = parseFloat(value)
    setDraft((d) => ({
      ...d,
      base: {
        ...d.base,
        [forma]: { ...d.base[forma], [campo]: Number.isFinite(n) ? n : 0 },
      },
    }))
  }

  const guardar = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/comisiones/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: draft }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Error al guardar')
      showToast('Configuración de comisiones guardada', 'success')
      onSaved()
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Error al guardar la configuración',
        'error'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Configuración de comisiones
          </h2>
          <p className="text-sm text-gray-500">
            Comisión base por forma de pago × garantía premium, más un % del
            monto financiado. Solo visible para admin.
          </p>
        </div>
      </div>

      {!disponible ? (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
          Falta aplicar la migración create-comision-config.sql para poder
          guardar la configuración.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-2 pr-4">Forma de pago</th>
                  <th className="py-2 pr-4">Con garantía premium (€)</th>
                  <th className="py-2 pr-4">Sin garantía premium (€)</th>
                </tr>
              </thead>
              <tbody>
                {FORMAS_PAGO.map((forma) => (
                  <tr key={forma} className="border-t border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-800 capitalize">
                      {forma}
                    </td>
                    {(
                      ['conGarantiaPremium', 'sinGarantiaPremium'] as const
                    ).map((campo) => (
                      <td key={campo} className="py-2 pr-4">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.base[forma][campo]}
                          onChange={(e) => setBase(forma, campo, e.target.value)}
                          className="w-32 px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">
              % del monto financiado (financiado/mixto):
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.pctMontoFinanciado}
              onChange={(e) => {
                const n = parseFloat(e.target.value)
                setDraft((d) => ({
                  ...d,
                  pctMontoFinanciado: Number.isFinite(n) ? n : 0,
                }))
              }}
              className="w-28 px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-sm text-gray-500">%</span>
          </div>

          <div className="flex justify-end">
            <button
              onClick={guardar}
              disabled={saving}
              className={`px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-all ${
                saving
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
