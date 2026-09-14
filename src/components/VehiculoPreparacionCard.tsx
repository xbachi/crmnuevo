'use client'

import { useState } from 'react'
import { PASOS_VEHICULO, type PasoVehiculo } from '@/lib/vehiculoPasosConst'

/** Los 6 pasos que viven como columnas de "Vehiculo" (sin fecha). */
const PASOS_COLUMNA = [
  ['carpeta', 'Carpeta'],
  ['master', 'Master'],
  ['hojasA', 'Hojas A'],
  ['documentacion', 'Docu'],
  ['itv', 'ITV'],
  ['seguro', 'Seguro'],
] as const
type CampoColumna = (typeof PASOS_COLUMNA)[number][0]

const LABEL_PASO: Record<PasoVehiculo, string> = {
  REVI_INIC: 'Revisión inicial',
  MECAUTO: 'Mecauto',
  REVI_PINTURA: 'Revisión pintura',
  PINTURA: 'Pintura',
  LIMPIEZA: 'Limpieza',
  FOTOS: 'Fotos',
  PUBLICADO: 'Publicado',
}

const CAMPOS_COMPRA = [
  ['proveedor', 'Proveedor'],
  ['abonado', 'Abonado'],
  ['comprobante', 'Comprobante'],
  ['porteSolicitado', 'Porte solicitado'],
  ['recibidoTexto', 'Recibido'],
] as const
type CampoCompra = (typeof CAMPOS_COMPRA)[number][0]

export interface PasoVehiculoUI {
  paso: PasoVehiculo
  texto: string | null
  fecha: string | null
}

export interface VehiculoPreparacionProps {
  vehiculoId: number
  vehiculo: Partial<Record<CampoColumna | CampoCompra, string | null>> & {
    recibidoFecha?: string | null
    pasos?: PasoVehiculoUI[]
  }
  onSaved: () => Promise<unknown> | void
  showToast: (msg: string, tipo: 'success' | 'error' | 'info') => void
}

type Draft = {
  compra: Record<CampoCompra, string>
  recibidoFecha: string
  columnas: Record<CampoColumna, string>
  pasos: Record<PasoVehiculo, { texto: string; fecha: string }>
}

function draftDe(v: VehiculoPreparacionProps['vehiculo']): Draft {
  const compra = {} as Draft['compra']
  for (const [k] of CAMPOS_COMPRA) compra[k] = v[k] ?? ''
  const columnas = {} as Draft['columnas']
  for (const [k] of PASOS_COLUMNA) columnas[k] = v[k] ?? ''
  const pasos = {} as Draft['pasos']
  for (const p of PASOS_VEHICULO) {
    const fila = v.pasos?.find((x) => x.paso === p)
    pasos[p] = { texto: fila?.texto ?? '', fecha: fila?.fecha ?? '' }
  }
  return { compra, recibidoFecha: v.recibidoFecha ?? '', columnas, pasos }
}

const fmt = (ymd: string | null | undefined) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return d && m && y ? `${d}/${m}/${y}` : ymd
}

const inputCls =
  'w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900'

export default function VehiculoPreparacionCard({
  vehiculoId,
  vehiculo,
  onSaved,
  showToast,
}: VehiculoPreparacionProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => draftDe(vehiculo))

  const start = () => {
    setDraft(draftDe(vehiculo))
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        ...draft.compra,
        ...draft.columnas,
        recibidoFecha: draft.recibidoFecha || null,
        pasos: PASOS_VEHICULO.map((p) => ({
          paso: p,
          texto: draft.pasos[p].texto || null,
          fecha: draft.pasos[p].fecha || null,
        })),
      }
      const res = await fetch(`/api/vehiculos/${vehiculoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        showToast(j.error || 'Error al guardar', 'error')
        return
      }
      showToast('Preparación guardada', 'success')
      setEditing(false)
      await onSaved()
    } catch {
      showToast('Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const pasoDe = (p: PasoVehiculo) => vehiculo.pasos?.find((x) => x.paso === p)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900">
          Compra y preparación
        </h2>
        {!editing ? (
          <button
            onClick={start}
            className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
          >
            Editar
          </button>
        ) : (
          <div className="flex space-x-2">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        )}
      </div>

      <h3 className="text-xs sm:text-sm font-semibold text-orange-900 mb-2">
        Compra
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {CAMPOS_COMPRA.map(([k, label]) => (
          <div key={k}>
            <span className="block text-xs text-gray-500">{label}</span>
            {editing ? (
              <input
                type="text"
                aria-label={label}
                value={draft.compra[k]}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    compra: { ...d.compra, [k]: e.target.value },
                  }))
                }
                className={inputCls}
              />
            ) : (
              <span className="text-sm text-gray-900">
                {vehiculo[k] || '—'}
              </span>
            )}
          </div>
        ))}
        <div>
          <span className="block text-xs text-gray-500">Fecha recepción</span>
          {editing ? (
            <input
              type="date"
              aria-label="Fecha recepción"
              value={draft.recibidoFecha}
              onChange={(e) =>
                setDraft((d) => ({ ...d, recibidoFecha: e.target.value }))
              }
              className={inputCls}
            />
          ) : (
            <span className="text-sm text-gray-900">
              {fmt(vehiculo.recibidoFecha) || '—'}
            </span>
          )}
        </div>
      </div>

      <h3 className="text-xs sm:text-sm font-semibold text-orange-900 mb-2">
        Preparación
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-1 pr-2 font-medium">Paso</th>
              <th className="py-1 pr-2 font-medium">Texto</th>
              <th className="py-1 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {PASOS_COLUMNA.map(([k, label]) => (
              <tr key={k} className="border-t border-gray-100">
                <td className="py-1 pr-2 text-gray-700">{label}</td>
                <td className="py-1 pr-2">
                  {editing ? (
                    <input
                      type="text"
                      aria-label={label}
                      value={draft.columnas[k]}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          columnas: { ...d.columnas, [k]: e.target.value },
                        }))
                      }
                      className={inputCls}
                    />
                  ) : (
                    <span className="text-gray-900">{vehiculo[k] || '—'}</span>
                  )}
                </td>
                <td className="py-1 text-gray-400">—</td>
              </tr>
            ))}
            {PASOS_VEHICULO.map((p) => (
              <tr key={p} className="border-t border-gray-100">
                <td className="py-1 pr-2 text-gray-700">{LABEL_PASO[p]}</td>
                <td className="py-1 pr-2">
                  {editing ? (
                    <input
                      type="text"
                      aria-label={`${LABEL_PASO[p]} texto`}
                      value={draft.pasos[p].texto}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          pasos: {
                            ...d.pasos,
                            [p]: { ...d.pasos[p], texto: e.target.value },
                          },
                        }))
                      }
                      className={inputCls}
                    />
                  ) : (
                    <span className="text-gray-900">
                      {pasoDe(p)?.texto || '—'}
                    </span>
                  )}
                </td>
                <td className="py-1">
                  {editing ? (
                    <input
                      type="date"
                      aria-label={`${LABEL_PASO[p]} fecha`}
                      value={draft.pasos[p].fecha}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          pasos: {
                            ...d.pasos,
                            [p]: { ...d.pasos[p], fecha: e.target.value },
                          },
                        }))
                      }
                      className={inputCls}
                    />
                  ) : (
                    <span className="text-gray-900">
                      {fmt(pasoDe(p)?.fecha) || '—'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
