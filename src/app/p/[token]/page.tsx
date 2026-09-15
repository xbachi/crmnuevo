/**
 * Página pública del presupuesto (/p/[token]). Server component sin sesión:
 * sólo muestra lo que expone `aPublico` (sin ids, PII de contacto ni params).
 */
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import PresupuestoTabla from '@/components/presupuesto/PresupuestoTabla'
import { leerFicha } from '@/lib/fichaComercial'
import { formatearFecha } from '@/lib/plantillasMensajes'
import { cargarParametros, leerPorToken } from '@/lib/presupuesto/repo'
import {
  aPublico,
  cargarVehiculoPresupuesto,
  type PresupuestoPublico,
} from '@/lib/presupuesto/servicio'
import MarcarVisto from './MarcarVisto'

export const dynamic = 'force-dynamic'

const RE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/

type Params = { params: Promise<{ token: string }> }

async function cargar(token: string): Promise<PresupuestoPublico | null> {
  if (!RE_TOKEN.test(token)) return null
  const p = await leerPorToken(token)
  if (!p || p.estado === 'anulado') return null
  const [v, f, parametros] = await Promise.all([
    cargarVehiculoPresupuesto(p.vehiculo_id),
    leerFicha(p.vehiculo_id),
    cargarParametros(),
  ])
  if (!v) return null
  return aPublico(p, v, f, parametros)
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params
  const p = RE_TOKEN.test(token) ? await leerPorToken(token) : null
  return {
    title: p
      ? `Presupuesto ${p.numero} · Seven Cars`
      : 'Presupuesto · Seven Cars',
    robots: { index: false, follow: false },
  }
}

function chips(v: PresupuestoPublico['vehiculo']): string[] {
  const out: string[] = []
  if (v.matricula) out.push(`Matrícula ${v.matricula}`)
  if (v.fechaMatriculacion) {
    out.push(`Matriculación ${formatearFecha(v.fechaMatriculacion)}`)
  }
  if (v.kms != null) out.push(`${v.kms.toLocaleString('es-ES')} km`)
  if (v.color) out.push(v.color)
  if (v.combustible) out.push(v.combustible)
  if (v.caja) out.push(v.caja)
  if (v.motor_cv != null) out.push(`${v.motor_cv} CV`)
  if (v.cubicaje != null) out.push(`${v.cubicaje} cc`)
  return out
}

export default async function PresupuestoPublicoPage({ params }: Params) {
  const { token } = await params
  const p = await cargar(token)
  if (!p) notFound()

  const { calculo, vehiculo } = p
  const textoWhatsApp = `Hola, me interesa el presupuesto ${p.numero} del ${vehiculo.nombre} (${vehiculo.matricula}).`
  const enlaceWhatsApp = p.whatsapp.telefono
    ? `https://wa.me/${p.whatsapp.telefono}?text=${encodeURIComponent(textoWhatsApp)}`
    : null
  const garantia = calculo.garantia.textoOficial

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 pb-24">
      <MarcarVisto token={token} />

      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Image
            src="/logocontrato.png"
            alt="Seven Cars"
            width={140}
            height={56}
            className="h-12 sm:h-14 w-auto"
            priority
          />
          <div className="text-right text-xs text-slate-500 leading-5">
            <p className="text-sm font-bold text-primary-700 uppercase tracking-wide">
              Presupuesto
            </p>
            <p>
              Nº{' '}
              <span className="font-semibold text-slate-800">{p.numero}</span>
            </p>
            <p>
              Fecha{' '}
              <span className="font-semibold text-slate-800">
                {formatearFecha(p.fecha)}
              </span>
            </p>
            <p>
              Válido hasta{' '}
              <span className="font-semibold text-slate-800">
                {formatearFecha(p.validoHasta)}
              </span>
            </p>
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-primary-500 to-primary-700" />
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {p.vencido ? (
          <div
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm px-4 py-3"
          >
            Este presupuesto ha vencido. Escríbenos y te preparamos uno
            actualizado.
          </div>
        ) : null}

        <section>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Hola {p.cliente.nombre},
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            aquí tienes tu presupuesto para el {vehiculo.nombre}.{' '}
            {calculo.textos.validez}.
          </p>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-primary-600 overflow-hidden">
          <div className="flex flex-col sm:flex-row">
            {vehiculo.url_imagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={vehiculo.url_imagen}
                alt={vehiculo.nombre}
                className="w-full sm:w-64 h-48 sm:h-auto object-cover"
              />
            ) : null}
            <div className="p-4 space-y-2">
              <h2 className="text-lg font-bold text-gray-900">
                {vehiculo.nombre}
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {chips(vehiculo).map((c) => (
                  <li
                    key={c}
                    className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs"
                  >
                    {c}
                  </li>
                ))}
              </ul>
              {garantia ? (
                <p className="text-sm font-medium text-primary-700">
                  {garantia}
                </p>
              ) : null}
              {vehiculo.mantenimientos ? (
                <p className="text-xs text-slate-500 whitespace-pre-line">
                  {vehiculo.mantenimientos}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <PresupuestoTabla calculo={calculo} publico />

        <p className="text-[11px] leading-relaxed text-slate-500">
          {calculo.textos.legal}
        </p>

        <footer className="text-center text-xs text-slate-400 pt-2 border-t border-slate-200">
          Gracias por su confianza · Seven Cars Motors S.L.
        </footer>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 bg-white/95 backdrop-blur border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex gap-3">
          <a
            href={p.reservaUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-center px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"
          >
            Reservar
          </a>
          {enlaceWhatsApp ? (
            <a
              href={enlaceWhatsApp}
              target="_blank"
              rel="noreferrer"
              className="flex-1 text-center px-4 py-2.5 rounded-lg border border-primary-600 text-primary-700 text-sm font-semibold hover:bg-primary-50"
            >
              WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </main>
  )
}
