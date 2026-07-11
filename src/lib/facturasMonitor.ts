/**
 * Monitoreo unificado de facturas en Google Sheets (mismo spreadsheet):
 *  - "CB 2026": facturas de venta emitidas → deben estar todas (dedup por
 *    matrícula col E / referencia col C).
 *  - "Control Facturas 2026": recurrentes de proveedor; el flujo de n8n marca
 *    cada celda OK / s/archivar / descargar / pendiente / FALTA.
 *
 * Este módulo aísla las piezas PURAS (parseo/dedup) para testearlas sin pg ni
 * googleapis. Las lecturas con red viven en los endpoints /api/admin/*.
 */

import { normPlate, normRef } from '@/lib/costoBeneficioSheet'

// ---------------------------------------------------------------------------
// Facturas emitidas — constantes/rangos (puros, sin pg)
// ---------------------------------------------------------------------------

// Estados que representan una factura emitida real (deben figurar en CB 2026).
// El status real es 'ISSUED' (emitida por la app) o 'IMPORTED' (migrada/LEGACY);
// NO existe 'ACTIVE'.
export const EMITTED_STATUSES = ['ISSUED', 'IMPORTED'] as const

/**
 * Rango [from, to) para un año o un mes concreto (1..12). `to` es exclusivo.
 * Diciembre cierra en el 1-ene del año siguiente (borde clásico off-by-one).
 */
export function monthRange(year: number, month?: number): { from: string; to: string } {
  if (month && month >= 1 && month <= 12) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const to =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`
    return { from, to }
  }
  return { from: `${year}-01-01`, to: `${year + 1}-01-01` }
}

/**
 * Rango [from, to) para un trimestre fiscal (1..4). `to` es exclusivo.
 * Q4 cierra en el 1-ene del año siguiente (mismo borde que monthRange).
 */
export function quarterRange(year: number, quarter: number): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3 + 1
  const from = `${year}-${String(startMonth).padStart(2, '0')}-01`
  const endMonth = startMonth + 3
  const to = endMonth > 12 ? `${year + 1}-01-01` : `${year}-${String(endMonth).padStart(2, '0')}-01`
  return { from, to }
}

// ---------------------------------------------------------------------------
// CB 2026 — detección de facturas faltantes
// ---------------------------------------------------------------------------

export interface SheetInvoice {
  referencia: string | null
  matricula: string | null
}

/** ¿La factura ya está en la hoja? Match por matrícula (col E) o ref (col C), normalizadas. */
export function isInSheet(inv: SheetInvoice, rows: string[][]): boolean {
  const plate = inv.matricula ? normPlate(inv.matricula) : null
  const ref = inv.referencia ? normRef(inv.referencia) : null
  for (const row of rows) {
    const sheetPlate = row[4] ? normPlate(row[4]) : null
    const sheetRef = row[2] ? normRef(row[2]) : null
    if (plate && sheetPlate && plate === sheetPlate) return true
    if (ref && sheetRef && ref === sheetRef) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Control Facturas — parseo del estado por proveedor/mes
// ---------------------------------------------------------------------------

export interface ControlItem {
  mes: string
  proveedor: string
}
export interface ControlFacturasStatus {
  sArchivar: ControlItem[] // llegó el PDF por mail, falta guardarlo → accionable
  descargar: ControlItem[] // sólo aviso/link, hay que entrar al portal → accionable
}

const BAND_RE = /^\d\S*\s+trimestre\s+\d{4}$/i

/**
 * Parsea la grilla de "Control Facturas YYYY" y devuelve las celdas accionables.
 *
 * Estructura (por trimestre): fila banda ("1re trimestre 2026") · fila header
 * ("Proveedor" | mesB | mesC | mesD) · N filas de proveedor (nombre + 3 estados)
 * · fila en blanco. Al final una leyenda ("Referencia:", "OK", ...).
 *
 * Sólo recolecta celdas B/C/D con estado 's/archivar' o 'descargar' dentro de un
 * bloque válido (después de un header "Proveedor" y antes de la leyenda), así la
 * leyenda —que tiene 's/archivar' como etiqueta en col A— nunca se cuela.
 */
export function parseControlFacturasRows(rows: string[][]): ControlFacturasStatus {
  const sArchivar: ControlItem[] = []
  const descargar: ControlItem[] = []
  let months: string[] | null = null // [mesB, mesC, mesD] del bloque actual

  for (const row of rows) {
    const a = String(row?.[0] ?? '').trim()

    if (a.toLowerCase() === 'proveedor') {
      months = [String(row[1] ?? '').trim(), String(row[2] ?? '').trim(), String(row[3] ?? '').trim()]
      continue
    }
    // banda de trimestre o inicio de leyenda → cerramos el bloque
    if (BAND_RE.test(a) || a.toLowerCase() === 'referencia:') {
      months = null
      continue
    }
    if (!months || !a) continue

    // fila de proveedor: col A = nombre, B/C/D = estados
    for (let i = 0; i < 3; i++) {
      const status = String(row[i + 1] ?? '').trim()
      const mes = months[i]
      if (!mes) continue
      if (status === 's/archivar') sArchivar.push({ mes, proveedor: a })
      else if (status === 'descargar') descargar.push({ mes, proveedor: a })
    }
  }

  return { sArchivar, descargar }
}
