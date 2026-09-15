'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useToast } from '@/components/Toast'
import type { TarifaRow } from '@/lib/presupuesto/repo'
import {
  PARAMETROS_DEFECTO,
  PLAZOS,
  type ParametrosPresupuesto,
} from '@/lib/presupuesto/tipos'

type Clave = keyof ParametrosPresupuesto
type Draft = Record<Clave, string>

interface ParametroApi {
  clave: string
  valor: unknown
  descripcion: string | null
  updated_at: string
}

interface TarifaDraft {
  id?: number
  nombre: string
  entidad: string
  tin: string
  vigente_desde: string
  vigente_hasta: string
  coeficientes: Record<string, string>
  activa: boolean
}

const CLAVES = Object.keys(PARAMETROS_DEFECTO) as Clave[]
const NUMERICOS: ReadonlySet<string> = new Set([
  'gestion',
  'tope_dto_base',
  'pct_normal',
  'pct_especial',
  'extension_umbral',
  'extension_precio_bajo',
  'extension_precio_alto',
  'validez_dias',
  'plazo_max_meses',
  'plazo_corto_max',
  'sustitucion_edad_max_meses',
  'extension_min_meses',
  'ratio_aviso',
])

const CLASE_INPUT =
  'w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500'
const CLASE_CARD =
  'bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6'
const CLASE_BTN_PRIMARIO =
  'px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'

function aTexto(clave: Clave, valor: unknown): string {
  if (clave === 'gp_bandas') return JSON.stringify(valor)
  if (valor == null) return ''
  return String(valor)
}

function draftDe(params: ParametroApi[]): Draft {
  const porClave = new Map(params.map((p) => [p.clave, p.valor]))
  const d = {} as Draft
  for (const k of CLAVES) {
    d[k] = aTexto(k, porClave.has(k) ? porClave.get(k) : PARAMETROS_DEFECTO[k])
  }
  return d
}

function errorJson(texto: string): string | null {
  try {
    JSON.parse(texto)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'JSON inválido'
  }
}

function valorDe(clave: Clave, texto: string): unknown {
  if (NUMERICOS.has(clave)) return Number(texto.replace(',', '.'))
  if (clave === 'gp_bandas') return JSON.parse(texto)
  if (clave === 'tarifa_sin_premium_id') return texto ? Number(texto) : null
  return texto.trim()
}

const TARIFA_VACIA: TarifaDraft = {
  nombre: '',
  entidad: '',
  tin: '',
  vigente_desde: '',
  vigente_hasta: '',
  coeficientes: {},
  activa: false,
}

function tarifaDraftDe(t: TarifaRow): TarifaDraft {
  const coeficientes: Record<string, string> = {}
  for (const [k, v] of Object.entries(t.coeficientes ?? {})) {
    coeficientes[k] = String(v)
  }
  return {
    id: t.id,
    nombre: t.nombre,
    entidad: t.entidad ?? '',
    tin: t.tin == null ? '' : String(t.tin),
    vigente_desde: t.vigente_desde ?? '',
    vigente_hasta: t.vigente_hasta ?? '',
    coeficientes,
    activa: t.activa,
  }
}

async function leerError(res: Response, porDefecto: string): Promise<string> {
  const json = await res.json().catch(() => ({}))
  const detalle = Array.isArray(json?.errores)
    ? `: ${json.errores.join('; ')}`
    : ''
  return `${json?.error ?? porDefecto}${detalle}`
}

export default function PresupuestosParametrosPage() {
  const { showToast } = useToast()
  const [parametros, setParametros] = useState<ParametroApi[]>([])
  const [tarifas, setTarifas] = useState<TarifaRow[]>([])
  const [base, setBase] = useState<Draft | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [tarifa, setTarifa] = useState<TarifaDraft | null>(null)
  const [guardandoTarifa, setGuardandoTarifa] = useState(false)

  const aplicar = useCallback(
    (json: { parametros: ParametroApi[]; tarifas: TarifaRow[] }) => {
      setParametros(json.parametros ?? [])
      setTarifas(json.tarifas ?? [])
      const d = draftDe(json.parametros ?? [])
      setBase(d)
      setDraft(d)
    },
    []
  )

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/presupuestos/parametros')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelado) aplicar(json)
      } catch (err) {
        if (cancelado) return
        console.error('parametros presupuesto:', err)
        showToast('Error al cargar los parámetros', 'error')
      }
    })()
    return () => {
      cancelado = true
    }
  }, [aplicar, showToast])

  const set = (k: Clave, v: string) =>
    setDraft((prev) => (prev ? { ...prev, [k]: v } : prev))

  const cambios =
    draft && base ? CLAVES.filter((k) => draft[k] !== base[k]) : []
  const errorGpBandas = draft ? errorJson(draft.gp_bandas) : null

  const guardarParametros = async () => {
    if (!draft || !cambios.length || errorGpBandas) return
    const vacios = cambios.filter(
      (k) => NUMERICOS.has(k) && draft[k].trim() === ''
    )
    if (vacios.length) {
      showToast(`Campos numéricos vacíos: ${vacios.join(', ')}`, 'error')
      return
    }
    const patch: Record<string, unknown> = {}
    try {
      for (const k of cambios) patch[k] = valorDe(k, draft[k])
    } catch {
      showToast('gp_bandas: JSON inválido', 'error')
      return
    }
    setGuardando(true)
    try {
      const res = await fetch('/api/admin/presupuestos/parametros', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parametros: patch }),
      })
      if (!res.ok) {
        showToast(await leerError(res, 'Error al guardar'), 'error')
        return
      }
      aplicar(await res.json())
      showToast('Parámetros guardados', 'success')
    } catch (err) {
      console.error('guardar parametros:', err)
      showToast('Error al guardar los parámetros', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const guardarTarifa = async () => {
    if (!tarifa) return
    const coeficientes: Record<string, number> = {}
    for (const [k, v] of Object.entries(tarifa.coeficientes)) {
      if (v.trim() !== '') coeficientes[k] = Number(v.replace(',', '.'))
    }
    setGuardandoTarifa(true)
    try {
      const res = await fetch('/api/admin/presupuestos/parametros', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarifa: {
            id: tarifa.id,
            nombre: tarifa.nombre.trim(),
            entidad: tarifa.entidad.trim() || null,
            tin: tarifa.tin.trim()
              ? Number(tarifa.tin.replace(',', '.'))
              : null,
            vigente_desde: tarifa.vigente_desde || null,
            vigente_hasta: tarifa.vigente_hasta || null,
            coeficientes,
            activa: tarifa.activa,
          },
        }),
      })
      if (!res.ok) {
        showToast(await leerError(res, 'Error al guardar la tarifa'), 'error')
        return
      }
      aplicar(await res.json())
      setTarifa(null)
      showToast('Tarifa guardada', 'success')
    } catch (err) {
      console.error('guardar tarifa:', err)
      showToast('Error al guardar la tarifa', 'error')
    } finally {
      setGuardandoTarifa(false)
    }
  }

  const descripcionDe = (k: Clave) =>
    parametros.find((p) => p.clave === k)?.descripcion ?? ''

  const campoParametro = (k: Clave) => {
    if (!draft) return null
    if (k === 'gp_bandas') {
      return (
        <>
          <textarea
            id={`param-${k}`}
            value={draft[k]}
            onChange={(e) => set(k, e.target.value)}
            rows={2}
            aria-invalid={errorGpBandas ? true : undefined}
            aria-describedby={errorGpBandas ? `param-${k}-error` : undefined}
            className={`${CLASE_INPUT} font-mono text-xs${errorGpBandas ? ' border-red-400' : ''}`}
          />
          {errorGpBandas ? (
            <p id={`param-${k}-error`} className="mt-1 text-xs text-red-600">
              JSON inválido: {errorGpBandas}
            </p>
          ) : null}
        </>
      )
    }
    if (k === 'tarifa_sin_premium_id') {
      return (
        <select
          id={`param-${k}`}
          value={draft[k]}
          onChange={(e) => set(k, e.target.value)}
          className={CLASE_INPUT}
        >
          <option value="">Misma que la activa</option>
          {tarifas.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.nombre}
              {t.activa ? ' (activa)' : ''}
            </option>
          ))}
        </select>
      )
    }
    const numerico = NUMERICOS.has(k)
    return (
      <input
        id={`param-${k}`}
        type={
          numerico ? 'number' : k === 'reserva_url_defecto' ? 'url' : 'text'
        }
        step={numerico ? 'any' : undefined}
        min={numerico ? 0 : undefined}
        value={draft[k]}
        onChange={(e) => set(k, e.target.value)}
        className={CLASE_INPUT}
      />
    )
  }

  const setT = (patch: Partial<TarifaDraft>) =>
    setTarifa((prev) => (prev ? { ...prev, ...patch } : prev))

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Parámetros de presupuestos
            </h1>
            <Link
              href="/presupuestos"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              ← Presupuestos
            </Link>
          </div>

          <section className={CLASE_CARD}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                Parámetros del motor
              </h2>
              <button
                type="button"
                onClick={guardarParametros}
                disabled={guardando || cambios.length === 0 || !!errorGpBandas}
                className={CLASE_BTN_PRIMARIO}
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            {!draft ? (
              <p className="text-sm text-slate-500">Cargando…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CLAVES.map((k) => (
                  <div
                    key={k}
                    className={
                      k === 'gp_bandas' || k === 'reserva_url_defecto'
                        ? 'sm:col-span-2'
                        : ''
                    }
                  >
                    <label
                      htmlFor={`param-${k}`}
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      <span className="font-mono">{k}</span>
                      {descripcionDe(k) ? (
                        <span className="block font-normal text-slate-500">
                          {descripcionDe(k)}
                        </span>
                      ) : null}
                    </label>
                    {campoParametro(k)}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={CLASE_CARD}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                Tarifas de financiación
              </h2>
              <button
                type="button"
                onClick={() => setTarifa({ ...TARIFA_VACIA, coeficientes: {} })}
                className={CLASE_BTN_PRIMARIO}
              >
                Nueva tarifa
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3">Nombre</th>
                    <th className="py-2 pr-3">Entidad</th>
                    <th className="py-2 pr-3">TIN</th>
                    <th className="py-2 pr-3">Vigencia</th>
                    <th className="py-2 pr-3">Plazos</th>
                    <th className="py-2 pr-3">Activa</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tarifas.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2 pr-3 font-medium">{t.nombre}</td>
                      <td className="py-2 pr-3">{t.entidad ?? '—'}</td>
                      <td className="py-2 pr-3">{t.tin ?? '—'}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {t.vigente_desde ?? '—'} → {t.vigente_hasta ?? '…'}
                      </td>
                      <td className="py-2 pr-3">
                        {Object.keys(t.coeficientes ?? {}).length}
                      </td>
                      <td className="py-2 pr-3">
                        {t.activa ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            Activa
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setTarifa(tarifaDraftDe(t))}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {tarifa ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  {tarifa.id ? `Editar tarifa #${tarifa.id}` : 'Nueva tarifa'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="lg:col-span-2">
                    <label
                      htmlFor="tarifa-nombre"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Nombre *
                    </label>
                    <input
                      id="tarifa-nombre"
                      type="text"
                      maxLength={80}
                      value={tarifa.nombre}
                      onChange={(e) => setT({ nombre: e.target.value })}
                      className={CLASE_INPUT}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="tarifa-entidad"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Entidad
                    </label>
                    <input
                      id="tarifa-entidad"
                      type="text"
                      value={tarifa.entidad}
                      onChange={(e) => setT({ entidad: e.target.value })}
                      className={CLASE_INPUT}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="tarifa-tin"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      TIN (%)
                    </label>
                    <input
                      id="tarifa-tin"
                      type="number"
                      step="0.01"
                      min={0}
                      value={tarifa.tin}
                      onChange={(e) => setT({ tin: e.target.value })}
                      className={CLASE_INPUT}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="tarifa-desde"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Vigente desde
                    </label>
                    <input
                      id="tarifa-desde"
                      type="date"
                      value={tarifa.vigente_desde}
                      onChange={(e) => setT({ vigente_desde: e.target.value })}
                      className={CLASE_INPUT}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="tarifa-hasta"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Vigente hasta
                    </label>
                    <input
                      id="tarifa-hasta"
                      type="date"
                      value={tarifa.vigente_hasta}
                      onChange={(e) => setT({ vigente_hasta: e.target.value })}
                      className={CLASE_INPUT}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1">
                    Coeficientes por plazo (cuota = importe × coeficiente)
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
                    {PLAZOS.map((p) => (
                      <div key={p}>
                        <label
                          htmlFor={`coef-${p}`}
                          className="block text-[11px] text-slate-500 mb-0.5"
                        >
                          {p} m
                        </label>
                        <input
                          id={`coef-${p}`}
                          type="number"
                          step="0.000001"
                          min={0}
                          max={1}
                          value={tarifa.coeficientes[String(p)] ?? ''}
                          onChange={(e) =>
                            setT({
                              coeficientes: {
                                ...tarifa.coeficientes,
                                [String(p)]: e.target.value,
                              },
                            })
                          }
                          className={`${CLASE_INPUT} px-1`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={tarifa.activa}
                      onChange={(e) => setT({ activa: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    Tarifa activa (columna premium; desactiva las demás)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTarifa(null)}
                      className="px-3 py-1.5 text-sm font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={guardarTarifa}
                      disabled={guardandoTarifa || !tarifa.nombre.trim()}
                      className={CLASE_BTN_PRIMARIO}
                    >
                      {guardandoTarifa ? 'Guardando…' : 'Guardar tarifa'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </ProtectedRoute>
  )
}
