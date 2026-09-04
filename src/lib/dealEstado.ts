/**
 * Estados canónicos del deal (flujo de venta) + label y clase de badge
 * únicos. Antes había 7 copias de `getEstadoColor` con colores distintos para
 * el mismo estado y el valor se mostraba como facturado/FACTURADO/Facturado.
 */

export const DEAL_ESTADOS = [
  'nuevo',
  'reservado',
  'vendido',
  'facturado',
  'anulado',
] as const

export type DealEstado = (typeof DEAL_ESTADOS)[number]

/** Normaliza casing/espacios. Valor no reconocible → 'nuevo'. */
export function normalizarDealEstado(v: string | null | undefined): DealEstado {
  const s = String(v ?? '')
    .toLowerCase()
    .trim()
  return (DEAL_ESTADOS as readonly string[]).includes(s)
    ? (s as DealEstado)
    : 'nuevo'
}

export const DEAL_ESTADO_LABEL: Record<DealEstado, string> = {
  nuevo: 'Nuevo',
  reservado: 'Reservado',
  vendido: 'Vendido',
  facturado: 'Facturado',
  anulado: 'Anulado',
}

export const DEAL_ESTADO_CLASS: Record<DealEstado, string> = {
  nuevo: 'bg-blue-100 text-blue-700',
  reservado: 'bg-yellow-100 text-yellow-700',
  vendido: 'bg-green-100 text-green-700',
  facturado: 'bg-purple-100 text-purple-700',
  anulado: 'bg-gray-200 text-gray-600',
}

export function getDealEstadoClass(v: string | null | undefined): string {
  return DEAL_ESTADO_CLASS[normalizarDealEstado(v)]
}

export function getDealEstadoLabel(v: string | null | undefined): string {
  return DEAL_ESTADO_LABEL[normalizarDealEstado(v)]
}
