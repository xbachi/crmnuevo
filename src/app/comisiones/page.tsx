'use client'

/**
 * /comisiones — comisiones de la vendedora por mes.
 *
 * Visible para admin y asesor. Cada fila muestra el ratio financiado y el
 * tramo aplicado para que la comisión sea auditable de un vistazo. Al pie:
 * subtotal de ventas + bono del mes (escalón alcanzado) + TOTAL. El panel de
 * configuración es SOLO admin (PATCH /api/comisiones/config).
 */

import { useState, useEffect, useCallback } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import type {
  ComisionConfig,
  EscalonBono,
  FormaPago,
  TramoComision,
} from '@/lib/comisiones'

interface VentaComision {
  invoiceId: number
  dealId: number | null
  numeroFactura: string
  fecha: string
  importe: number
  precioVenta: number
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
    tramo: TramoComision
    ratioFinanciado: number
    pctAplicado: number | null
    total: number
    motivo: string
  } | null
  sinDatos: boolean
}

interface Totales {
  ventasContadas: number
  sinDatos: number
  subtotalVentas: number
  escalonBono: number | null
  importeBono: number
  siguienteEscalon: EscalonBono | null
  faltanParaSiguiente: number | null
  total: number
}

interface ApiResponse {
  year: number
  month: number
  config: ComisionConfig
  configDisponible: boolean
  condicionesDisponibles: boolean
  ventas: VentaComision[]
  totales: Totales
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

const TRAMO_BADGE: Record<TramoComision, string> = {
  contado: 'bg-green-100 text-green-700',
  financiadoBajo: 'bg-blue-100 text-blue-700',
  financiadoAlto: 'bg-purple-100 text-purple-700',
}

const TRAMO_LABEL: Record<TramoComision, string> = {
  contado: 'Contado',
  financiadoBajo: 'Financiado <70%',
  financiadoAlto: 'Financiado ≥70%',
}

const eur = (n: number) =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
const pct = (n: number) =>
  `${(n * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`

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
                    ? `${totales.ventasContadas} coches vendidos en ${MESES[month - 1]} ${year}` +
                      (totales.sinDatos > 0
                        ? ` · ${totales.sinDatos} sin datos de pago`
                        : '')
                    : 'Ventas del mes, comisión por operación y bono mensual'}
                </p>
              </div>
              {totales && (
                <div className="text-right">
                  <p className="text-slate-300 text-xs">Total del mes</p>
                  <p className="text-2xl font-bold text-white">
                    {eur(totales.total)}
                  </p>
                  <p className="text-slate-300 text-xs">
                    {eur(totales.subtotalVentas)} en ventas +{' '}
                    {eur(totales.importeBono)} de bono
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Avisos */}
          {data && !data.configDisponible && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 text-sm text-yellow-800 font-medium">
              La configuración de comisiones no se pudo leer de la base (falta
              aplicar create-comision-config.sql o la fila está corrupta): se
              está calculando con la tabla por defecto.
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
                        'Precio',
                        'Financiado',
                        '% financiado',
                        'G. premium',
                        'Tramo aplicado',
                        'Comisión',
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ventas.map((v) => (
                      <tr key={v.invoiceId} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-gray-900">
                          {v.vehiculo || '—'}
                        </td>
                        <td className="px-3 py-3 text-gray-600 font-mono text-xs">
                          {v.matricula || '—'}
                        </td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                          {v.numeroFactura}
                        </td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                          {v.fecha}
                        </td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                          {eur(v.precioVenta)}
                        </td>
                        <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                          {v.condiciones?.montoFinanciado
                            ? eur(v.condiciones.montoFinanciado)
                            : '—'}
                        </td>
                        <td className="px-3 py-3 font-medium text-gray-800">
                          {v.comision ? pct(v.comision.ratioFinanciado) : '—'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {v.condiciones
                            ? v.condiciones.garantiaPremium
                              ? '✓'
                              : '✗'
                            : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {v.comision ? (
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap ${TRAMO_BADGE[v.comision.tramo]}`}
                              title={v.comision.motivo}
                            >
                              {TRAMO_LABEL[v.comision.tramo]}
                              {v.comision.pctAplicado != null &&
                                ` · ${v.comision.pctAplicado.toLocaleString('es-ES')}%`}
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500 whitespace-nowrap">
                              sin datos de pago
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">
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
                    <tfoot className="bg-gray-50 text-gray-800">
                      <tr className="border-t-2 border-gray-200">
                        <td
                          colSpan={9}
                          className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Subtotal comisiones ({totales.ventasContadas} ventas
                          {totales.sinDatos > 0
                            ? `, ${totales.sinDatos} sin datos`
                            : ''}
                          )
                        </td>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">
                          {eur(totales.subtotalVentas)}
                        </td>
                      </tr>
                      <tr>
                        <td
                          colSpan={9}
                          className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Bono mensual{' '}
                          {totales.escalonBono != null
                            ? `(escalón de ${totales.escalonBono} ventas)`
                            : '(sin escalón alcanzado)'}
                          {totales.faltanParaSiguiente != null &&
                            totales.siguienteEscalon != null && (
                              <span className="normal-case font-normal text-gray-400">
                                {' '}
                                — faltan {totales.faltanParaSiguiente} ventas
                                para {eur(totales.siguienteEscalon.importe)}
                              </span>
                            )}
                        </td>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">
                          {eur(totales.importeBono)}
                        </td>
                      </tr>
                      <tr className="border-t border-gray-300">
                        <td
                          colSpan={9}
                          className="px-3 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-600"
                        >
                          Total del mes
                        </td>
                        <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">
                          {eur(totales.total)}
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

const numInput =
  'w-28 px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent'

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

  const parse = (value: string) => {
    const n = parseFloat(value)
    return Number.isFinite(n) ? n : 0
  }

  const setBono = (i: number, campo: keyof EscalonBono, value: string) => {
    setDraft((d) => ({
      ...d,
      bonos: d.bonos.map((b, idx) =>
        idx === i ? { ...b, [campo]: parse(value) } : b
      ),
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Configuración de comisiones
        </h2>
        <p className="text-sm text-gray-500">
          El tramo lo decide el % financiado (importe financiado ÷ precio del
          coche), no la etiqueta de forma de pago. Solo visible para admin.
        </p>
      </div>

      {!disponible ? (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
          Falta aplicar la migración create-comision-config.sql para poder
          guardar la configuración.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">
              Umbral de financiación (fracción, 0,70 = 70%):
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={draft.umbralFinanciado}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  umbralFinanciado: parse(e.target.value),
                }))
              }
              className={numInput}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-2 pr-4">Tramo</th>
                  <th className="py-2 pr-4">Standard</th>
                  <th className="py-2 pr-4">Premium</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100">
                  <td className="py-2 pr-4 font-medium text-gray-800">
                    Contado (0% financiado) — € fijos
                  </td>
                  {(['standard', 'premium'] as const).map((g) => (
                    <td key={g} className="py-2 pr-4">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.contado[g]}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            contado: { ...d.contado, [g]: parse(e.target.value) },
                          }))
                        }
                        className={numInput}
                      />
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="py-2 pr-4 font-medium text-gray-800">
                    Financiado por debajo del umbral — € fijos
                  </td>
                  {(['standard', 'premium'] as const).map((g) => (
                    <td key={g} className="py-2 pr-4">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.financiadoBajo[g]}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            financiadoBajo: {
                              ...d.financiadoBajo,
                              [g]: parse(e.target.value),
                            },
                          }))
                        }
                        className={numInput}
                      />
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="py-2 pr-4 font-medium text-gray-800">
                    Financiado desde el umbral — % del importe financiado
                    <span className="block text-xs font-normal text-gray-500">
                      número humano: 0,4 = 0,4% · 1 = 1%
                    </span>
                  </td>
                  {(['pctStandard', 'pctPremium'] as const).map((k) => (
                    <td key={k} className="py-2 pr-4">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={draft.financiadoAlto[k]}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              financiadoAlto: {
                                ...d.financiadoAlto,
                                [k]: parse(e.target.value),
                              },
                            }))
                          }
                          className={numInput}
                        />
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">
              Bono mensual por coches vendidos
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              No acumulativo: se paga solo el escalón alcanzado (9 ventas →
              escalón de 8).
            </p>
            <div className="flex flex-wrap gap-4">
              {draft.bonos.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2"
                >
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={b.minVentas}
                    onChange={(e) => setBono(i, 'minVentas', e.target.value)}
                    className="w-16 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-500">ventas →</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={b.importe}
                    onChange={(e) => setBono(i, 'importe', e.target.value)}
                    className="w-20 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-500">€</span>
                  <button
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        bonos: d.bonos.filter((_, idx) => idx !== i),
                      }))
                    }
                    className="text-xs text-red-500 hover:text-red-700 font-bold ml-1"
                    title="Quitar escalón"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    bonos: [
                      ...d.bonos,
                      {
                        minVentas:
                          (d.bonos[d.bonos.length - 1]?.minVentas ?? 0) + 2,
                        importe: 0,
                      },
                    ],
                  }))
                }
                className="px-3 py-2 rounded-lg border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
              >
                + Escalón
              </button>
            </div>
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
