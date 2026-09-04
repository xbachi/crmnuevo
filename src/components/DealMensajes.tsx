'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/hooks/useToast'
import {
  ctxDesdeDeal,
  enlaceWhatsApp,
  normalizarTelefono,
  PLANTILLA_IDS,
  PLANTILLAS,
  renderPlantilla,
  type DealParaCtx,
  type PlantillaCtx,
  type PlantillaId,
} from '@/lib/plantillasMensajes'

export interface DealMensajesDeal extends DealParaCtx {
  id: number
  cliente?: {
    nombre?: string | null
    apellidos?: string | null
    email?: string | null
    telefono?: string | null
  } | null
}

interface MensajeHistorial {
  id: number
  plantilla: string
  canal: 'email' | 'whatsapp'
  destinatario: string | null
  asunto: string | null
  enviado_por: string | null
  created_at: string
}

const CANAL_LABEL: Record<MensajeHistorial['canal'], string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
}

function tituloPlantilla(id: string): string {
  return (
    (PLANTILLAS as Record<string, { titulo: string } | undefined>)[id]
      ?.titulo ?? (id === 'libre' ? 'Texto libre' : id)
  )
}

function formatearFechaHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const BTN_PRIMARIO =
  'inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
const BTN_WHATSAPP =
  'inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700'
const BTN_DESHABILITADO =
  'inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 text-gray-500 cursor-not-allowed'

export default function DealMensajes({ deal }: { deal: DealMensajesDeal }) {
  const { showToast } = useToast()

  // El deal de la ficha cambia de identidad en cada refresco; estabilizamos el
  // contexto por valor para no pisar el texto editado sin motivo.
  const ctxKey = JSON.stringify(ctxDesdeDeal(deal))
  const ctx = useMemo(() => JSON.parse(ctxKey) as PlantillaCtx, [ctxKey])

  const aplican = useMemo(
    () => PLANTILLA_IDS.filter((id) => PLANTILLAS[id].cuandoAplica(deal)),
    [deal]
  )
  const otras = PLANTILLA_IDS.filter((id) => !aplican.includes(id))

  const [seleccionada, setSeleccionada] = useState<PlantillaId | null>(null)
  const activa: PlantillaId | null = seleccionada ?? aplican[0] ?? null

  const [asunto, setAsunto] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [historial, setHistorial] = useState<MensajeHistorial[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(true)

  useEffect(() => {
    if (!activa) {
      setAsunto('')
      setTexto('')
      return
    }
    const r = renderPlantilla(activa, ctx)
    setAsunto(r.asunto)
    setTexto(r.texto)
  }, [activa, ctx])

  const cargarHistorial = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${deal.id}/mensajes`)
      if (!res.ok) return // sin tabla (503) u otro error: no romper la ficha
      const data = await res.json()
      setHistorial(Array.isArray(data?.mensajes) ? data.mensajes : [])
    } catch {
      // silencioso: el historial es informativo
    } finally {
      setCargandoHistorial(false)
    }
  }, [deal.id])

  useEffect(() => {
    cargarHistorial()
  }, [cargarHistorial])

  const email = deal.cliente?.email?.trim() || ''
  const telefonoNorm = normalizarTelefono(deal.cliente?.telefono)
  const linkWhatsApp = telefonoNorm
    ? enlaceWhatsApp(deal.cliente?.telefono, texto)
    : null

  async function registrar(canal: 'email' | 'whatsapp') {
    const res = await fetch(`/api/deals/${deal.id}/mensajes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plantillaId: activa, canal, asunto, texto }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error || `Error ${res.status}`)
    }
    return data as { ok: boolean; aviso?: string }
  }

  async function enviarEmail() {
    if (!email || !texto.trim()) return
    setEnviando(true)
    try {
      const data = await registrar('email')
      showToast(
        data.aviso ? data.aviso : `Email enviado a ${email}`,
        data.aviso ? 'warning' : 'success'
      )
      cargarHistorial()
    } catch (err) {
      showToast((err as Error).message || 'No se pudo enviar el email', 'error')
    } finally {
      setEnviando(false)
    }
  }

  function onAbrirWhatsApp() {
    // El navegador abre wa.me en otra pestaña; aquí solo dejamos el registro.
    registrar('whatsapp')
      .then(() => {
        showToast('WhatsApp registrado en el historial', 'success')
        cargarHistorial()
      })
      .catch((err: Error) => {
        showToast(err.message || 'No se pudo registrar el WhatsApp', 'error')
      })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        Mensajes al cliente
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Plantillas según el estado del deal. Puedes editar el asunto y el texto
        antes de enviar.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {aplican.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setSeleccionada(id)}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              activa === id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {PLANTILLAS[id].titulo}
          </button>
        ))}
        {aplican.length === 0 && (
          <span className="text-sm text-gray-500">
            No hay plantillas sugeridas para el estado actual.
          </span>
        )}
      </div>

      {otras.length > 0 && (
        <label className="block text-sm text-gray-600 mb-4">
          Otras plantillas
          <select
            value={activa && otras.includes(activa) ? activa : ''}
            onChange={(e) =>
              setSeleccionada(
                e.target.value ? (e.target.value as PlantillaId) : null
              )
            }
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white"
          >
            <option value="">— Elegir una plantilla —</option>
            {otras.map((id) => (
              <option key={id} value={id}>
                {PLANTILLAS[id].titulo}
              </option>
            ))}
          </select>
        </label>
      )}

      {activa && (
        <div className="space-y-3">
          <label className="block text-sm text-gray-600">
            Asunto
            <input
              type="text"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="block text-sm text-gray-600">
            Mensaje
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 font-sans"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={enviarEmail}
              disabled={!email || enviando || !texto.trim()}
              className={BTN_PRIMARIO}
            >
              {enviando ? 'Enviando…' : 'Enviar por email'}
            </button>
            {linkWhatsApp ? (
              <a
                href={linkWhatsApp}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onAbrirWhatsApp}
                className={BTN_WHATSAPP}
              >
                Abrir WhatsApp
              </a>
            ) : (
              <button type="button" disabled className={BTN_DESHABILITADO}>
                Abrir WhatsApp
              </button>
            )}
            <span className="text-xs text-gray-500">
              {email ? `Email: ${email}` : 'El cliente no tiene email'}
              {' · '}
              {telefonoNorm
                ? `WhatsApp: +${telefonoNorm}`
                : 'El cliente no tiene un teléfono válido'}
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Historial</h3>
        {cargandoHistorial ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : historial.length === 0 ? (
          <p className="text-sm text-gray-500">
            Todavía no se ha enviado ningún mensaje a este cliente.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {historial.map((m) => (
              <li
                key={m.id}
                className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
              >
                <span className="text-gray-500 tabular-nums">
                  {formatearFechaHora(m.created_at)}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    m.canal === 'whatsapp'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {CANAL_LABEL[m.canal] ?? m.canal}
                </span>
                <span className="text-gray-900">
                  {tituloPlantilla(m.plantilla)}
                </span>
                <span className="text-gray-500">{m.destinatario ?? '—'}</span>
                {m.enviado_por && (
                  <span className="text-gray-400 text-xs">
                    por {m.enviado_por}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
