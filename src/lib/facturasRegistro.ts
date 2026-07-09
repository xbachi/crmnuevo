/**
 * Piezas puras del registro unificado de facturas (sin pg/googleapis, testeables).
 *
 * Categorías:
 *  - 'gestoria'       : recurrente (movistar/nagini/ionos/alquiler/…) → carpeta del MES
 *  - 'coche-servicio' : mecauto/fergo/world de un coche → carpeta del coche + mes gestoría
 *  - 'coche-compra'   : factura de compra del vehículo → carpeta del coche / compras
 *
 * El ruteo se calcula por la FECHA de la factura (no la de archivado) → nunca mal ubicada.
 */

export const CATEGORIAS = ['gestoria', 'coche-servicio', 'coche-compra'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export const QNAMES = ['1re trimestre', '2do trimestre', '3er trimestre', '4to trimestre'] as const
export const MES_NOM = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

export interface Periodo {
  anio: number | null
  trimestre: number | null // 1..4
  mes: number | null // 1..12
}

/** YYYY-MM-DD → {anio, trimestre, mes}. Todo null si la fecha es inválida. */
export function periodoFromDate(iso: string | null | undefined): Periodo {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  if (!m) return { anio: null, trimestre: null, mes: null }
  const anio = parseInt(m[1], 10)
  const mes = parseInt(m[2], 10)
  if (mes < 1 || mes > 12) return { anio, trimestre: null, mes: null }
  return { anio, trimestre: Math.floor((mes - 1) / 3) + 1, mes }
}

/** Ruta de la carpeta gestoría del mes en OneDrive. null si falta período. */
export function gestoriaFolder(anio: number | null, mes: number | null): string | null {
  if (!anio || !mes) return null
  const q = QNAMES[Math.floor((mes - 1) / 3)]
  return `GESTORIA/${anio}/${q}/Facturas/${MES_NOM[mes - 1]}`
}

export interface Destino {
  tipo: 'gestoria-mes' | 'coche' | 'sin-periodo'
  ruta: string | null // carpeta gestoría (OneDrive) cuando aplica
  matricula: string | null // carpeta del coche cuando aplica
  subcarpeta: string | null // 'compras' | 'servicios' dentro de la carpeta del coche
}

/**
 * Carpeta destino para una factura según categoría + matrícula + período.
 * Para coches devuelve matrícula + subcarpeta (la ruta física la resuelve el
 * consumidor: las carpetas por-coche viven en Google Drive, la gestoría en OneDrive).
 * Para gestoría igual archivamos una copia por mes.
 */
export function carpetaDestino(cat: Categoria, matricula: string | null, anio: number | null, mes: number | null): Destino {
  const gest = gestoriaFolder(anio, mes)
  if (cat === 'coche-compra') return { tipo: 'coche', ruta: gest, matricula, subcarpeta: 'compras' }
  if (cat === 'coche-servicio') return { tipo: 'coche', ruta: gest, matricula, subcarpeta: 'servicios' }
  // gestoria
  return { tipo: gest ? 'gestoria-mes' : 'sin-periodo', ruta: gest, matricula: null, subcarpeta: null }
}

export const normPlate = (s: string) => s.replace(/[\s.\-]/g, '').toUpperCase()
