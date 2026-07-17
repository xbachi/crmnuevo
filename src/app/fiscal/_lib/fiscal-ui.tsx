'use client'

/**
 * Piezas compartidas por las dos pantallas de /fiscal (tipos del contrato de la
 * API, dominios y badges).
 *
 * Los dominios NO se redeclaran acá: se importan de `@/lib/facturaFiscal` y
 * `@/lib/facturasRegistro`, que son los mismos módulos puros que usa la API para
 * validar contra los CHECK de la DB. Si mañana se agrega un tipo de operación, el
 * select lo muestra solo. Una copia a mano en la UI se desincroniza y ofrece
 * valores que el INSERT rechaza.
 */

import { formatCurrency, formatDate } from '@/lib/utils'

export type { LineaFiscal } from '@/lib/facturaFiscal'

// ── Contrato de la API ──────────────────────────────────────────────────────

export interface Proveedor {
  id: number
  nombre: string
  nif: string | null
  nifValido: boolean | null
  pais: string | null
  aliases: string[]
  iban: string | null
  categoriaDefecto: string | null
  tipoOperacionDefecto: string | null
  deducibleDefecto: string | null
  subcategoriaDefecto: string | null
  validacionAuto: boolean
  plantillaExtraccion: unknown
  activo: boolean
  /** Solo vienen en el listado, no en la ficha embebida del detalle. */
  facturas?: number
  sinNif?: boolean
}

export interface RegistroItem {
  id: number
  proveedor: string | null
  proveedorId: number | null
  categoria: string | null
  numeroFactura: string | null
  importe: number | null
  fechaFactura: string | null
  fechaOperacion: string | null
  anio: number | null
  trimestre: number | null
  mes: number | null
  matricula: string | null
  nombreArchivo: string | null
  ruta: string | null
  estado: string
  baseTotal: number | null
  cuotaIvaTotal: number | null
  nifProveedor: string | null
  nifValido: boolean | null
  tipoOperacion: string | null
  deducible: string | null
  deduciblePct: number | null
  subcategoriaGasto: string | null
  datosIncompletos: boolean
  posibleDuplicado: boolean
  duplicadoDe: number | null
  tardia: boolean
  extraccionMetodo: string | null
  extraccionConfianza: number | null
  anioDeclarado: number | null
  trimestreDeclarado: number | null
  /** En el listado es un CONTEO; en el detalle es el array (ver RegistroDetalle). */
  lineas: number
}

export interface LineaDetalle {
  id: number
  orden: number
  tipoLinea: string
  tipoIva: number | null
  base: number | null
  cuota: number | null
  retencionPct: number | null
  concepto: string | null
  deducible: string | null
}

export interface HistorialItem {
  id: number
  accion: string
  cambios: Record<string, unknown>
  motivo: string | null
  actor: string
  createdAt: string
}

/**
 * `proveedor` acá NO es el string del listado: el GET del detalle lo pisa con la
 * ficha del proveedor (o null si la factura no tiene proveedor_id). Confundirlos
 * renderiza "[object Object]".
 */
export interface RegistroDetalle extends Omit<RegistroItem, 'lineas' | 'proveedor'> {
  proveedor: Proveedor | null
  lineas: LineaDetalle[]
  extraccionRaw: unknown
  validadaPor: string | null
  validadaAt: string | null
  estadoPago: string | null
  historial: HistorialItem[]
}

export interface RegistroListResponse {
  total: number
  items: RegistroItem[]
  resumen: { porEstado: Record<string, number> }
}

// ── Estados ─────────────────────────────────────────────────────────────────

/**
 * Orden = el ciclo de vida real de una factura, para que la botonera se lea como
 * un embudo. `declarada`/`en-borrador` las pone el cierre trimestral, no el
 * usuario: se muestran pero no se ofrecen como acción.
 */
export const ESTADOS = [
  'registrada',
  'extraida',
  'pendiente-validar',
  'validada',
  'en-borrador',
  'declarada',
  'rectificada',
  'anulada',
] as const

export const ESTADO_LABEL: Record<string, { label: string; className: string }> = {
  registrada: { label: 'Registrada', className: 'bg-gray-100 text-gray-700' },
  extraida: { label: 'Extraída', className: 'bg-blue-100 text-blue-800' },
  'pendiente-validar': { label: 'Pendiente validar', className: 'bg-amber-100 text-amber-800' },
  validada: { label: 'Validada', className: 'bg-green-100 text-green-800' },
  'en-borrador': { label: 'En borrador', className: 'bg-indigo-100 text-indigo-800' },
  declarada: { label: 'Declarada', className: 'bg-purple-100 text-purple-800' },
  rectificada: { label: 'Rectificada', className: 'bg-orange-100 text-orange-800' },
  anulada: { label: 'Anulada', className: 'bg-red-100 text-red-800' },
}

/** Estados que hacen inmutable el registro (PATCH → 409 REGISTRO_INMUTABLE). */
export const ESTADOS_INMUTABLES = ['declarada', 'rectificada', 'anulada']

export function EstadoBadge({ estado }: { estado: string }) {
  const e = ESTADO_LABEL[estado] ?? { label: estado, className: 'bg-gray-100 text-gray-700' }
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${e.className}`}
    >
      {e.label}
    </span>
  )
}

/**
 * NIF tri-estado. `null` (sin verificar) NO es lo mismo que `false` (inválido):
 * uno es trabajo pendiente, el otro es un dato que está mal. Pintarlos igual
 * esconde justamente el que hay que arreglar.
 */
export function NifBadge({ nif, valido }: { nif: string | null; valido: boolean | null }) {
  if (!nif) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
        Sin NIF
      </span>
    )
  }
  const estilo =
    valido === true
      ? 'bg-green-100 text-green-800'
      : valido === false
        ? 'bg-red-100 text-red-800'
        : 'bg-gray-100 text-gray-600'
  const sufijo = valido === true ? '' : valido === false ? ' · inválido' : ' · sin verificar'
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${estilo}`}
    >
      <span className="font-mono">{nif}</span>
      {sufijo}
    </span>
  )
}

// ── Formato ─────────────────────────────────────────────────────────────────

export function fmtImporte(v: number | null | undefined): string {
  if (v == null) return '—'
  return formatCurrency(v)
}

export function fmtFecha(v: string | null | undefined): string {
  if (!v) return '—'
  return formatDate(v)
}

/** `2026-05-10T00:00:00.000Z` → `2026-05-10` para un <input type="date">. */
export function aInputDate(v: string | null | undefined): string {
  if (!v) return ''
  return String(v).slice(0, 10)
}

export function fmtFechaHora(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Errores de la API ───────────────────────────────────────────────────────

export interface ApiError {
  error?: string
  code?: string
  errores?: string[]
  cuadre?: { ok: boolean; errores: string[] }
  proveedor?: { id: number; nombre: string }
  aviso?: string
}

/**
 * Los mensajes de la API ya vienen redactados en español y explican el porqué:
 * se muestran tal cual en vez de traducirlos a un genérico ("Error 409").
 */
export function mensajeError(json: ApiError, status?: number): string {
  if (json?.error) return json.error
  if (json?.errores?.length) return json.errores.join('; ')
  return status ? `Error ${status}` : 'Error inesperado'
}
