'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirmModal } from '@/components/ConfirmModal'
import EstadoPresupuestoBadge from '@/components/presupuesto/EstadoPresupuestoBadge'
import PresupuestoOpcionesForm from '@/components/presupuesto/PresupuestoOpcionesForm'
import PresupuestoTabla, {
  cuotaTexto,
} from '@/components/presupuesto/PresupuestoTabla'
import { dateToYMD } from '@/lib/fechas'
import type { FichaComercial } from '@/lib/fichaComercial'
import { downloadPdf } from '@/lib/pdf/download'
import { formatearEuros, formatearFecha } from '@/lib/plantillasMensajes'
import { calcularPresupuesto } from '@/lib/presupuesto/calculo'
import type {
  ContextoCalculo,
  ResumenPresupuesto,
} from '@/lib/presupuesto/repo'
import {
  OPCIONES_DEFECTO,
  type ColumnaClave,
  type OpcionesPresupuesto,
  type ResultadoCalculo,
} from '@/lib/presupuesto/tipos'

const CLASE_INPUT =
  'w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500'
const CLASE_BTN =
  'px-2 py-1 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'

type Fila = ResumenPresupuesto & { urlPublica: string }

interface Props {
  vehiculoId: number
  vehiculo: {
    marca: string
    modelo: string
    matricula: string
    fechaMatriculacion?: string | null
  }
  showToast: (msg: string, tipo: 'success' | 'error' | 'info') => void
}

async function leerError(res: Response, porDefecto: string): Promise<string> {
  const json = await res.json().catch(() => ({}))
  const detalle = Array.isArray(json?.errores)
    ? `: ${json.errores.join('; ')}`
    : ''
  return `${json?.error ?? porDefecto}${detalle}`
}

/** Limpia extra/coche a medio rellenar antes de mandarlo a la API. */
function opcionesParaApi(o: OpcionesPresupuesto): OpcionesPresupuesto {
  return {
    ...o,
    extra:
      o.extra && o.extra.concepto.trim() && o.extra.importe > 0
        ? { concepto: o.extra.concepto.trim(), importe: o.extra.importe }
        : null,
    cocheEntrega:
      o.cocheEntrega && o.cocheEntrega.valor > 0 ? o.cocheEntrega : null,
    tarifaOverride: o.tarifaOverride ?? null,
  }
}

export default function VehiculoPresupuestosCard({
  vehiculoId,
  vehiculo,
  showToast,
}: Props) {
  const router = useRouter()
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()

  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [panel, setPanel] = useState(false)
  const [contexto, setContexto] = useState<ContextoCalculo | null>(null)
  const [ficha, setFicha] = useState<FichaComercial | null>(null)
  const [cargandoPanel, setCargandoPanel] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [opciones, setOpciones] =
    useState<OpcionesPresupuesto>(OPCIONES_DEFECTO)
  const [guardando, setGuardando] = useState(false)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [columnaAceptar, setColumnaAceptar] = useState<
    Record<number, ColumnaClave>
  >({})

  const cargarLista = useCallback(async () => {
    try {
      const res = await fetch(`/api/presupuestos?vehiculoId=${vehiculoId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { presupuestos: Fila[] }
      setFilas(json.presupuestos ?? [])
    } catch (err) {
      console.error('presupuestos:', err)
      showToast('Error al cargar los presupuestos', 'error')
      setFilas([])
    }
  }, [vehiculoId, showToast])

  useEffect(() => {
    void cargarLista()
  }, [cargarLista])

  const abrirPanel = async () => {
    setPanel(true)
    setCargandoPanel(true)
    try {
      const [rc, rf] = await Promise.all([
        fetch('/api/presupuestos/parametros-calculo'),
        fetch(`/api/vehiculos/${vehiculoId}/ficha-comercial`),
      ])
      if (!rc.ok || !rf.ok) throw new Error(`HTTP ${rc.status}/${rf.status}`)
      setContexto((await rc.json()) as ContextoCalculo)
      setFicha((await rf.json()) as FichaComercial)
    } catch (err) {
      console.error('presupuesto contexto:', err)
      showToast('No se pudo cargar la ficha o los parámetros', 'error')
    } finally {
      setCargandoPanel(false)
    }
  }

  const preview = useMemo<
    { calculo: ResultadoCalculo } | { error: string } | null
  >(() => {
    if (!contexto || !ficha) return null
    if (!(ficha.precio_contado && ficha.precio_contado > 0)) {
      return { error: 'Falta precio contado en la ficha comercial' }
    }
    try {
      return {
        calculo: calcularPresupuesto({
          vehiculo: {
            precio_contado: ficha.precio_contado,
            tarifa_financiacion: ficha.tarifa_financiacion,
            gp: ficha.gp,
            fecha_matriculacion: dateToYMD(vehiculo.fechaMatriculacion),
            meses_garantia_fabrica: ficha.meses_garantia_fabrica,
          },
          opciones,
          params: contexto.params,
          tarifaPremium: contexto.tarifaPremium,
          tarifaSinPremium: contexto.tarifaSinPremium,
          hoy: contexto.hoy,
        }),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Error de cálculo' }
    }
  }, [contexto, ficha, opciones, vehiculo.fechaMatriculacion])

  const guardar = async () => {
    if (!nombre.trim()) {
      showToast('Indica el nombre del cliente', 'error')
      return
    }
    setGuardando(true)
    try {
      const res = await fetch('/api/presupuestos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehiculoId,
          nombreCliente: nombre.trim(),
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          opciones: opcionesParaApi(opciones),
        }),
      })
      if (!res.ok) {
        showToast(
          await leerError(res, 'Error al crear el presupuesto'),
          'error'
        )
        return
      }
      showToast('Presupuesto creado', 'success')
      setPanel(false)
      setNombre('')
      setTelefono('')
      setEmail('')
      setOpciones(OPCIONES_DEFECTO)
      await cargarLista()
    } catch (err) {
      console.error('crear presupuesto:', err)
      showToast('Error al crear el presupuesto', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const conFila = async (id: number, fn: () => Promise<void>) => {
    setOcupado(id)
    try {
      await fn()
    } catch (err) {
      console.error('presupuesto acción:', err)
      showToast('Error de red', 'error')
    } finally {
      setOcupado(null)
    }
  }

  const descargarPdf = (f: Fila) =>
    conFila(f.id, async () => {
      let nombreArchivo = `Presupuesto-${f.numero}`
      if (!f.pdf_url) {
        const res = await fetch(`/api/presupuestos/${f.id}/pdf`, {
          method: 'POST',
        })
        if (!res.ok) {
          showToast(await leerError(res, 'Error al generar el PDF'), 'error')
          return
        }
        const json = (await res.json()) as { nombreArchivo?: string }
        if (json.nombreArchivo) nombreArchivo = json.nombreArchivo
        await cargarLista()
      }
      await downloadPdf({
        url: `/api/presupuestos/${f.id}/pdf`,
        filename: nombreArchivo,
        onError: (m) => showToast(m, 'error'),
      })
    })

  const enviar = (f: Fila, canal: 'whatsapp' | 'email') => {
    // La pestaña se abre dentro del gesto del usuario; si no, el navegador la bloquea tras el await
    const w = canal === 'whatsapp' ? window.open('', '_blank') : null
    if (w) w.opener = null
    let navegado = false
    return conFila(f.id, async () => {
      try {
        const res = await fetch(`/api/presupuestos/${f.id}/enviar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canal }),
        })
        if (!res.ok) {
          showToast(await leerError(res, 'Error al enviar'), 'error')
          return
        }
        const json = (await res.json()) as { enlace?: string }
        if (canal === 'whatsapp' && json.enlace) {
          if (w) w.location.href = json.enlace
          else window.location.href = json.enlace
          navegado = true
          showToast('WhatsApp preparado', 'success')
        } else {
          showToast('Email enviado con el PDF adjunto', 'success')
        }
        await cargarLista()
      } finally {
        if (w && !navegado) w.close()
      }
    })
  }

  const aceptar = (f: Fila) => {
    const columna = columnaAceptar[f.id] ?? 'premium'
    const label =
      columna === 'premium' ? 'Con Garantía Premium' : 'Sin Garantía Premium'
    showConfirm(
      `Aceptar ${f.numero}`,
      `Se aceptará el presupuesto con la columna "${label}". Si tiene cliente asociado se creará un deal reservado; si no, irás al asistente de nueva venta.`,
      async () => {
        try {
          const res = await fetch(`/api/presupuestos/${f.id}/aceptar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ columna }),
          })
          if (!res.ok) {
            showToast(await leerError(res, 'No se pudo aceptar'), 'error')
            return
          }
          const json = (await res.json()) as { url?: string }
          showToast('Presupuesto aceptado', 'success')
          if (json.url) router.push(json.url)
          else await cargarLista()
        } catch (err) {
          console.error('aceptar presupuesto:', err)
          showToast('Error de red', 'error')
        }
      },
      { type: 'info', confirmText: 'Aceptar', loadingText: 'Aceptando…' }
    )
  }

  const anular = (f: Fila) =>
    showConfirm(
      `Anular ${f.numero}`,
      'El enlace público dejará de funcionar. Esta acción no se puede deshacer.',
      async () => {
        try {
          const res = await fetch(`/api/presupuestos/${f.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'anulado' }),
          })
          if (!res.ok) {
            showToast(await leerError(res, 'No se pudo anular'), 'error')
            return
          }
          showToast('Presupuesto anulado', 'success')
          await cargarLista()
        } catch (err) {
          console.error('anular presupuesto:', err)
          showToast('Error de red', 'error')
        }
      },
      { confirmText: 'Anular', loadingText: 'Anulando…' }
    )

  const puedeActuar = (f: Fila) =>
    f.estado !== 'aceptado' && f.estado !== 'anulado'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900">
          Presupuestos
        </h2>
        <button
          type="button"
          onClick={() => (panel ? setPanel(false) : abrirPanel())}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          {panel ? 'Cerrar' : 'Nuevo presupuesto'}
        </button>
      </div>

      {panel ? (
        <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="pres-nombre"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                Cliente *
              </label>
              <input
                id="pres-nombre"
                type="text"
                maxLength={120}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className={CLASE_INPUT}
              />
            </div>
            <div>
              <label
                htmlFor="pres-telefono"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                Teléfono
              </label>
              <input
                id="pres-telefono"
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className={CLASE_INPUT}
              />
            </div>
            <div>
              <label
                htmlFor="pres-email"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                Email
              </label>
              <input
                id="pres-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={CLASE_INPUT}
              />
            </div>
          </div>

          <PresupuestoOpcionesForm
            opciones={opciones}
            onChange={setOpciones}
            tarifaFicha={ficha?.tarifa_financiacion ?? null}
            disabled={cargandoPanel}
          />

          {cargandoPanel ? (
            <p className="text-sm text-slate-500">Cargando vista previa…</p>
          ) : preview && 'error' in preview ? (
            <p className="text-sm text-red-600">{preview.error}</p>
          ) : preview ? (
            <div>
              <p className="text-xs text-slate-500 mb-2">
                Vista previa · {preview.calculo.textos.validez} · tarifa{' '}
                {preview.calculo.derivados.tarifa}
              </p>
              <PresupuestoTabla calculo={preview.calculo} compacto />
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={guardar}
              disabled={
                guardando || !preview || 'error' in preview || !nombre.trim()
              }
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardando ? 'Guardando…' : 'Guardar presupuesto'}
            </button>
          </div>
        </div>
      ) : null}

      {filas === null ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-slate-500">
          Sin presupuestos para {vehiculo.marca} {vehiculo.modelo}{' '}
          {vehiculo.matricula}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Nº</th>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3 text-right">Sin premium</th>
                <th className="py-2 pr-3 text-right">Con premium</th>
                <th className="py-2 pr-3 text-right">Desde</th>
                <th className="py-2 pr-3">Válido hasta</th>
                <th className="py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="py-2 pr-3 font-medium whitespace-nowrap">
                    {f.numero}
                    <span className="block text-xs font-normal text-slate-500">
                      {formatearFecha(f.created_at)}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {f.nombre_cliente}
                    {f.telefono || f.email ? (
                      <span className="block text-xs text-slate-500">
                        {[f.telefono, f.email].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">
                    <EstadoPresupuestoBadge
                      estado={f.estado}
                      validoHasta={f.valido_hasta}
                    />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                    {formatearEuros(f.total_sin_premium)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                    {formatearEuros(f.total_premium)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                    {cuotaTexto(f.desde_premium)}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatearFecha(f.valido_hasta)}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {f.estado !== 'anulado' ? (
                        <a
                          href={f.urlPublica}
                          target="_blank"
                          rel="noreferrer"
                          className={CLASE_BTN}
                        >
                          Abrir
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => descargarPdf(f)}
                        disabled={ocupado === f.id}
                        className={CLASE_BTN}
                      >
                        PDF
                      </button>
                      {puedeActuar(f) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => enviar(f, 'whatsapp')}
                            disabled={ocupado === f.id || !f.telefono}
                            title={f.telefono ? undefined : 'Sin teléfono'}
                            className={CLASE_BTN}
                          >
                            WhatsApp
                          </button>
                          <button
                            type="button"
                            onClick={() => enviar(f, 'email')}
                            disabled={ocupado === f.id || !f.email}
                            title={f.email ? undefined : 'Sin email'}
                            className={CLASE_BTN}
                          >
                            Email
                          </button>
                          <select
                            aria-label="Columna a aceptar"
                            value={columnaAceptar[f.id] ?? 'premium'}
                            onChange={(e) =>
                              setColumnaAceptar((prev) => ({
                                ...prev,
                                [f.id]: e.target.value as ColumnaClave,
                              }))
                            }
                            className="px-1 py-1 text-xs border border-slate-300 rounded-md bg-white"
                          >
                            <option value="premium">Con premium</option>
                            <option value="sin_premium">Sin premium</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => aceptar(f)}
                            disabled={ocupado === f.id}
                            className="px-2 py-1 text-xs font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            Aceptar
                          </button>
                          <button
                            type="button"
                            onClick={() => anular(f)}
                            disabled={ocupado === f.id}
                            className="px-2 py-1 text-xs font-medium rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            Anular
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModalComponent />
    </div>
  )
}
