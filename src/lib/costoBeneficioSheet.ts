/**
 * Piezas puras de la sincronización con la hoja "CB 2026" (Google Sheets).
 *
 * Extraídas de costoBeneficio.ts para testearlas sin arrastrar pg ni googleapis.
 * Comportamiento idéntico: es el mismo código, sólo movido aquí.
 *
 * Cubre lo más frágil del flujo:
 *  - dedup ("nunca duplicar": matrícula col E / referencia col C, normalizadas)
 *  - ubicación de la fila del coche (banda del mes + fila destino 1-based)
 *  - fórmulas con locale es_ES (separador ';', decimal ',')
 */

export const CN_INFORME = 120

export const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const

// Locale es_ES: separador de argumentos ';' y decimal ',' (validado en vivo).
export const MES_FORMULA = (r: number) =>
  `=IF(A${r}="";"";CHOOSE(MONTH(A${r});"ENERO";"FEBRERO";"MARZO";"ABRIL";"MAYO";"JUNIO";"JULIO";"AGOSTO";"SEPTIEMBRE";"OCTUBRE";"NOVIEMBRE";"DICIEMBRE"))`
export const COSTE_FORMULA = (r: number) => `=SUM(G${r}:M${r})`
// IVA sobre el margen (misma convención que la planilla "2026": (precio - coste) * 21%),
// uniforme para iva 21 y rebu.
export const IVA_FORMULA = (r: number) => `=IF(O${r}="";"";(O${r}-N${r})*0,21)`
export const MARGEN_FORMULA = (r: number) => `=IF(O${r}="";"";O${r}-N${r}-P${r})`
export const PCT_FORMULA = (r: number) => `=IF(N${r}=0;"";Q${r}/N${r})`
export const SUBTOTAL = (col: string, mes: string) =>
  `=SUMIFS(${col}$2:${col}$400;$B$2:$B$400;"${mes}")`

/** ISO (YYYY-MM-DD) → dd/mm/yyyy; devuelve la entrada intacta si no matchea. */
export function toEsDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export const normPlate = (s: string) => s.replace(/[\s.\-]/g, '').toUpperCase()
export const normRef = (s: string) => s.replace(/[#\s.\-]/g, '').toUpperCase()
// Nº de factura: sólo saca espacios (conserva '/' y guiones, que son parte del número).
export const normInvoice = (s: string) => s.replace(/\s/g, '').toUpperCase()

/** Índice de mes 0..11 a partir de un ISO YYYY-MM-DD, o -1 si es inválido. */
export function monthIndexFromIso(iso: string): number {
  const idx = parseInt(String(iso).slice(5, 7), 10) - 1
  return idx >= 0 && idx <= 11 ? idx : -1
}

export function regimenFromType(invoiceType: string): 'rebu' | 'iva 21' {
  return invoiceType === 'REBU' ? 'rebu' : 'iva 21'
}

/** Compra = precioCompra + porte (null sólo si ambos faltan). */
export function computeCompra(
  precioCompra: number | null,
  gastosTransporte: number | null
): number | null {
  if (precioCompra == null && gastosTransporte == null) return null
  return (precioCompra ?? 0) + (gastosTransporte ?? 0)
}

// ---------------------------------------------------------------------------
// Reconciliación CB ↔ CRM (costos): qué celdas de una fila hay que actualizar.
// ---------------------------------------------------------------------------

export interface CbCosts {
  precioCompra: number | null
  gastosTransporte: number | null
  gastosMecanica: number | null
  gastosPintura: number | null
  gastosLimpieza: number | null
  gastosOtros: number | null
}
export interface CbCellUpdate {
  col: string
  value: number | '' // '' = limpiar la celda
  prev: string // contenido crudo previo de la celda (para audit log previo→nuevo)
}

/** Parsea una celda con formato es_ES ("11.435", "90,75") a número, o null. */
export function parseEsCell(s: string | undefined): number | null {
  const t = String(s ?? '').trim()
  if (!t) return null
  const n = parseFloat(t.replace(/\./g, '').replace(/,/g, '.'))
  return Number.isNaN(n) ? null : n
}

/**
 * Dado el estado actual de una fila de coche (A..S) y los costos del CRM,
 * devuelve las celdas a actualizar para reflejar el CRM.
 *
 * Columnas de costo: G=compra (precioCompra+porte), J=taller, K=chapa,
 * L=limpieza, M=itv/otros. H (porte) DEBE estar siempre en blanco (el porte va
 * dentro de G) — en 'overwrite' se limpia si quedó con valor (corrige el bug
 * histórico de doble conteo del porte).
 *
 * mode 'fill': sólo rellena celdas VACÍAS (no pisa nada; no toca H).
 * mode 'overwrite': adem��s corrige valores distintos al CRM y limpia H.
 */
export function reconcileCostCells(
  row: string[],
  costs: CbCosts,
  mode: 'fill' | 'overwrite'
): CbCellUpdate[] {
  const raw = (i: number) => String(row[i] ?? '').trim()
  const near = (a: number | null, b: number | null) =>
    a != null && b != null && Math.abs(a - b) < 0.01

  const targets: { col: string; idx: number; val: number | null }[] = [
    { col: 'G', idx: 6, val: computeCompra(costs.precioCompra, costs.gastosTransporte) },
    { col: 'J', idx: 9, val: costs.gastosMecanica },
    { col: 'K', idx: 10, val: costs.gastosPintura },
    { col: 'L', idx: 11, val: costs.gastosLimpieza },
    { col: 'M', idx: 12, val: costs.gastosOtros },
  ]
  const updates: CbCellUpdate[] = []
  for (const t of targets) {
    if (t.val == null || t.val === 0) continue
    if (mode === 'fill') {
      if (raw(t.idx) === '') updates.push({ col: t.col, value: t.val, prev: String(row[t.idx] ?? '') })
    } else if (!near(parseEsCell(row[t.idx]), t.val)) {
      updates.push({ col: t.col, value: t.val, prev: String(row[t.idx] ?? '') })
    }
  }
  if (mode === 'overwrite' && raw(7) !== '') updates.push({ col: 'H', value: '', prev: String(row[7] ?? '') })
  return updates
}

export const isBand = (row: string[] | undefined) =>
  !!row && (MESES as readonly string[]).includes(String(row[0] ?? '').trim().toUpperCase())
export const isSubtotal = (row: string[] | undefined) =>
  !!row && /^TOTAL\b/i.test(String(row?.[3] ?? '').trim())

export interface Duplicate {
  kind: 'invoice'
  row: number // 1-based
}

/**
 * Busca un duplicado por NÚMERO DE FACTURA (col S, idx 18) en toda la hoja.
 * Dedup autoritativo: dos facturas del mismo coche (misma matrícula) NO son
 * duplicados entre sí; el mismo nº de factura repetido SÍ lo es. Ignora filas
 * de banda de mes y de subtotal. Devuelve el primer match o null.
 */
export function findDuplicate(
  rows: string[][],
  invoiceNumber: string | null
): Duplicate | null {
  const inv = invoiceNumber ? normInvoice(invoiceNumber) : null
  if (!inv) return null
  for (let i = 0; i < rows.length; i++) {
    if (isBand(rows[i]) || isSubtotal(rows[i])) continue
    const s = String(rows[i]?.[18] ?? '').trim()
    if (s && normInvoice(s) === inv) return { kind: 'invoice', row: i + 1 }
  }
  return null
}

export interface InsertionPlan {
  bandRow: number // 1-based, fila de la banda del mes
  targetRow: number // 1-based, fila donde irá el coche
  createBand: boolean // true si hay que crear la banda (mes nuevo)
}

/**
 * Decide dónde insertar la fila del coche para un mes dado.
 *  - Si la banda del mes existe: tras el último coche del mes (antes del subtotal).
 *  - Si no: crea banda nueva al final (dejando una fila en blanco de separación).
 * Todo en coordenadas 1-based, como espera la API de Sheets.
 */
export function planInsertion(rows: string[][], mes: string): InsertionPlan {
  const mesU = mes.trim().toUpperCase()
  let bandRow = -1
  for (let i = 0; i < rows.length; i++) {
    if (isBand(rows[i]) && String(rows[i][0]).trim().toUpperCase() === mesU) {
      bandRow = i + 1
      break
    }
  }

  if (bandRow > 0) {
    let lastCar = bandRow
    for (let i = bandRow; i < rows.length; i++) {
      if (isSubtotal(rows[i]) || (isBand(rows[i]) && i + 1 !== bandRow)) break
      if (String(rows[i]?.[2] ?? '').trim()) lastCar = i + 1 // col C con ref
    }
    return { bandRow, targetRow: lastCar + 1, createBand: false }
  }

  // crear banda nueva al final
  let lastContent = rows.length
  while (
    lastContent > 0 &&
    !(rows[lastContent - 1] ?? []).some((c) => String(c ?? '').trim())
  ) {
    lastContent--
  }
  const newBand = lastContent + 2 // deja una fila en blanco
  return { bandRow: newBand, targetRow: newBand + 1, createBand: true }
}
