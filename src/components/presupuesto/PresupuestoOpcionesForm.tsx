'use client'

import type {
  ModoEntrega,
  ModoPlazo,
  OpcionesPresupuesto,
  TarifaFinanciacion,
} from '@/lib/presupuesto/tipos'

const CLASE_INPUT =
  'w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500'
const CLASE_LABEL = 'block text-xs font-medium text-slate-600 mb-1'

const TARIFA_LABEL: Record<TarifaFinanciacion, string> = {
  NORMAL: 'Normal',
  ESPECIAL: 'Especial',
  SIN_DTO: 'Sin dto',
  CONSULTAR: 'Consúltanos',
}

interface Props {
  opciones: OpcionesPresupuesto
  onChange: (opciones: OpcionesPresupuesto) => void
  tarifaFicha: TarifaFinanciacion | null
  disabled?: boolean
}

function numeroDe(v: string): number | null {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function textoDe(n: number | null | undefined): string {
  return n == null || n === 0 ? '' : String(n)
}

export default function PresupuestoOpcionesForm({
  opciones,
  onChange,
  tarifaFicha,
  disabled = false,
}: Props) {
  const set = (patch: Partial<OpcionesPresupuesto>) =>
    onChange({ ...opciones, ...patch })

  const cocheEntrega = (valor: number | null, modo: ModoEntrega) =>
    set({ cocheEntrega: valor ? { valor, modo } : null })

  const extra = (concepto: string, importe: number | null) =>
    set({
      extra: concepto || importe ? { concepto, importe: importe ?? 0 } : null,
    })

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={opciones.financia}
            onChange={(e) => set({ financia: e.target.checked })}
            className="rounded border-slate-300"
          />
          Financia
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          Plazo
          <select
            value={opciones.modoPlazo}
            disabled={!opciones.financia}
            onChange={(e) => set({ modoPlazo: e.target.value as ModoPlazo })}
            className="px-2 py-1 text-sm border border-slate-300 rounded-md disabled:opacity-50"
          >
            <option value="NORMAL">Normal (60–120 m)</option>
            <option value="CORTO">Corto (24–60 m)</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          Tarifa
          <select
            value={opciones.tarifaOverride ?? ''}
            onChange={(e) =>
              set({
                tarifaOverride: e.target.value
                  ? (e.target.value as TarifaFinanciacion)
                  : null,
              })
            }
            className="px-2 py-1 text-sm border border-slate-300 rounded-md"
          >
            <option value="">
              Ficha ({tarifaFicha ? TARIFA_LABEL[tarifaFicha] : 'sin tarifa'})
            </option>
            {(Object.keys(TARIFA_LABEL) as TarifaFinanciacion[]).map((t) => (
              <option key={t} value={t}>
                {TARIFA_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          Sustitución
          <select
            value={opciones.sustitucion}
            onChange={(e) =>
              set({
                sustitucion: e.target
                  .value as OpcionesPresupuesto['sustitucion'],
              })
            }
            className="px-2 py-1 text-sm border border-slate-300 rounded-md"
          >
            <option value="auto">Auto (por edad)</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label htmlFor="pres-entrada" className={CLASE_LABEL}>
            Entrada (€)
          </label>
          <input
            id="pres-entrada"
            type="number"
            min={0}
            step="1"
            inputMode="decimal"
            value={textoDe(opciones.entrada)}
            onChange={(e) => set({ entrada: numeroDe(e.target.value) })}
            className={CLASE_INPUT}
          />
        </div>
        <div>
          <label htmlFor="pres-prestamo" className={CLASE_LABEL}>
            Préstamo pendiente (€)
          </label>
          <input
            id="pres-prestamo"
            type="number"
            min={0}
            step="1"
            inputMode="decimal"
            value={textoDe(opciones.prestamoPendiente)}
            onChange={(e) =>
              set({ prestamoPendiente: numeroDe(e.target.value) })
            }
            className={CLASE_INPUT}
          />
        </div>
        <div>
          <label htmlFor="pres-entrega" className={CLASE_LABEL}>
            Coche a cambio (€)
          </label>
          <input
            id="pres-entrega"
            type="number"
            min={0}
            step="1"
            inputMode="decimal"
            value={textoDe(opciones.cocheEntrega?.valor)}
            onChange={(e) =>
              cocheEntrega(
                numeroDe(e.target.value),
                opciones.cocheEntrega?.modo ?? 'SEPARADO'
              )
            }
            className={CLASE_INPUT}
          />
        </div>
        <div>
          <label htmlFor="pres-entrega-modo" className={CLASE_LABEL}>
            Entrega
          </label>
          <select
            id="pres-entrega-modo"
            value={opciones.cocheEntrega?.modo ?? 'SEPARADO'}
            disabled={!opciones.cocheEntrega}
            onChange={(e) =>
              cocheEntrega(
                opciones.cocheEntrega?.valor ?? null,
                e.target.value as ModoEntrega
              )
            }
            className={`${CLASE_INPUT} disabled:opacity-50`}
          >
            <option value="SEPARADO">Línea separada</option>
            <option value="JUNTO">Junto al dto. financiación</option>
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="pres-extra-concepto" className={CLASE_LABEL}>
            Extra (concepto)
          </label>
          <input
            id="pres-extra-concepto"
            type="text"
            maxLength={80}
            value={opciones.extra?.concepto ?? ''}
            onChange={(e) =>
              extra(e.target.value, opciones.extra?.importe ?? null)
            }
            className={CLASE_INPUT}
          />
        </div>
        <div>
          <label htmlFor="pres-extra-importe" className={CLASE_LABEL}>
            Extra (€)
          </label>
          <input
            id="pres-extra-importe"
            type="number"
            min={0}
            step="1"
            inputMode="decimal"
            value={textoDe(opciones.extra?.importe)}
            onChange={(e) =>
              extra(opciones.extra?.concepto ?? '', numeroDe(e.target.value))
            }
            className={CLASE_INPUT}
          />
        </div>
      </div>
    </fieldset>
  )
}
