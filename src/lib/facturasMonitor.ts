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
