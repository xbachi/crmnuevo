'use client'

/**
 * Ficha fiscal de los proveedores.
 *
 * Es el cuello de botella del trimestre: sin NIF no hay libro de facturas
 * recibidas presentable, y las facturas que cayeron en el cajón `otro` no están
 * imputadas a nadie. Por eso los dos avisos de arriba no son decorativos: son la
 * lista de trabajo pendiente, y se muestran hasta que el número llega a cero.
 *
 * Fusionar no borra: mueve las facturas al destino, absorbe los alias y desactiva
 * el origen. La confirmación dice el número exacto de facturas que se mueven
 * porque es una operación que nadie va a poder deshacer con un clic.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { TIPOS_OPERACION, DEDUCIBLES } from '@/lib/facturaFiscal'
import { CATEGORIAS } from '@/lib/facturasRegistro'
import { ApiError, NifBadge, Proveedor, mensajeError } from '../_lib/fiscal-ui'

const INPUT =
  'w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500'
const LABEL = 'block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1'

interface FichaForm {
  nombre: string
  nif: string
  pais: string
  iban: string
  aliases: string[]
  categoriaDefecto: string
  tipoOperacionDefecto: string
  deducibleDefecto: string
  subcategoriaDefecto: string
  validacionAuto: boolean
  activo: boolean
}

function aForm(p: Proveedor | null): FichaForm {
  return {
    nombre: p?.nombre ?? '',
    nif: p?.nif ?? '',
    pais: p?.pais ?? 'ES',
    iban: p?.iban ?? '',
    aliases: p?.aliases ?? [],
    categoriaDefecto: p?.categoriaDefecto ?? '',
    tipoOperacionDefecto: p?.tipoOperacionDefecto ?? '',
    deducibleDefecto: p?.deducibleDefecto ?? '',
    subcategoriaDefecto: p?.subcategoriaDefecto ?? '',
    validacionAuto: p?.validacionAuto ?? false,
    activo: p?.activo ?? true,
  }
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/fiscal/proveedores')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(mensajeError(json as ApiError, res.status))
      setProveedores((json.proveedores ?? []) as Proveedor[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los proveedores')
      setProveedores([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const activos = useMemo(() => proveedores.filter((p) => p.activo), [proveedores])
  const sinNif = useMemo(() => activos.filter((p) => p.sinNif ?? !p.nif), [activos])
  const otro = useMemo(
    () => proveedores.find((p) => p.nombre?.toLowerCase() === 'otro'),
    [proveedores]
  )

  const abierto = creando || editando != null

  return (
    <div className="space-y-4">
      {/* ── Trabajo pendiente ───────────────────────────────────── */}
      {!isLoading && sinNif.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm font-medium text-red-900">
            {sinNif.length} de {activos.length} proveedores no tienen NIF.
          </p>
          <p className="text-sm text-red-800 mt-1">
            Sin NIF no se puede presentar el libro de facturas recibidas. Faltan:{' '}
            {sinNif.map((p) => p.nombre).join(', ')}.
          </p>
        </div>
      )}

      {!isLoading && otro && (otro.facturas ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm font-medium text-amber-900">
            {otro.facturas} facturas están sin identificar (proveedor &quot;otro&quot;).
          </p>
          <p className="text-sm text-amber-800 mt-1">
            El clasificador no supo de quién eran. Hay que darles proveedor una a una desde la
            bandeja de validación (filtrando por proveedor &quot;otro&quot;), o crear el proveedor
            que falte y fusionar.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {isLoading ? 'Cargando…' : `${proveedores.length} proveedores`}
        </p>
        <button
          onClick={() => setCreando(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
        >
          Nuevo proveedor
        </button>
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
                {['Nombre', 'NIF', 'Facturas', 'Categoría', 'Deducible', 'Validación auto.', 'Activo'].map(
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
              {isLoading && proveedores.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">
                    Cargando…
                  </td>
                </tr>
              ) : proveedores.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">
                    {error ? 'No se pudieron cargar los proveedores.' : 'Todavía no hay proveedores.'}
                  </td>
                </tr>
              ) : (
                proveedores.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setEditando(p)}
                    className={`cursor-pointer hover:bg-gray-50 ${p.activo ? '' : 'opacity-60'}`}
                  >
                    <td className="px-3 py-2 text-sm font-medium text-gray-900">
                      {p.nombre}
                      {p.aliases.length > 0 && (
                        <span className="block text-xs text-gray-500 truncate max-w-[220px]">
                          {p.aliases.join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <NifBadge nif={p.nif} valido={p.nifValido} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">
                      {p.facturas ?? 0}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                      {p.categoriaDefecto ?? '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                      {p.deducibleDefecto ?? '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      {p.validacionAuto ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Sí
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      {p.activo ? (
                        <span className="text-green-700 text-xs font-medium">Activo</span>
                      ) : (
                        <span className="text-gray-500 text-xs">Inactivo</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {abierto && (
        <FichaModal
          proveedor={editando}
          proveedores={proveedores}
          onClose={() => {
            setEditando(null)
            setCreando(false)
          }}
          onSaved={cargar}
        />
      )}
    </div>
  )
}

// ── Ficha ────────────────────────────────────────────────────────────────────

function FichaModal({
  proveedor,
  proveedores,
  onClose,
  onSaved,
}: {
  proveedor: Proveedor | null
  proveedores: Proveedor[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FichaForm>(() => aForm(proveedor))
  const [aliasNuevo, setAliasNuevo] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [ok, setOk] = useState<string | null>(null)

  const [origenId, setOrigenId] = useState('')
  const [confirmarMerge, setConfirmarMerge] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [])

  function setCampo<K extends keyof FichaForm>(k: K, v: FichaForm[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function addAlias() {
    const a = aliasNuevo.trim()
    if (!a || form.aliases.includes(a)) return
    setCampo('aliases', [...form.aliases, a])
    setAliasNuevo('')
  }

  async function guardar() {
    setIsSaving(true)
    setAviso(null)
    setErrores([])
    setOk(null)
    const nul = (v: string) => (v.trim() === '' ? null : v.trim())
    try {
      const body = {
        nombre: form.nombre.trim(),
        nif: nul(form.nif),
        pais: nul(form.pais),
        iban: nul(form.iban),
        aliases: form.aliases,
        categoriaDefecto: nul(form.categoriaDefecto),
        tipoOperacionDefecto: nul(form.tipoOperacionDefecto),
        deducibleDefecto: nul(form.deducibleDefecto),
        subcategoriaDefecto: nul(form.subcategoriaDefecto),
        validacionAuto: form.validacionAuto,
        activo: form.activo,
      }
      const res = await fetch(
        proveedor ? `/api/fiscal/proveedores/${proveedor.id}` : '/api/fiscal/proveedores',
        {
          method: proveedor ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const json = (await res.json().catch(() => ({}))) as ApiError

      if (res.ok) {
        // NIF inválido → 200 con aviso: se guarda igual y se avisa. Bloquear acá
        // dejaría al usuario sin poder registrar un NIF extranjero raro pero real.
        setAviso(json.aviso ?? null)
        setOk(json.aviso ? 'Guardado, con aviso.' : 'Proveedor guardado.')
        onSaved()
        if (!json.aviso) onClose()
        return
      }

      setErrores(json.errores ?? [])
      setAviso(mensajeError(json, res.status))
    } catch {
      setAviso('No se pudo guardar: fallo de red.')
    } finally {
      setIsSaving(false)
    }
  }

  async function fusionar() {
    if (!proveedor || !origenId) return
    setIsSaving(true)
    setAviso(null)
    setOk(null)
    try {
      const res = await fetch(`/api/fiscal/proveedores/${proveedor.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origenId: Number(origenId) }),
      })
      const json = (await res.json().catch(() => ({}))) as ApiError & {
        mensaje?: string
        facturasMovidas?: number
      }
      if (!res.ok) {
        setAviso(mensajeError(json, res.status))
        return
      }
      setOk(json.mensaje ?? 'Proveedores fusionados.')
      setConfirmarMerge(false)
      setOrigenId('')
      onSaved()
    } catch {
      setAviso('No se pudo fusionar: fallo de red.')
    } finally {
      setIsSaving(false)
    }
  }

  const origen = proveedores.find((p) => String(p.id) === origenId)
  const candidatos = proveedores.filter((p) => p.id !== proveedor?.id && p.activo)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ficha-titulo"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 id="ficha-titulo" className="text-base font-semibold text-gray-900">
            {proveedor ? `Proveedor: ${proveedor.nombre}` : 'Nuevo proveedor'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="p-nombre" className={LABEL}>Nombre</label>
              <input
                id="p-nombre"
                className={INPUT}
                value={form.nombre}
                onChange={(e) => setCampo('nombre', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="p-nif" className={LABEL}>NIF</label>
              <input
                id="p-nif"
                className={`${INPUT} font-mono`}
                value={form.nif}
                onChange={(e) => setCampo('nif', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="p-pais" className={LABEL}>País</label>
              <input
                id="p-pais"
                className={INPUT}
                value={form.pais}
                onChange={(e) => setCampo('pais', e.target.value)}
                placeholder="ES"
              />
            </div>
            <div>
              <label htmlFor="p-iban" className={LABEL}>IBAN</label>
              <input
                id="p-iban"
                className={`${INPUT} font-mono`}
                value={form.iban}
                onChange={(e) => setCampo('iban', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="p-cat" className={LABEL}>Categoría por defecto</label>
              <select
                id="p-cat"
                className={INPUT}
                value={form.categoriaDefecto}
                onChange={(e) => setCampo('categoriaDefecto', e.target.value)}
              >
                <option value="">— Sin definir —</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="p-tipo-op" className={LABEL}>Tipo de operación por defecto</label>
              <select
                id="p-tipo-op"
                className={INPUT}
                value={form.tipoOperacionDefecto}
                onChange={(e) => setCampo('tipoOperacionDefecto', e.target.value)}
              >
                <option value="">— Sin definir —</option>
                {TIPOS_OPERACION.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="p-ded" className={LABEL}>Deducible por defecto</label>
              <select
                id="p-ded"
                className={INPUT}
                value={form.deducibleDefecto}
                onChange={(e) => setCampo('deducibleDefecto', e.target.value)}
              >
                <option value="">— Sin definir —</option>
                {DEDUCIBLES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="p-subcat" className={LABEL}>Subcategoría por defecto</label>
              <input
                id="p-subcat"
                className={INPUT}
                value={form.subcategoriaDefecto}
                onChange={(e) => setCampo('subcategoriaDefecto', e.target.value)}
              />
            </div>
          </div>

          {/* ── Aliases ──────────────────────────────────────────── */}
          <div>
            <div className={LABEL}>
              Alias (nombres con los que el clasificador puede ver a este proveedor)
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.aliases.length === 0 && (
                <span className="text-sm text-gray-400">Sin alias.</span>
              )}
              {form.aliases.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                >
                  {a}
                  <button
                    onClick={() =>
                      setCampo('aliases', form.aliases.filter((x) => x !== a))
                    }
                    className="text-gray-400 hover:text-red-600"
                    aria-label={`Quitar el alias ${a}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={aliasNuevo}
                onChange={(e) => setAliasNuevo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addAlias()
                  }
                }}
                placeholder="Añadir alias y pulsar Enter"
                aria-label="Nuevo alias"
                className={INPUT}
              />
              <button
                onClick={addAlias}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap"
              >
                Añadir
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.validacionAuto}
                onChange={(e) => setCampo('validacionAuto', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Validación automática
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setCampo('activo', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Activo
            </label>
          </div>

          {/* ── Fusionar ─────────────────────────────────────────── */}
          {proveedor && (
            <div className="border-t border-gray-200 pt-3">
              <div className={LABEL}>Fusionar otro proveedor dentro de éste</div>
              <div className="flex gap-2">
                <select
                  value={origenId}
                  onChange={(e) => {
                    setOrigenId(e.target.value)
                    setConfirmarMerge(false)
                  }}
                  aria-label="Proveedor de origen"
                  className={INPUT}
                >
                  <option value="">— Elegir el proveedor a absorber —</option>
                  {candidatos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.facturas ?? 0} facturas)
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setConfirmarMerge(true)}
                  disabled={!origenId || isSaving}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
                >
                  Fusionar
                </button>
              </div>

              {confirmarMerge && origen && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-md p-3">
                  <p className="text-sm text-amber-900">
                    Se moverán <strong>{origen.facturas ?? 0} facturas</strong> de{' '}
                    <strong>{origen.nombre}</strong> a <strong>{proveedor.nombre}</strong>, y el
                    proveedor <strong>{origen.nombre}</strong> quedará inactivo.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={fusionar}
                      disabled={isSaving}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
                    >
                      {isSaving ? 'Fusionando…' : 'Sí, fusionar'}
                    </button>
                    <button
                      onClick={() => setConfirmarMerge(false)}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-3 space-y-2">
          {ok && (
            <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded px-2 py-1">
              {ok}
            </p>
          )}
          {aviso && (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {aviso}
            </p>
          )}
          {errores.length > 0 && (
            <ul className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2 list-disc list-inside space-y-0.5">
              {errores.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={guardar}
              disabled={isSaving || !form.nombre.trim()}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
