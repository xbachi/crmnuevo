'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FichaComercial } from '@/lib/fichaComercial'

/** Campos editables en el orden del bloque; precio_contado = precioPublicacion. */
const CAMPOS = [
  'regimen',
  'nombre_comercial',
  'precio_contado',
  'tarifa_financiacion',
  'garantia',
  'gp',
  'pct_dto',
  'meses_garantia_fabrica',
  'motor_cv',
  'cubicaje',
  'caja',
  'combustible',
  'url_imagen',
  'url_qr',
  'mantenimientos',
] as const
type Campo = (typeof CAMPOS)[number]
type Draft = Record<Campo, string>

const LABEL: Record<Campo, string> = {
  regimen: 'Régimen',
  nombre_comercial: 'Nombre comercial',
  precio_contado: 'Precio contado (€)',
  tarifa_financiacion: 'Tarifa financiación',
  garantia: 'Garantía',
  gp: 'GP',
  pct_dto: '% Dto (0–0,2)',
  meses_garantia_fabrica: 'Meses garantía fábrica',
  motor_cv: 'Motor (CV)',
  cubicaje: 'Cubicaje',
  caja: 'Caja',
  combustible: 'Combustible',
  url_imagen: 'URL imagen',
  url_qr: 'URL QR',
  mantenimientos: 'Mantenimientos',
}

const CLASE_INPUT =
  'w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500'

function aTexto(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'SI' : 'NO'
  return String(v)
}

function draftDe(f: FichaComercial | null): Draft {
  const d = {} as Draft
  for (const k of CAMPOS) d[k] = aTexto(f?.[k])
  return d
}

export interface VehiculoFichaComercialProps {
  vehiculoId: number
  showToast: (msg: string, tipo: 'success' | 'error' | 'info') => void
  onSaved?: () => Promise<unknown> | void
}

export default function VehiculoFichaComercialCard({
  vehiculoId,
  showToast,
  onSaved,
}: VehiculoFichaComercialProps) {
  const [base, setBase] = useState<Draft | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/vehiculos/${vehiculoId}/ficha-comercial`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = draftDe((await res.json()) as FichaComercial)
      setBase(d)
      setDraft(d)
    } catch (err) {
      console.error('ficha comercial:', err)
      const d = draftDe(null)
      setBase(d)
      setDraft(d)
    }
  }, [vehiculoId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const set = (k: Campo, v: string) =>
    setDraft((prev) => (prev ? { ...prev, [k]: v } : prev))

  const cambios =
    draft && base ? CAMPOS.filter((k) => draft[k] !== base[k]) : []

  const guardar = async () => {
    if (!draft || !cambios.length) return
    setGuardando(true)
    try {
      const body: Record<string, string> = {}
      for (const k of cambios) body[k] = draft[k]
      const res = await fetch(`/api/vehiculos/${vehiculoId}/ficha-comercial`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detalle = Array.isArray(json?.errores)
          ? `: ${json.errores.join('; ')}`
          : ''
        showToast(`${json?.error ?? 'Error al guardar'}${detalle}`, 'error')
        return
      }
      const d = draftDe(json as FichaComercial)
      setBase(d)
      setDraft(d)
      showToast('Ficha comercial guardada', 'success')
      await onSaved?.()
    } catch (err) {
      console.error('guardar ficha comercial:', err)
      showToast('Error al guardar la ficha comercial', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const campo = (k: Campo, input: React.ReactNode) => (
    <div key={k}>
      <label
        htmlFor={`ficha-${k}`}
        className="block text-xs font-medium text-slate-600 mb-1"
      >
        {LABEL[k]}
      </label>
      {input}
    </div>
  )
  const select = (k: Campo, opciones: [string, string][]) =>
    campo(
      k,
      <select
        id={`ficha-${k}`}
        value={draft?.[k] ?? ''}
        onChange={(e) => set(k, e.target.value)}
        className={CLASE_INPUT}
      >
        <option value="">—</option>
        {opciones.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    )
  const texto = (
    k: Campo,
    props: React.InputHTMLAttributes<HTMLInputElement> = {}
  ) =>
    campo(
      k,
      <input
        id={`ficha-${k}`}
        type="text"
        value={draft?.[k] ?? ''}
        onChange={(e) => set(k, e.target.value)}
        className={CLASE_INPUT}
        {...props}
      />
    )
  const numero = (k: Campo, step = '1') =>
    texto(k, { type: 'number', min: 0, step, inputMode: 'decimal' })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900">
          Ficha comercial (web y presupuesto)
        </h2>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || !draft || cambios.length === 0}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {!draft ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {select('regimen', [
              ['IVA21', 'IVA 21'],
              ['REBU', 'REBU'],
            ])}
            <div className="sm:col-span-2">{texto('nombre_comercial')}</div>
            {numero('precio_contado', '0.01')}
            {select('tarifa_financiacion', [
              ['NORMAL', 'Normal'],
              ['ESPECIAL', 'Especial'],
              ['SIN_DTO', 'Sin dto'],
              ['CONSULTAR', 'Consúltanos'],
            ])}
            {select('garantia', [
              ['SI', 'SI'],
              ['NO', 'NO'],
            ])}
            {numero('gp', '1')}
            {numero('pct_dto', '0.01')}
            {numero('meses_garantia_fabrica')}
            {numero('motor_cv')}
            {numero('cubicaje')}
            {select('caja', [
              ['Manual', 'Manual'],
              ['Automático', 'Automático'],
            ])}
            {texto('combustible')}
            {texto('url_imagen', { type: 'url' })}
            {texto('url_qr', { type: 'url' })}
          </div>
          {campo(
            'mantenimientos',
            <textarea
              id="ficha-mantenimientos"
              value={draft.mantenimientos}
              onChange={(e) => set('mantenimientos', e.target.value)}
              rows={4}
              className={CLASE_INPUT}
            />
          )}
        </div>
      )}
    </div>
  )
}
