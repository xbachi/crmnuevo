'use client'

/**
 * Bandeja de validación del libro de facturas recibidas.
 *
 * Es la pantalla donde una persona convierte "PDF archivado" en "apunte fiscal":
 * el extractor propone, el humano confirma. Nada se valida solo y nada se borra.
 *
 * Por defecto se abre en `pendiente-validar,extraida` — lo accionable. Las 188
 * `registrada` (archivadas, sin datos fiscales) no son trabajo de esta pantalla
 * hasta que el extractor pase por ellas, pero están a un clic en la botonera para
 * no esconder que existen.
 *
 * La botonera sale de `resumen.porEstado`, que la API calcula con todos los
 * filtros MENOS el de estado: los contadores son los del embudo actual (año,
 * proveedor, búsqueda), no el total global. Por eso se puede usar para navegar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Pagination from '@/components/Pagination'
import {
  ESTADOS,
  ESTADO_LABEL,
  EstadoBadge,
  Proveedor,
  RegistroItem,
  RegistroListResponse,
  fmtFecha,
  fmtImporte,
  mensajeError,
} from '../_lib/fiscal-ui'
import PanelDetalle from '../_components/PanelDetalle'

const LIMIT = 50
const POR_DEFECTO = ['pendiente-validar', 'extraida']

const INPUT =
  'px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500'

/** Avisos de la fila: lo que hace que una factura merezca una mirada. */
function Avisos({ r }: { r: RegistroItem }) {
  const chips: Array<{ t: string; c: string; title: string }> = []
  if (r.datosIncompletos)
    chips.push({
      t: 'Incompleta',
      c: 'bg-amber-100 text-amber-800',
      title: 'Faltan datos o el desglose no cuadra con el importe',
    })
  if (r.posibleDuplicado)
    chips.push({
      t: r.duplicadoDe ? `Dup. de #${r.duplicadoDe}` : 'Duplicado',
      c: 'bg-orange-100 text-orange-800',
      title: 'Posible duplicado de otra factura ya registrada',
    })
  if (r.tardia)
    chips.push({
      t: 'Tardía',
      c: 'bg-yellow-100 text-yellow-800',
      title: 'Entró después del trimestre que le corresponde',
    })
  if (r.nifValido === false)
    chips.push({
      t: 'NIF inválido',
      c: 'bg-red-100 text-red-800',
      title: 'El NIF del proveedor no supera la validación',
    })
  if (r.lineas === 0)
    chips.push({
      t: 'Sin desglose',
      c: 'bg-gray-100 text-gray-700',
      title: 'Sin líneas de IVA: no se puede validar',
    })

  if (chips.length === 0) return <span className="text-gray-300">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.t}
          title={c.title}
          className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${c.c}`}
        >
          {c.t}
        </span>
      ))}
    </div>
  )
}

export default function ValidacionPage() {
  const [items, setItems] = useState<RegistroItem[]>([])
  const [total, setTotal] = useState(0)
  const [porEstado, setPorEstado] = useState<Record<string, number>>({})
  const [proveedores, setProveedores] = useState<Proveedor[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [estados, setEstados] = useState<string[]>(POR_DEFECTO)
  const [anio, setAnio] = useState('')
  const [trimestre, setTrimestre] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [q, setQ] = useState('')
  const [soloDuplicados, setSoloDuplicados] = useState(false)
  const [offset, setOffset] = useState(0)

  const [selectedId, setSelectedId] = useState<number | null>(null)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (estados.length > 0) p.set('estado', estados.join(','))
    if (anio) p.set('anio', anio)
    if (trimestre) p.set('trimestre', trimestre)
    if (proveedorId) p.set('proveedorId', proveedorId)
    if (q.trim()) p.set('q', q.trim())
    if (soloDuplicados) p.set('duplicados', '1')
    p.set('limit', String(LIMIT))
    p.set('offset', String(offset))
    return p.toString()
  }, [estados, anio, trimestre, proveedorId, q, soloDuplicados, offset])

  const cargar = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/fiscal/registro?${query}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(mensajeError(json, res.status))
      const data = json as RegistroListResponse
      setItems(data.items ?? [])
      setTotal(data.total ?? 0)
      setPorEstado(data.resumen?.porEstado ?? {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el registro')
      setItems([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [query])

  useEffect(() => {
    cargar()
  }, [cargar])

  // El select de proveedor se carga una vez: es una lista corta y estable.
  useEffect(() => {
    let vivo = true
    fetch('/api/fiscal/proveedores')
      .then((r) => (r.ok ? r.json() : { proveedores: [] }))
      .then((d) => {
        if (vivo) setProveedores((d.proveedores ?? []) as Proveedor[])
      })
      .catch(() => {
        /* el filtro por proveedor queda vacío; la bandeja sigue usable */
      })
    return () => {
      vivo = false
    }
  }, [])

  /** Cualquier cambio de filtro vuelve a la página 1: paginar sobre un total que
   *  ya cambió muestra una página vacía sin explicación. */
  function filtrar<T>(set: (v: T) => void) {
    return (v: T) => {
      setOffset(0)
      set(v)
    }
  }

  function toggleEstado(e: string) {
    setOffset(0)
    setEstados((prev) => (prev.length === 1 && prev[0] === e ? prev : [e]))
  }

  const totalEnResumen = Object.values(porEstado).reduce((a, b) => a + b, 0)
  const paginaActual = Math.floor(offset / LIMIT) + 1
  const totalPaginas = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="space-y-4">
      {/* ── Botonera de estados ─────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            setOffset(0)
            setEstados([])
          }}
          className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
            estados.length === 0
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Todas <span className="opacity-75">({totalEnResumen})</span>
        </button>

        <button
          onClick={() => {
            setOffset(0)
            setEstados(POR_DEFECTO)
          }}
          className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
            estados.length === 2 && POR_DEFECTO.every((e) => estados.includes(e))
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Accionables{' '}
          <span className="opacity-75">
            ({POR_DEFECTO.reduce((a, e) => a + (porEstado[e] ?? 0), 0)})
          </span>
        </button>

        <span className="w-px bg-gray-300 mx-1" aria-hidden="true" />

        {ESTADOS.map((e) => (
          <button
            key={e}
            onClick={() => toggleEstado(e)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              estados.length === 1 && estados[0] === e
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {ESTADO_LABEL[e]?.label ?? e} <span className="opacity-75">({porEstado[e] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => filtrar(setQ)(e.target.value)}
          placeholder="Buscar nº, proveedor, matrícula…"
          aria-label="Buscar"
          className={`${INPUT} flex-1 min-w-[200px]`}
        />
        <select
          value={anio}
          onChange={(e) => filtrar(setAnio)(e.target.value)}
          aria-label="Año"
          className={INPUT}
        >
          <option value="">Todos los años</option>
          {[2024, 2025, 2026].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={trimestre}
          onChange={(e) => filtrar(setTrimestre)(e.target.value)}
          aria-label="Trimestre"
          className={INPUT}
        >
          <option value="">Todos los trimestres</option>
          {[1, 2, 3, 4].map((t) => (
            <option key={t} value={t}>{t}T</option>
          ))}
        </select>
        <select
          value={proveedorId}
          onChange={(e) => filtrar(setProveedorId)(e.target.value)}
          aria-label="Proveedor"
          className={INPUT}
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
              {p.facturas != null ? ` (${p.facturas})` : ''}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={soloDuplicados}
            onChange={(e) => filtrar(setSoloDuplicados)(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Solo posibles duplicados
        </label>
      </div>

      {/* ── Tabla ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {error && (
          <div className="bg-red-50 border-b border-red-200 px-3 py-2 flex items-center justify-between gap-2">
            <p className="text-sm text-red-800">{error}</p>
            <button onClick={cargar} className="text-sm font-medium text-red-700 underline">
              Reintentar
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Fecha', 'Proveedor', 'Nº', 'Matrícula', 'Importe', 'Base', 'Cuota', 'Estado', 'Conf.', 'Avisos'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-gray-500">
                    Cargando…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-gray-500">
                    {error ? 'No se pudo cargar el registro.' : 'Nada por aquí con estos filtros.'}
                  </td>
                </tr>
              ) : (
                items.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer ${
                      selectedId === r.id ? 'bg-primary-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                      {fmtFecha(r.fechaFactura)}
                    </td>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900 max-w-[160px] truncate">
                      {r.proveedor ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700 max-w-[120px] truncate">
                      {r.numeroFactura ?? '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 font-mono">
                      {r.matricula ?? '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                      {fmtImporte(r.importe)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600 text-right">
                      {fmtImporte(r.baseTotal)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600 text-right">
                      {fmtImporte(r.cuotaIvaTotal)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <EstadoBadge estado={r.estado} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                      {r.extraccionConfianza == null
                        ? '—'
                        : `${Math.round(r.extraccionConfianza * 100)}%`}
                    </td>
                    <td className="px-3 py-2">
                      <Avisos r={r} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-gray-200 flex-wrap">
          <p className="text-sm text-gray-500">
            {total === 0
              ? 'Sin resultados'
              : `${offset + 1}–${Math.min(offset + LIMIT, total)} de ${total}`}
            {isLoading && items.length > 0 ? ' · actualizando…' : ''}
          </p>
          {totalPaginas > 1 && (
            <Pagination
              currentPage={paginaActual}
              totalPages={totalPaginas}
              onPageChange={(p) => setOffset((p - 1) * LIMIT)}
            />
          )}
        </div>
      </div>

      {selectedId != null && (
        <PanelDetalle
          id={selectedId}
          proveedores={proveedores}
          onClose={() => setSelectedId(null)}
          onSaved={cargar}
        />
      )}
    </div>
  )
}
