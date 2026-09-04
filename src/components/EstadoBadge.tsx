import { getDealEstadoClass, getDealEstadoLabel } from '@/lib/dealEstado'
import {
  getVehiculoEstadoClass,
  getVehiculoEstadoLabel,
} from '@/lib/vehiculoEstado'

export interface EstadoBadgeProps {
  entidad: 'deal' | 'vehiculo'
  valor: string | null | undefined
  size?: 'sm' | 'md'
  className?: string
}

const SIZE_CLASS: Record<NonNullable<EstadoBadgeProps['size']>, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
}

/** Único badge de estado para deals y vehículos: clase y label canónicos. */
export function EstadoBadge({
  entidad,
  valor,
  size = 'sm',
  className = '',
}: EstadoBadgeProps) {
  const clase =
    entidad === 'deal'
      ? getDealEstadoClass(valor)
      : getVehiculoEstadoClass(valor)
  const label =
    entidad === 'deal'
      ? getDealEstadoLabel(valor)
      : getVehiculoEstadoLabel(valor)
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full font-medium ${SIZE_CLASS[size]} ${clase} ${className}`.trim()}
    >
      {label}
    </span>
  )
}

export default EstadoBadge
