'use client'

/**
 * Panel de detalle de una factura recibida: cabecera editable + editor del
 * desglose de IVA.
 *
 * Dos decisiones que vienen de cómo trabaja el usuario (un PDF al lado y esta
 * pantalla):
 *
 *  1. El cuadre se calcula EN VIVO con `parseLineas`/`chequearMatematica`, los
 *     mismos módulos puros que corre la API. No es una segunda implementación
 *     "aproximada": si el semáforo dice verde, el servidor va a decir verde. Ver
 *     el descuadre antes de mandar es la diferencia entre corregir un número y
 *     pelearse con un 409.
 *  2. Guardar NUNCA pierde el trabajo: el PATCH con cuadre KO responde 200 y deja
 *     el registro en `datos_incompletos`. Los errores se pintan en rojo pero lo
 *     tecleado queda guardado. Validar sí exige que cuadre.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  chequearMatematica,
  parseLineas,
  TIPOS_LINEA,
  TIPOS_OPERACION,
  DEDUCIBLES,
  DEDUCIBLES_LINEA,
} from '@/lib/facturaFiscal'
import { parseImporte } from '@/lib/gastoImporte'
import { CATEGORIAS } from '@/lib/facturasRegistro'
import {
  ApiError,
  EstadoBadge,
  ESTADOS_INMUTABLES,
  NifBadge,
  Proveedor,
  RegistroDetalle,
  aInputDate,
  fmtFechaHora,
  fmtImporte,
  mensajeError,
} from '../_lib/fiscal-ui'
import MotivoModal, { MotivoPeticion } from './MotivoModal'

interface LineaForm {
  orden: number
  tipoLinea: string
  tipoIva: string
  base: string
  cuota: string
  retencionPct: string
  concepto: string
  deducible: string
}

interface CabeceraForm {
  numeroFactura: string
  importe: string
  fechaFactura: string
  fechaOperacion: string
  matricula: string
  proveedorId: string
  nifProveedor: string
  tipoOperacion: string
  deducible: string
  deduciblePct: string
  subcategoriaGasto: string
  categoria: string
}

const INPUT =
  'w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:text-gray-500'
const LABEL = 'block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1'

function aLineaForm(l: RegistroDetalle['lineas'][number]): LineaForm {
  return {
    orden: l.orden,
    tipoLinea: l.tipoLinea ?? 'iva',
    tipoIva: l.tipoIva == null ? '' : String(l.tipoIva),
    base: l.base == null ? '' : String(l.base),
    cuota: l.cuota == null ? '' : String(l.cuota),
    retencionPct: l.retencionPct == null ? '' : String(l.retencionPct),
    concepto: l.concepto ?? '',
    deducible: l.deducible ?? '',
  }
}

export default function PanelDetalle({
  id,
  proveedores,
  onClose,
  onSaved,
}: {
  id: number
  proveedores: Proveedor[]
  onClose: () => void
  onSaved: () => void
}) {
  const [detalle, setDetalle] = useState<RegistroDetalle | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [form, setForm] = useState<CabeceraForm | null>(null)
  const [lineas, setLineas] = useState<LineaForm[]>([])
  // Mandar `lineas` hace que la API borre y reinserte el desglose entero. Si el
  // usuario no lo tocó, no se manda: no hay por qué ensuciar el audit log.
  const [lineasTocadas, setLineasTocadas] = useState(false)

  const [errores, setErrores] = useState<string[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [motivoPeticion, setMotivoPeticion] = useState<MotivoPeticion | null>(null)

  const cargar = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/fiscal/registro/${id}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(mensajeError(json as ApiError, res.status))
      const d = json as RegistroDetalle
      setDetalle(d)
      setForm({
        numeroFactura: d.numeroFactura ?? '',
        importe: d.importe == null ? '' : String(d.importe),
        fechaFactura: aInputDate(d.fechaFactura),
        fechaOperacion: aInputDate(d.fechaOperacion),
        matricula: d.matricula ?? '',
        proveedorId: d.proveedorId == null ? '' : String(d.proveedorId),
        nifProveedor: d.nifProveedor ?? '',
        tipoOperacion: d.tipoOperacion ?? '',
        deducible: d.deducible ?? '',
        deduciblePct: d.deduciblePct == null ? '' : String(d.deduciblePct),
        subcategoriaGasto: d.subcategoriaGasto ?? '',
        categoria: d.categoria ?? '',
      })
      setLineas((d.lineas ?? []).map(aLineaForm))
      setLineasTocadas(false)
      setErrores([])
      setAviso(null)
      setOk(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la factura')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  // ── Cuadre en vivo (misma pipeline que la API) ────────────────────────────
  const cuadre = useMemo(() => {
    const { lineas: parsed, errores: erroresParse } = parseLineas(
      lineas.map((l) => ({
        orden: l.orden,
        tipoLinea: l.tipoLinea,
        tipoIva: l.tipoIva === '' ? null : l.tipoIva,
        base: l.base,
        cuota: l.cuota === '' ? null : l.cuota,
        retencionPct: l.retencionPct === '' ? null : l.retencionPct,
        concepto: l.concepto,
        deducible: l.deducible === '' ? null : l.deducible,
      }))
    )
    const math = chequearMatematica(parsed, form ? parseImporte(form.importe) : null)
    return { math, erroresParse, ok: math.ok && erroresParse.length === 0 }
  }, [lineas, form])

  const inmutable = detalle != null && ESTADOS_INMUTABLES.includes(detalle.estado)

  function setCampo(k: keyof CabeceraForm, v: string) {
    setForm((f) => (f ? { ...f, [k]: v } : f))
  }

  function setLinea(i: number, k: keyof LineaForm, v: string) {
    setLineasTocadas(true)
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  }

  function addLinea() {
    setLineasTocadas(true)
    setLineas((ls) => [
      ...ls,
      {
        orden: ls.length > 0 ? Math.max(...ls.map((l) => l.orden)) + 1 : 1,
        tipoLinea: 'iva',
        tipoIva: '21',
        base: '',
        cuota: '',
        retencionPct: '',
        concepto: '',
        deducible: '',
      },
    ])
  }

  function quitarLinea(i: number) {
    setLineasTocadas(true)
    setLineas((ls) => ls.filter((_, j) => j !== i))
  }

  /** Body del PATCH/validar. Los strings vacíos viajan como null (= "borrar"). */
  function construirBody(): Record<string, unknown> {
    if (!form) return {}
    const nul = (v: string) => (v.trim() === '' ? null : v.trim())
    const body: Record<string, unknown> = {
      numeroFactura: nul(form.numeroFactura),
      importe: nul(form.importe),
      fechaFactura: nul(form.fechaFactura),
      fechaOperacion: nul(form.fechaOperacion),
      matricula: nul(form.matricula),
      proveedorId: form.proveedorId === '' ? null : Number(form.proveedorId),
      nifProveedor: nul(form.nifProveedor),
      tipoOperacion: nul(form.tipoOperacion),
      deducible: nul(form.deducible),
      deduciblePct: nul(form.deduciblePct),
      subcategoriaGasto: nul(form.subcategoriaGasto),
      categoria: nul(form.categoria),
    }
    if (lineasTocadas) {
      body.lineas = lineas.map((l) => ({
        orden: l.orden,
        tipoLinea: l.tipoLinea,
        tipoIva: l.tipoIva === '' ? null : l.tipoIva,
        base: l.base,
        cuota: l.cuota === '' ? null : l.cuota,
        retencionPct: l.retencionPct === '' ? null : l.retencionPct,
        concepto: nul(l.concepto),
        deducible: l.deducible === '' ? null : l.deducible,
      }))
    }
    return body
  }

  /**
   * Envía y traduce la respuesta. `extra` reinyecta force+motivo en el reintento.
   * Los 409 con force posible no se resuelven solos: los devuelve para que el
   * caller pida el motivo (un force sin justificación escrita es lo que después
   * nadie puede explicar en una inspección).
   */
  async function enviar(
    url: string,
    extra: Record<string, unknown> = {}
  ): Promise<{ okey: boolean; json: ApiError }> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...construirBody(), ...extra }),
    })
    const json = (await res.json().catch(() => ({}))) as ApiError
    return { okey: res.ok, json }
  }

  async function patch(extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/fiscal/registro/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...construirBody(), ...extra }),
    })
    const json = (await res.json().catch(() => ({}))) as ApiError
    return { okey: res.ok, json }
  }

  function limpiarMensajes() {
    setErrores([])
    setAviso(null)
    setOk(null)
  }

  async function guardar(extra: Record<string, unknown> = {}) {
    setIsSaving(true)
    limpiarMensajes()
    try {
      const { okey, json } = await patch(extra)

      // Cuadre KO → 200 con avisos. Se guardó igual: no es un error del usuario.
      if (okey) {
        const errs = json.cuadre?.errores ?? []
        setErrores(errs)
        setAviso(json.aviso ?? null)
        if (errs.length === 0 && !json.aviso) setOk('Cambios guardados.')
        else if (errs.length > 0) setOk('Cambios guardados (con el desglose sin cuadrar).')
        await cargar()
        onSaved()
        return
      }

      if (json.code === 'REGISTRO_INMUTABLE') {
        setMotivoPeticion({
          titulo: 'La factura ya no es modificable',
          mensaje: json.error ?? '',
          onConfirm: (motivo) => guardar({ force: true, motivo }),
        })
        return
      }

      setErrores(json.errores ?? [])
      setAviso(mensajeError(json))
    } catch {
      setAviso('No se pudo guardar: fallo de red.')
    } finally {
      setIsSaving(false)
    }
  }

  async function validar(extra: Record<string, unknown> = {}) {
    setIsSaving(true)
    limpiarMensajes()
    try {
      const { okey, json } = await enviar(`/api/fiscal/registro/${id}/validar`, extra)

      if (okey) {
        setOk('Factura validada.')
        await cargar()
        onSaved()
        return
      }

      // MATH_KO no se fuerza: si el desglose no cuadra, no sabemos qué número
      // está mal. Se muestran los errores y se corrige.
      if (json.code === 'MATH_KO') {
        setErrores(json.cuadre?.errores ?? json.errores ?? [])
        setAviso(mensajeError(json))
        return
      }

      if (json.code === 'NIF_INVALIDO' || json.code === 'REGISTRO_INMUTABLE') {
        setMotivoPeticion({
          titulo: json.code === 'NIF_INVALIDO' ? 'NIF inválido' : 'La factura ya no es modificable',
          mensaje: json.error ?? '',
          onConfirm: (motivo) => validar({ force: true, motivo }),
        })
        return
      }

      setErrores(json.errores ?? [])
      setAviso(mensajeError(json))
    } catch {
      setAviso('No se pudo validar: fallo de red.')
    } finally {
      setIsSaving(false)
    }
  }

  async function anular(motivo: string) {
    setIsSaving(true)
    limpiarMensajes()
    try {
      const res = await fetch(`/api/fiscal/registro/${id}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'anulada', motivo }),
      })
      const json = (await res.json().catch(() => ({}))) as ApiError
      if (!res.ok) {
        setAviso(mensajeError(json, res.status))
        return
      }
      setOk('Factura anulada.')
      await cargar()
      onSaved()
    } catch {
      setAviso('No se pudo anular: fallo de red.')
    } finally {
      setIsSaving(false)
    }
  }

  const proveedorNombre =
    detalle?.proveedor?.nombre ?? (detalle?.proveedorId == null ? 'Sin proveedor' : '—')

  return (
    <>
      {/* Drawer: la tabla es ancha y el editor de líneas necesita sitio; un panel
          embebido en una columna dejaría el desglose ilegible. */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl bg-white shadow-xl border-l border-gray-200 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de la factura"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">
              {detalle?.numeroFactura || 'Sin nº'} · {proveedorNombre}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {detalle && <EstadoBadge estado={detalle.estado} />}
              {detalle && <NifBadge nif={detalle.nifProveedor} valido={detalle.nifValido} />}
              {detalle?.posibleDuplicado && (
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                  Posible duplicado{detalle.duplicadoDe ? ` de #${detalle.duplicadoDe}` : ''}
                </span>
              )}
              {detalle?.tardia && (
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  Tardía
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {isLoading ? (
            <p className="text-sm text-gray-500 py-8 text-center">Cargando factura…</p>
          ) : loadError ? (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">{loadError}</p>
              <button
                onClick={cargar}
                className="mt-2 text-sm font-medium text-red-700 underline"
              >
                Reintentar
              </button>
            </div>
          ) : !detalle || !form ? null : (
            <>
              {inmutable && (
                <div className="bg-gray-100 border border-gray-300 rounded-md p-3 text-sm text-gray-700">
                  Esta factura está <strong>{detalle.estado}</strong>: la API la trata como
                  inmutable. Si la editás te va a pedir un motivo para forzar el cambio.
                </div>
              )}

              {/* ── Cabecera ─────────────────────────────────────────── */}
              <section className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-numero" className={LABEL}>Nº factura</label>
                  <input
                    id="f-numero"
                    className={INPUT}
                    value={form.numeroFactura}
                    onChange={(e) => setCampo('numeroFactura', e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="f-importe" className={LABEL}>Importe total (€)</label>
                  <input
                    id="f-importe"
                    className={INPUT}
                    value={form.importe}
                    onChange={(e) => setCampo('importe', e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label htmlFor="f-fecha" className={LABEL}>Fecha factura</label>
                  <input
                    id="f-fecha"
                    type="date"
                    className={INPUT}
                    value={form.fechaFactura}
                    onChange={(e) => setCampo('fechaFactura', e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="f-fecha-op" className={LABEL}>Fecha operación</label>
                  <input
                    id="f-fecha-op"
                    type="date"
                    className={INPUT}
                    value={form.fechaOperacion}
                    onChange={(e) => setCampo('fechaOperacion', e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="f-prov" className={LABEL}>Proveedor</label>
                  <select
                    id="f-prov"
                    className={INPUT}
                    value={form.proveedorId}
                    onChange={(e) => setCampo('proveedorId', e.target.value)}
                  >
                    <option value="">— Sin proveedor —</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-nif" className={LABEL}>NIF proveedor</label>
                  <input
                    id="f-nif"
                    className={`${INPUT} font-mono`}
                    value={form.nifProveedor}
                    onChange={(e) => setCampo('nifProveedor', e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="f-matricula" className={LABEL}>Matrícula</label>
                  <input
                    id="f-matricula"
                    className={`${INPUT} font-mono`}
                    value={form.matricula}
                    onChange={(e) => setCampo('matricula', e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="f-categoria" className={LABEL}>Categoría</label>
                  <select
                    id="f-categoria"
                    className={INPUT}
                    value={form.categoria}
                    onChange={(e) => setCampo('categoria', e.target.value)}
                  >
                    <option value="">— Sin categoría —</option>
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-tipo-op" className={LABEL}>Tipo de operación</label>
                  <select
                    id="f-tipo-op"
                    className={INPUT}
                    value={form.tipoOperacion}
                    onChange={(e) => setCampo('tipoOperacion', e.target.value)}
                  >
                    <option value="">— Sin definir —</option>
                    {TIPOS_OPERACION.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-deducible" className={LABEL}>Deducible</label>
                  <select
                    id="f-deducible"
                    className={INPUT}
                    value={form.deducible}
                    onChange={(e) => setCampo('deducible', e.target.value)}
                  >
                    <option value="">— Sin definir —</option>
                    {DEDUCIBLES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-deducible-pct" className={LABEL}>Deducible %</label>
                  <input
                    id="f-deducible-pct"
                    className={INPUT}
                    value={form.deduciblePct}
                    onChange={(e) => setCampo('deduciblePct', e.target.value)}
                    inputMode="decimal"
                    placeholder="solo si es parcial"
                  />
                </div>
                <div>
                  <label htmlFor="f-subcat" className={LABEL}>Subcategoría de gasto</label>
                  <input
                    id="f-subcat"
                    className={INPUT}
                    value={form.subcategoriaGasto}
                    onChange={(e) => setCampo('subcategoriaGasto', e.target.value)}
                  />
                </div>
              </section>

              {/* ── Desglose ─────────────────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">Desglose de IVA</h3>
                  <button
                    onClick={addLinea}
                    className="text-sm font-medium text-primary-700 hover:text-primary-800"
                  >
                    + Añadir línea
                  </button>
                </div>

                {lineas.length === 0 ? (
                  <p className="text-sm text-gray-500 bg-gray-50 rounded-md p-3">
                    Sin líneas. Una factura sin desglose no se puede validar.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-md">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Tipo', '% IVA', 'Base', 'Cuota', '% Ret.', 'Concepto', 'Ded.', ''].map(
                            (h) => (
                              <th
                                key={h}
                                className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                {h}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {lineas.map((l, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1">
                              <select
                                aria-label={`Tipo de la línea ${i + 1}`}
                                className={INPUT}
                                value={l.tipoLinea}
                                onChange={(e) => setLinea(i, 'tipoLinea', e.target.value)}
                              >
                                {TIPOS_LINEA.map((t) => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1 w-20">
                              <input
                                aria-label={`% IVA de la línea ${i + 1}`}
                                className={INPUT}
                                value={l.tipoIva}
                                onChange={(e) => setLinea(i, 'tipoIva', e.target.value)}
                                inputMode="decimal"
                              />
                            </td>
                            <td className="px-2 py-1 w-24">
                              <input
                                aria-label={`Base de la línea ${i + 1}`}
                                className={INPUT}
                                value={l.base}
                                onChange={(e) => setLinea(i, 'base', e.target.value)}
                                inputMode="decimal"
                              />
                            </td>
                            <td className="px-2 py-1 w-24">
                              <input
                                aria-label={`Cuota de la línea ${i + 1}`}
                                className={INPUT}
                                value={l.cuota}
                                onChange={(e) => setLinea(i, 'cuota', e.target.value)}
                                inputMode="decimal"
                              />
                            </td>
                            <td className="px-2 py-1 w-20">
                              <input
                                aria-label={`% de retención de la línea ${i + 1}`}
                                className={INPUT}
                                value={l.retencionPct}
                                onChange={(e) => setLinea(i, 'retencionPct', e.target.value)}
                                inputMode="decimal"
                                disabled={l.tipoLinea !== 'retencion'}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                aria-label={`Concepto de la línea ${i + 1}`}
                                className={INPUT}
                                value={l.concepto}
                                onChange={(e) => setLinea(i, 'concepto', e.target.value)}
                              />
                            </td>
                            <td className="px-2 py-1 w-24">
                              <select
                                aria-label={`Deducible de la línea ${i + 1}`}
                                className={INPUT}
                                value={l.deducible}
                                onChange={(e) => setLinea(i, 'deducible', e.target.value)}
                              >
                                <option value="">—</option>
                                {DEDUCIBLES_LINEA.map((d) => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1">
                              <button
                                onClick={() => quitarLinea(i)}
                                className="text-gray-400 hover:text-red-600 text-lg leading-none px-1"
                                aria-label={`Quitar la línea ${i + 1}`}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Semáforo del cuadre. */}
                <div
                  className={`mt-2 rounded-md p-3 border text-sm ${
                    cuadre.ok
                      ? 'bg-green-50 border-green-200 text-green-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-medium">
                    <span>Bases: {fmtImporte(cuadre.math.baseTotal)}</span>
                    <span>Cuotas: {fmtImporte(cuadre.math.cuotaTotal)}</span>
                    <span>Total calculado: {fmtImporte(cuadre.math.calculado)}</span>
                    <span>Importe declarado: {fmtImporte(cuadre.math.declarado)}</span>
                    <span className="ml-auto">{cuadre.ok ? '✓ Cuadra' : '✗ No cuadra'}</span>
                  </div>
                  {(cuadre.math.errores.length > 0 || cuadre.erroresParse.length > 0) && (
                    <ul className="mt-2 list-disc list-inside space-y-0.5">
                      {[...cuadre.erroresParse, ...cuadre.math.errores].map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              {/* ── Archivo ──────────────────────────────────────────── */}
              <section>
                <div className={LABEL}>Archivo</div>
                {/* Solo texto: el PDF vive en OneDrive y no es accesible desde Vercel. */}
                <p className="text-sm text-gray-700 break-all bg-gray-50 rounded px-2 py-1 select-all">
                  {detalle.ruta ? `${detalle.ruta}/` : ''}
                  {detalle.nombreArchivo ?? '—'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Confianza del extractor:{' '}
                  {detalle.extraccionConfianza == null
                    ? '—'
                    : `${Math.round(detalle.extraccionConfianza * 100)}%`}
                  {detalle.extraccionMetodo ? ` · método: ${detalle.extraccionMetodo}` : ''}
                </p>
              </section>

              {/* ── Trazas ───────────────────────────────────────────── */}
              <details className="border border-gray-200 rounded-md">
                <summary className="px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer">
                  Lo que leyó el extractor
                </summary>
                <pre className="px-3 py-2 text-xs text-gray-700 bg-gray-50 overflow-x-auto whitespace-pre-wrap break-all">
                  {detalle.extraccionRaw
                    ? JSON.stringify(detalle.extraccionRaw, null, 2)
                    : 'Sin datos de extracción.'}
                </pre>
              </details>

              <details className="border border-gray-200 rounded-md">
                <summary className="px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer">
                  Historial ({detalle.historial?.length ?? 0})
                </summary>
                <div className="px-3 py-2 space-y-2 bg-gray-50">
                  {(detalle.historial ?? []).length === 0 ? (
                    <p className="text-xs text-gray-500">Sin movimientos.</p>
                  ) : (
                    detalle.historial.map((h) => (
                      <div key={h.id} className="text-xs text-gray-700 border-b border-gray-200 pb-2">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{h.accion}</span>
                          <span className="text-gray-500">
                            {h.actor} · {fmtFechaHora(h.createdAt)}
                          </span>
                        </div>
                        {h.motivo && <p className="text-gray-600 mt-0.5">Motivo: {h.motivo}</p>}
                        {h.cambios && Object.keys(h.cambios).length > 0 && (
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-gray-500">
                            {JSON.stringify(h.cambios)}
                          </pre>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </details>
            </>
          )}
        </div>

        {/* ── Mensajes + acciones ─────────────────────────────────── */}
        {!isLoading && !loadError && detalle && (
          <div className="border-t border-gray-200 px-4 py-3 space-y-2 bg-white">
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
                onClick={() => guardar()}
                disabled={isSaving}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Procesando…' : 'Guardar'}
              </button>
              <button
                onClick={() => validar()}
                disabled={isSaving}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Validar
              </button>
              <button
                onClick={() =>
                  setMotivoPeticion({
                    titulo: 'Anular la factura',
                    mensaje:
                      'La factura queda anulada (no se borra: el histórico la necesita). El motivo queda en el audit log.',
                    onConfirm: (motivo) => anular(motivo),
                  })
                }
                disabled={isSaving || detalle.estado === 'anulada'}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Anular
              </button>
            </div>
          </div>
        )}
      </aside>

      {motivoPeticion && (
        <MotivoModal
          peticion={motivoPeticion}
          onClose={() => setMotivoPeticion(null)}
          isLoading={isSaving}
        />
      )}
    </>
  )
}
