/**
 * Badge de estado del presupuesto (patrón dealEstado). El "vencido" se
 * calcula también en cliente: el cron sólo lo persiste una vez al día.
 */
import { hoyMadrid } from '@/lib/presupuesto/calculo'
import type { EstadoPresupuesto } from '@/lib/presupuesto/tipos'

export const ESTADO_PRESUPUESTO_LABEL: Record<EstadoPresupuesto, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  visto: 'Visto',
  aceptado: 'Aceptado',
  vencido: 'Vencido',
  anulado: 'Anulado',
}

export const ESTADO_PRESUPUESTO_CLASS: Record<EstadoPresupuesto, string> = {
  borrador: 'bg-slate-100 text-slate-700',
  enviado: 'bg-blue-100 text-blue-700',
  visto: 'bg-indigo-100 text-indigo-700',
  aceptado: 'bg-green-100 text-green-700',
  vencido: 'bg-amber-100 text-amber-700',
  anulado: 'bg-gray-200 text-gray-600',
}

/** enviado/visto con valido_hasta anterior a hoy → 'vencido'. */
export function estadoEfectivo(
  estado: EstadoPresupuesto,
  validoHasta: string | null | undefined,
  hoy: string = hoyMadrid()
): EstadoPresupuesto {
  if (
    (estado === 'enviado' || estado === 'visto') &&
    validoHasta &&
    validoHasta.slice(0, 10) < hoy
  ) {
    return 'vencido'
  }
  return estado
}

interface Props {
  estado: EstadoPresupuesto
  validoHasta?: string | null
  /** 'YYYY-MM-DD'; por defecto hoy (Europe/Madrid). */
  hoy?: string
  className?: string
}

export default function EstadoPresupuestoBadge({
  estado,
  validoHasta,
  hoy,
  className = '',
}: Props) {
  const e = estadoEfectivo(estado, validoHasta, hoy)
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_PRESUPUESTO_CLASS[e]} ${className}`}
    >
      {ESTADO_PRESUPUESTO_LABEL[e]}
    </span>
  )
}
