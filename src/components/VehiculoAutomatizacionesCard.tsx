'use client'

import { useCallback, useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { normalizarTipo } from '@/lib/vehiculoEstado'
// Sólo tipos: el módulo usa pg y no puede entrar al bundle del cliente.
import type {
  EstadoTrabajo,
  EstadoWorker,
  TipoTrabajo,
  Trabajo,
} from '@/lib/automatizaciones'

const ACCIONES: {
  tipo: TipoTrabajo
  label: string
  ayuda?: string
  simula: boolean
}[] = [
  {
    tipo: 'cambio_precio',
    label: 'Cambiar precio',
    ayuda: 'toma el precio de la hoja Base_Datos: web + carteles + ficha',
    simula: true,
  },
  { tipo: 'cambio_fotos', label: 'Cambiar fotos', simula: true },
  { tipo: 'publicar_borrador', label: 'Publicar borrador', simula: true },
  { tipo: 'bajar_ficha', label: 'Bajar ficha', simula: false },
  { tipo: 'carteles', label: 'Carteles', simula: false },
]
const LABEL_TIPO = Object.fromEntries(
  ACCIONES.map((a) => [a.tipo, a.label])
) as Record<TipoTrabajo, string>
const SIMULADOS = new Set(ACCIONES.filter((a) => a.simula).map((a) => a.tipo))

const ESTADO_UI: Record<EstadoTrabajo, { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente', clase: 'bg-amber-100 text-amber-800' },
  en_curso: { texto: 'En curso', clase: 'bg-blue-100 text-blue-800' },
  ok: { texto: 'OK', clase: 'bg-green-100 text-green-800' },
  error: { texto: 'Error', clase: 'bg-red-100 text-red-800' },
  caducado: { texto: 'Caducado', clase: 'bg-slate-100 text-slate-600' },
  cancelado: { texto: 'Cancelado', clase: 'bg-slate-100 text-slate-600' },
}

/** Mismos tipos que entran a Base_Datos (admiteAutomatizaciones en la lib). */
const TIPOS_VEHICULO_CON_WEB = ['C', 'I', 'D']
const SIMULACION_VIGENTE_MS = 30 * 60_000
const POLL_MS = 5000

const CLASE_BOTON =
  'px-3 py-1.5 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed'
const CLASE_BOTON_CHICO =
  'px-2 py-1 text-xs font-medium rounded-md border disabled:opacity-50 disabled:cursor-not-allowed'

function activo(t: Trabajo): boolean {
  return t.estado === 'pendiente' || t.estado === 'en_curso'
}

function formatoHace(s: number | null): string {
  if (s == null || s < 0) return '—'
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  const d = Math.floor(s / 86400)
  return d === 1 ? '1 día' : `${d} días`
}

function formatoHora(isoTxt: string | null): string {
  if (!isoTxt) return ''
  const d = new Date(isoTxt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Simulación ok, reciente, de un tipo que la exige y que ningún aplicar usó. */
function aplicable(t: Trabajo, todos: Trabajo[], ahora: number): boolean {
  if (!SIMULADOS.has(t.tipo) || t.modo !== 'simular' || t.estado !== 'ok')
    return false
  if (!t.finished_at) return false
  if (ahora - Date.parse(t.finished_at) >= SIMULACION_VIGENTE_MS) return false
  return !todos.some(
    (x) =>
      x.simulacion_id === t.id &&
      (x.estado === 'pendiente' || x.estado === 'en_curso' || x.estado === 'ok')
  )
}

function LineaWorker({ worker }: { worker: EstadoWorker | null }) {
  if (!worker?.last_seen) {
    return <p className="text-sm text-slate-500">La PC todavía no se conectó</p>
  }
  if (worker.activo) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-green-700">
        <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden />
        PC: activa
      </p>
    )
  }
  return (
    <p className="text-sm text-slate-500">
      PC apagada — última señal hace {formatoHace(worker.hace_s)}
    </p>
  )
}

function Salida({ t }: { t: Trabajo }) {
  const verificar = t.para_verificar ?? []
  const marcadas = new Set(verificar.map((l) => l.trim()))
  return (
    <div className="mt-2 space-y-2">
      {verificar.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2">
          <p className="mb-1 text-xs font-semibold text-amber-800">
            PARA VERIFICAR
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-900">
            {verificar.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {t.salida ? (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 p-2 text-xs text-slate-100">
          {t.salida.split('\n').map((l, i) => (
            <span
              key={i}
              className={
                marcadas.has(l.trim()) || /PARA VERIFICAR/i.test(l)
                  ? 'block bg-amber-300 text-slate-900'
                  : 'block'
              }
            >
              {l || ' '}
            </span>
          ))}
        </pre>
      ) : (
        <p className="text-xs text-slate-500">Sin salida.</p>
      )}
    </div>
  )
}

export interface VehiculoAutomatizacionesProps {
  vehiculoId: number
  tipoVehiculo: string | null | undefined
  /** Aplicar (y los botones directos) es sólo para admin; el server lo exige. */
  puedeAplicar: boolean
  showToast: (msg: string, tipo: 'success' | 'error' | 'info') => void
}

export default function VehiculoAutomatizacionesCard(
  props: VehiculoAutomatizacionesProps
) {
  const t = normalizarTipo(props.tipoVehiculo)
  if (!t || !TIPOS_VEHICULO_CON_WEB.includes(t)) return null
  return <Contenido {...props} />
}

function Contenido({
  vehiculoId,
  puedeAplicar,
  showToast,
}: VehiculoAutomatizacionesProps) {
  const { showConfirm, ConfirmModalComponent } = useConfirmModal()
  const [trabajos, setTrabajos] = useState<Trabajo[] | null>(null)
  const [worker, setWorker] = useState<EstadoWorker | null>(null)
  const [ahora, setAhora] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set())

  const url = `/api/vehiculos/${vehiculoId}/automatizaciones`

  const cargar = useCallback(
    async (silencioso: boolean) => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as {
          trabajos: Trabajo[]
          worker: EstadoWorker
        }
        setTrabajos(json.trabajos ?? [])
        setWorker(json.worker ?? null)
        setAhora(Date.now())
      } catch (err) {
        console.error('automatizaciones:', err)
        if (!silencioso) {
          showToast('Error al cargar las automatizaciones', 'error')
          setTrabajos((prev) => prev ?? [])
        }
      }
    },
    [url, showToast]
  )

  useEffect(() => {
    void cargar(false)
  }, [cargar])

  const hayActivos = (trabajos ?? []).some(activo)
  useEffect(() => {
    if (!hayActivos) return
    const id = setInterval(() => void cargar(true), POLL_MS)
    return () => clearInterval(id)
  }, [hayActivos, cargar])

  const pedir = async (
    tipo: TipoTrabajo,
    modo: 'simular' | 'aplicar',
    simulacionId?: number
  ) => {
    setEnviando(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          simulacionId != null
            ? { tipo, modo, simulacion_id: simulacionId }
            : { tipo, modo }
        ),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(json?.error ?? 'Error al enviar el pedido', 'error')
        return
      }
      showToast(
        `${LABEL_TIPO[tipo]}: pedido enviado a la PC${modo === 'simular' ? ' (simulación)' : ''}`,
        'success'
      )
      await cargar(true)
    } catch (err) {
      console.error('pedido automatización:', err)
      showToast('Error al enviar el pedido', 'error')
    } finally {
      setEnviando(false)
    }
  }

  const cancelarPedido = async (tr: Trabajo) => {
    setEnviando(true)
    try {
      const res = await fetch(`${url}/${tr.id}/cancelar`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) showToast(json?.error ?? 'No se pudo cancelar', 'error')
      else showToast('Pedido cancelado', 'info')
      await cargar(true)
    } catch (err) {
      console.error('cancelar automatización:', err)
      showToast('No se pudo cancelar', 'error')
    } finally {
      setEnviando(false)
    }
  }

  const confirmarAplicar = (sim: Trabajo) =>
    showConfirm(
      `Aplicar «${LABEL_TIPO[sim.tipo]}»`,
      `Se va a aplicar de verdad lo que mostró la simulación #${sim.id} (${formatoHora(sim.finished_at)}).\n¿Seguir?`,
      () => pedir(sim.tipo, 'aplicar', sim.id),
      { type: 'warning', confirmText: 'Sí, aplicar' }
    )

  const alternar = (id: number) =>
    setAbiertos((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })

  const lista = trabajos ?? []
  const activoDe = (tipo: TipoTrabajo) =>
    lista.find((x) => x.tipo === tipo && activo(x))

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 lg:p-6">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">
            Web y carteles (automatizaciones)
          </h2>
          <LineaWorker worker={worker} />
        </div>
        <button
          type="button"
          onClick={() => void cargar(false)}
          className={`${CLASE_BOTON} border border-slate-300 text-slate-700 hover:bg-slate-50`}
        >
          Actualizar
        </button>
      </div>

      {trabajos == null ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <div className="divide-y divide-slate-100">
            {ACCIONES.map((a) => {
              const act = activoDe(a.tipo)
              const bloqueado =
                enviando || !!act || (!a.simula && !puedeAplicar)
              return (
                <div
                  key={a.tipo}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {a.label}
                    </p>
                    {a.ayuda && (
                      <p className="text-xs text-slate-500">{a.ayuda}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`${a.simula ? 'Simular' : 'Ejecutar'} ${a.label}`}
                    title={
                      !a.simula && !puedeAplicar
                        ? 'Sólo un admin puede ejecutarlo'
                        : undefined
                    }
                    disabled={bloqueado}
                    onClick={() =>
                      void pedir(a.tipo, a.simula ? 'simular' : 'aplicar')
                    }
                    className={`${CLASE_BOTON} ${a.simula ? 'border border-blue-600 text-blue-700 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                  >
                    {act
                      ? act.estado === 'en_curso'
                        ? 'En curso…'
                        : 'En cola…'
                      : a.simula
                        ? 'Simular'
                        : 'Ejecutar'}
                  </button>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-slate-500">
            Si la PC no toma un pedido en 15 min, caduca. Cambiar precio, fotos
            y borrador se simulan primero y se aplican desde la simulación.
          </p>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">
              Últimos pedidos
            </h3>
            {lista.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no hay pedidos.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lista.map((tr) => {
                  const ui = ESTADO_UI[tr.estado] ?? ESTADO_UI.error
                  const abierto = abiertos.has(tr.id)
                  const tieneDetalle =
                    !!tr.salida || (tr.para_verificar?.length ?? 0) > 0
                  return (
                    <li key={tr.id} className="py-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-slate-800">
                          {LABEL_TIPO[tr.tipo] ?? tr.tipo}
                        </span>
                        <span className="text-slate-500">
                          {tr.modo === 'simular' ? 'simulación' : 'aplicar'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${ui.clase}`}
                        >
                          {ui.texto}
                        </span>
                        <span className="text-xs text-slate-500">
                          #{tr.id} · {formatoHora(tr.created_at)}
                        </span>
                        {(tr.para_verificar?.length ?? 0) > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            {tr.para_verificar!.length} para verificar
                          </span>
                        )}
                        <span className="ml-auto flex flex-wrap gap-1.5">
                          {tieneDetalle && (
                            <button
                              type="button"
                              onClick={() => alternar(tr.id)}
                              className={`${CLASE_BOTON_CHICO} border-slate-300 text-slate-700 hover:bg-slate-50`}
                            >
                              {abierto ? 'Ocultar salida' : 'Ver salida'}
                            </button>
                          )}
                          {tr.url && (
                            <a
                              href={tr.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`${CLASE_BOTON_CHICO} border-slate-300 text-blue-700 hover:bg-slate-50`}
                            >
                              Abrir enlace
                            </a>
                          )}
                          {aplicable(tr, lista, ahora) && (
                            <button
                              type="button"
                              disabled={
                                enviando || !puedeAplicar || !!activoDe(tr.tipo)
                              }
                              title={
                                puedeAplicar
                                  ? undefined
                                  : 'Sólo un admin puede aplicar'
                              }
                              onClick={() => confirmarAplicar(tr)}
                              className={`${CLASE_BOTON_CHICO} border-green-600 bg-green-600 text-white hover:bg-green-700`}
                            >
                              Aplicar
                            </button>
                          )}
                          {tr.estado === 'pendiente' && (
                            <button
                              type="button"
                              disabled={enviando}
                              onClick={() => void cancelarPedido(tr)}
                              className={`${CLASE_BOTON_CHICO} border-red-300 text-red-700 hover:bg-red-50`}
                            >
                              Cancelar
                            </button>
                          )}
                        </span>
                      </div>
                      {abierto && <Salida t={tr} />}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
      <ConfirmModalComponent />
    </div>
  )
}
