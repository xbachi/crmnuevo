/**
 * Dos columnas del presupuesto (sin / con Garantía Premium) + cuotas + checks.
 * Presentacional puro: lo usan la vista previa del CRM y la página pública.
 */
import { formatearEuros } from '@/lib/plantillasMensajes'
import type {
  ChequeoPresupuesto,
  ColumnaCalculo,
  ResultadoCalculo,
} from '@/lib/presupuesto/tipos'

/** Aviso interno del CRM: nunca se enseña al cliente. */
export const AVISO_INTERNO = 'FINANCIA MÁS 70%'

export function avisosPublicos(calculo: ResultadoCalculo): string[] {
  return calculo.avisos.filter((a) => a !== AVISO_INTERNO)
}

export function cuotaTexto(cuota: number | null): string {
  return cuota == null ? '—' : `${cuota.toLocaleString('es-ES')} €/mes`
}

interface Props {
  calculo: ResultadoCalculo
  /** Menos aire (card del CRM). */
  compacto?: boolean
  /** Página pública: oculta los avisos internos. */
  publico?: boolean
}

function Columna({
  col,
  checks,
  compacto,
}: {
  col: ColumnaCalculo
  checks: ChequeoPresupuesto[]
  compacto: boolean
}) {
  const py = compacto ? 'py-1' : 'py-1.5'
  const lineas = col.lineas.filter((l) => l.visible)
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <h3 className="bg-primary-700 text-white text-center font-semibold uppercase tracking-wide text-sm py-2 px-3">
        {col.titulo}
      </h3>
      <dl className="px-3 pt-1 text-sm">
        {lineas.map((l) => {
          const subtotal = l.tipo === 'subtotal'
          const total = l.tipo === 'total'
          return (
            <div
              key={l.clave}
              className={`flex items-baseline justify-between gap-3 ${py} ${
                subtotal ? '-mx-3 px-3 bg-slate-100 font-semibold' : ''
              } ${
                total
                  ? 'mt-1 border-t-2 border-primary-700 font-bold text-primary-700 text-base'
                  : ''
              }`}
            >
              <dt className={total ? '' : 'text-slate-700'}>
                {l.etiqueta}
                {l.subtitulo ? (
                  <span className="block text-xs font-normal text-slate-500">
                    {l.subtitulo}
                  </span>
                ) : null}
              </dt>
              <dd className="tabular-nums whitespace-nowrap">
                {l.sinImporte ? '' : formatearEuros(l.importe)}
              </dd>
            </div>
          )
        })}
      </dl>

      {col.cuotas.length > 0 ? (
        <div className="px-3 pb-3 pt-2 border-t border-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Cuota mensual orientativa
          </p>
          <table className="w-full text-sm">
            <tbody>
              {col.cuotas.map((c) => (
                <tr key={c.plazo}>
                  <td className={`${py} text-slate-600`}>{c.plazo} meses</td>
                  <td className={`${py} text-right font-semibold tabular-nums`}>
                    {cuotaTexto(c.cuota)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {col.desde != null ? (
            <div className="mt-2 flex items-center justify-between rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
              <span className="text-sm text-slate-700">Desde</span>
              <span className="text-lg font-bold text-primary-700 tabular-nums">
                {cuotaTexto(col.desde)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {checks.length > 0 ? (
        <ul className="px-3 pb-3 pt-2 space-y-1 text-sm border-t border-slate-100">
          {checks.map((c) => (
            <li key={c.texto} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className={`mt-0.5 font-bold ${
                  c.ok ? 'text-primary-600' : 'text-slate-400'
                }`}
              >
                {c.ok ? '✓' : '✕'}
              </span>
              <span className={c.ok ? 'text-slate-800' : 'text-slate-500'}>
                {c.texto}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default function PresupuestoTabla({
  calculo,
  compacto = false,
  publico = false,
}: Props) {
  const avisos = publico ? avisosPublicos(calculo) : calculo.avisos
  return (
    <div>
      <div
        className={`grid grid-cols-1 md:grid-cols-2 ${
          compacto ? 'gap-3' : 'gap-4'
        }`}
      >
        <Columna
          col={calculo.columnas.sin_premium}
          checks={calculo.checks.sin_premium}
          compacto={compacto}
        />
        <Columna
          col={calculo.columnas.premium}
          checks={calculo.checks.premium}
          compacto={compacto}
        />
      </div>
      {avisos.length > 0 ? (
        <ul className="mt-3 space-y-0.5 text-xs text-red-600">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
