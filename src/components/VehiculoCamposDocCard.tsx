'use client'

/**
 * Bloque «Datos del permiso» de la ficha del vehículo.
 *
 * Dos cosas en una tarjeta porque son la misma conversación:
 *  · lo que el CRM sacó del permiso de circulación y nadie ha confirmado
 *    todavía — con su valor, la confianza con que se leyó y de qué archivo
 *    salió, para poder abrirlo y comprobarlo;
 *  · lo que le falta al coche para poder publicarse (lo mismo que contesta el
 *    409 del cambio de estado), para verlo ANTES de intentar publicarlo.
 *
 * Un campo confirmado desaparece de la lista y deja de bloquear la publicación.
 */

import { useCallback, useEffect, useState } from 'react'

interface Pendiente {
  campo: string
  etiqueta: string
  valor: string | null
  confianza: number | null
  archivo: string | null
  aplicado_at: string | null
}

interface Faltante {
  campo: string
  etiqueta: string
  motivo: string
}

export interface VehiculoCamposDocCardProps {
  vehiculoId: number
  showToast: (msg: string, tipo: 'success' | 'error' | 'info') => void
  /** Se llama tras confirmar, por si la página quiere recargar el vehículo. */
  onConfirmado?: () => Promise<unknown> | void
}

function porcentaje(c: number | null): string {
  if (c == null || !Number.isFinite(c)) return 'sin dato'
  return `${Math.round(c * 100)}%`
}

/** Confianza baja = merece una mirada más atenta antes de darla por buena. */
function claseConfianza(c: number | null): string {
  if (c == null) return 'bg-slate-100 text-slate-600'
  if (c >= 0.9) return 'bg-green-100 text-green-800'
  if (c >= 0.8) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

export default function VehiculoCamposDocCard({
  vehiculoId,
  showToast,
  onConfirmado,
}: VehiculoCamposDocCardProps) {
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null)
  const [faltantes, setFaltantes] = useState<Faltante[]>([])
  const [guardando, setGuardando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/vehiculos/${vehiculoId}/campos-doc`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = (await res.json()) as {
        pendientes: Pendiente[]
        faltantes: Faltante[]
      }
      setPendientes(d.pendientes ?? [])
      setFaltantes(d.faltantes ?? [])
    } catch (err) {
      console.error('campos-doc:', err)
      setPendientes([])
      setFaltantes([])
    }
  }, [vehiculoId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const confirmar = async (campos: string[]) => {
    if (campos.length === 0) return
    setGuardando(campos.length === 1 ? campos[0] : 'todos')
    try {
      const res = await fetch(
        `/api/vehiculos/${vehiculoId}/campos-doc/confirmar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campos }),
        }
      )
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`)
      showToast(
        campos.length === 1
          ? 'Dato confirmado'
          : `${campos.length} datos confirmados`,
        'success'
      )
      await cargar()
      await onConfirmado?.()
    } catch (err) {
      console.error('confirmar campos-doc:', err)
      showToast(
        err instanceof Error ? err.message : 'No se pudo confirmar',
        'error'
      )
    } finally {
      setGuardando(null)
    }
  }

  // Nada que contar: ni datos del permiso sin confirmar ni nada que falte.
  if (pendientes === null) return null
  if (pendientes.length === 0 && faltantes.length === 0) return null

  // Lo que ya está en la lista de pendientes no se repite en «falta para
  // publicar»: sería el mismo campo dicho dos veces en la misma tarjeta.
  const nombresPendientes = new Set(pendientes.map((p) => p.campo))
  const otrosFaltantes = faltantes.filter(
    (f) => !nombresPendientes.has(f.campo)
  )

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-base font-semibold text-slate-800">
          Datos del permiso
        </h3>
        {pendientes.length > 1 && (
          <button
            type="button"
            onClick={() => confirmar(pendientes.map((p) => p.campo))}
            disabled={guardando !== null}
            className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {guardando === 'todos' ? 'Confirmando…' : 'Confirmar todos'}
          </button>
        )}
      </div>

      {pendientes.length > 0 && (
        <>
          <p className="text-sm text-slate-600 mb-3">
            El CRM los leyó del permiso de circulación porque el coche no los
            tenía. Confírmalos para poder publicarlo.
          </p>
          <ul className="divide-y divide-slate-100">
            {pendientes.map((p) => (
              <li
                key={p.campo}
                className="py-2 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">{p.etiqueta}:</span>{' '}
                    <span className="font-mono">{p.valor ?? '—'}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span
                      className={`px-1.5 py-0.5 rounded ${claseConfianza(p.confianza)}`}
                    >
                      confianza {porcentaje(p.confianza)}
                    </span>
                    {p.archivo && (
                      <span className="truncate" title={p.archivo}>
                        {p.archivo}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => confirmar([p.campo])}
                  disabled={guardando !== null}
                  className="shrink-0 px-3 py-1 text-sm rounded-md border border-green-600 text-green-700 hover:bg-green-50 disabled:opacity-50"
                >
                  {guardando === p.campo ? '…' : 'Confirmar'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {otrosFaltantes.length > 0 && (
        <div
          className={`rounded-md bg-amber-50 border border-amber-200 p-3 ${pendientes.length > 0 ? 'mt-4' : ''}`}
        >
          <p className="text-sm font-medium text-amber-900">
            Falta para poder publicar
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-800">
            {otrosFaltantes.map((f) => (
              <li key={f.campo}>{f.motivo}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
