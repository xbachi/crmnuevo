/**
 * Piezas puras del upsert de vehículos en las hojas COMPRAS / Ventas-Sevencars
 * (sin pg ni googleapis, para testear en aislamiento).
 *
 * Reglas duras:
 *  - Sólo se escriben columnas mapeadas; TOTAL/GANANCI (fórmulas) y los
 *    ESTADO de las hojas (ubicación física, basura) están en la deny-list.
 *  - Un valor vacío del CRM NUNCA produce una escritura (null = desconocido,
 *    no "borrar"): si no, el cron vaciaría la checklist antes de importarla.
 *  - La marca VENDIDO sólo se pone, nunca se quita.
 *  - La columna de referencia es SIEMPRE la A (la cabecera es "R", "SI",
 *    "751", "REFERENCIA"... según la pestaña).
 */
import { normalizarMatricula, normalizarReferencia } from '@/lib/normalizacion'
import { interpretarFechaCorta } from '@/lib/fechaCorta'
import { normalizarEstado } from '@/lib/vehiculoEstado'
import type { PasoVehiculo } from '@/lib/vehiculoPasos'

export type Hoja = 'VENTAS' | 'COMPRAS'
export type Pestana = 'Expo' | 'Deposito' | 'R' | 'Compras'
export type ClavePestana =
  | 'VENTAS/Expo'
  | 'VENTAS/Deposito'
  | 'VENTAS/R'
  | 'COMPRAS/Compras'
  | 'COMPRAS/Deposito'
  | 'COMPRAS/R'

export interface VehiculoSheets {
  id: number
  referencia: string | null
  tipo: string | null
  marca?: string | null
  modelo?: string | null
  matricula?: string | null
  bastidor?: string | null
  kms?: number | string | null
  estado?: string | null
  fechaMatriculacion?: unknown
  fechaCompra?: unknown
  precioCompra?: number | string | null
  gastosTransporte?: number | string | null
  segundaLlave?: string | null
  carpeta?: string | null
  master?: string | null
  hojasA?: string | null
  documentacion?: string | null
  itv?: string | null
  seguro?: string | null
  proveedor?: string | null
  abonado?: string | null
  comprobante?: string | null
  porteSolicitado?: string | null
  recibido?: boolean | null
  recibidoTexto?: string | null
  recibidoFecha?: unknown
  createdAt?: unknown
}

export interface CtxVehiculoSheets {
  vehiculo: VehiculoSheets
  pasos: Partial<
    Record<PasoVehiculo, { texto: string | null; fecha: string | null }>
  >
  deposito?: { precio_venta: number | string | null } | null
  deal?: {
    importeTotal: number | string | null
    clienteNombre: string | null
  } | null
}

export type ValorCelda = string | number
export type Getter = (ctx: CtxVehiculoSheets) => ValorCelda | null

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export function texto(v: unknown): string | null {
  if (v == null) return null
  // Columnas booleanas heredadas (p. ej. Vehiculo.recibido): true = "SI", false = desconocido.
  if (typeof v === 'boolean') return v ? 'SI' : null
  const s = String(v).trim()
  return s ? s : null
}

export function titleCase(v: unknown): string | null {
  const s = texto(v)
  if (!s) return null
  return s
    .split(/(\s+|[-/])/)
    .map((tok) =>
      /^\p{Lu}{1,3}$/u.test(tok)
        ? tok
        : tok.toLowerCase().replace(/^\p{L}/u, (l) => l.toUpperCase())
    )
    .join('')
}

export function fmtNumero(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = parseNumeroCelda(String(v))
  return n
}

/** Número > 0; 0 / negativo = desconocido en el CRM (no se escribe). */
export function fmtNumeroPositivo(v: unknown): number | null {
  const n = fmtNumero(v)
  return n != null && n > 0 ? n : null
}

/** Date / ISO / 'YYYY-MM-DD' → 'dd/mm/yyyy'. */
export function fmtFecha(v: unknown): string | null {
  if (v == null || v === '') return null
  let iso: string | null = null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    iso = `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`
  } else {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v).trim())
    if (m) iso = `${m[1]}-${m[2]}-${m[3]}`
  }
  if (!iso) return null
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Año de referencia para fechas cortas: fechaCompra ?? createdAt ?? hoy. */
export function anioReferencia(v: VehiculoSheets): number {
  for (const f of [v.fechaCompra, v.createdAt]) {
    const s = fmtFecha(f)
    if (s) return parseInt(s.slice(6, 10), 10)
  }
  return new Date().getFullYear()
}

/** Cabecera → clave: mayúsculas, sin acentos, sólo alfanuméricos. */
export function claveHeader(h: unknown): string {
  return String(h ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function letraColumna(idx: number): string {
  let n = idx + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// ---------------------------------------------------------------------------
// Mapeo declarativo
// ---------------------------------------------------------------------------

/** Referencia canónica del vehículo ('#1088', '#D-02'); '#'+texto si no se interpreta. */
export function referenciaCanonica(
  v: Pick<VehiculoSheets, 'referencia' | 'tipo'>
): string | null {
  return (
    normalizarReferencia(v.referencia, v.tipo) ??
    (texto(v.referencia)
      ? `#${String(v.referencia).trim().replace(/^#/, '')}`
      : null)
  )
}
const ref: Getter = ({ vehiculo: v }) => referenciaCanonica(v)
const marca: Getter = ({ vehiculo: v }) => titleCase(v.marca)
const modelo: Getter = ({ vehiculo: v }) => titleCase(v.modelo)
const matricula: Getter = ({ vehiculo: v }) =>
  texto(normalizarMatricula(v.matricula))
const bastidor: Getter = ({ vehiculo: v }) =>
  texto(v.bastidor)?.toUpperCase() ?? null
const kms: Getter = ({ vehiculo: v }) => fmtNumeroPositivo(v.kms)
const fechaMatr: Getter = ({ vehiculo: v }) => fmtFecha(v.fechaMatriculacion)
const fechaCompra: Getter = ({ vehiculo: v }) => fmtFecha(v.fechaCompra)
const campo =
  (k: keyof VehiculoSheets): Getter =>
  ({ vehiculo: v }) =>
    texto(v[k])
const paso =
  (p: PasoVehiculo): Getter =>
  ({ pasos }) =>
    texto(pasos[p]?.texto)

const CHECKLIST_VEHICULO: Record<string, Getter> = {
  CARPETA: campo('carpeta'),
  MASTER: campo('master'),
  HOJASA: campo('hojasA'),
  DOCU: campo('documentacion'),
  ITV: campo('itv'),
  SEGURO: campo('seguro'),
}
const CHECKLIST_PASOS: Record<string, Getter> = {
  REVIINIC: paso('REVI_INIC'),
  MECAUTO: paso('MECAUTO'),
  REVIPINTURA: paso('REVI_PINTURA'),
  PINTURA: paso('PINTURA'),
  LIMPIEZA: paso('LIMPIEZA'),
  FOTOS: paso('FOTOS'),
  PUBLICADO: paso('PUBLICADO'),
}
const BASE: Record<string, Getter> = {
  MARCA: marca,
  MODELO: modelo,
  MATRICULA: matricula,
  BASTIDOR: bastidor,
}

/** Clave normalizada de cabecera → getter. La referencia (col A) va aparte. */
export const mapeoColumnas: Record<ClavePestana, Record<string, Getter>> = {
  'VENTAS/Expo': {
    ...BASE,
    '2DALLAVE': campo('segundaLlave'),
    KMS: kms,
    FECHAMATRI: fechaMatr,
    ...CHECKLIST_VEHICULO,
    ...CHECKLIST_PASOS,
  },
  'VENTAS/Deposito': {
    ...BASE,
    '2DALLAVE': campo('segundaLlave'),
    KMS: kms,
    FECHAMATR: fechaMatr,
    ...CHECKLIST_VEHICULO,
    ...CHECKLIST_PASOS,
  },
  'VENTAS/R': {
    ...BASE,
    FECHAMATRIC: fechaMatr,
    '2DALLAVE': campo('segundaLlave'),
    CARPETA: campo('carpeta'),
  },
  'COMPRAS/Compras': {
    ...BASE,
    FMATR: fechaMatr,
    FECHACOMPRA: fechaCompra,
    PROVEEDOR: campo('proveedor'),
    KMS: kms,
    MONTO: ({ vehiculo: v }) => fmtNumeroPositivo(v.precioCompra),
    PORTECOMI: ({ vehiculo: v }) => fmtNumeroPositivo(v.gastosTransporte),
    ABONADO: campo('abonado'),
    COMPROBANTE: campo('comprobante'),
    PORTESOLICITADO: campo('porteSolicitado'),
    RECIBIDO: ({ vehiculo: v }) =>
      fmtFecha(v.recibidoFecha) ??
      texto(v.recibidoTexto) ??
      (v.recibido === true ? 'SI' : null),
    ...CHECKLIST_VEHICULO,
    ...CHECKLIST_PASOS,
  },
  'COMPRAS/R': {
    ...BASE,
    FECHA: fechaMatr,
    MONTO: ({ vehiculo: v }) => fmtNumeroPositivo(v.precioCompra),
    VENDIDOA: ({ deal }) => texto(deal?.clienteNombre),
    MONTOVENTA: ({ deal }) => fmtNumeroPositivo(deal?.importeTotal),
  },
  'COMPRAS/Deposito': {
    ...BASE,
    KMS: kms,
    MONTOCLIENTE: ({ deposito }) => fmtNumeroPositivo(deposito?.precio_venta),
  },
}

/** Columnas que el CRM no escribe jamás (claves normalizadas). */
export const NO_ESCRIBIR: Record<ClavePestana, string[]> = {
  'VENTAS/Expo': [],
  'VENTAS/Deposito': [],
  'VENTAS/R': ['ESTADO'],
  'COMPRAS/Compras': ['TOTAL', 'ESTADO'],
  'COMPRAS/R': ['GANANCI'],
  'COMPRAS/Deposito': [],
}

/** Pestañas donde existe la marca VENDIDO y qué valor lleva. */
const MARCA_VENDIDO: Partial<Record<ClavePestana, 'VENDIDO' | 'SI'>> = {
  'VENTAS/Expo': 'VENDIDO',
  'VENTAS/Deposito': 'VENDIDO',
  'VENTAS/R': 'SI',
  'COMPRAS/Compras': 'VENDIDO',
}

/** Tipo implícito de la pestaña (para normalizar la referencia de la celda). */
export function tipoDePestana(pestana: Pestana): 'C' | 'D' | 'R' {
  if (pestana === 'Deposito') return 'D'
  if (pestana === 'R') return 'R'
  return 'C'
}

export const COL_REFERENCIA = 0

export function indiceReferencia(headers: string[]): number {
  const i = headers.findIndex((h) => /REFERENCIA/i.test(String(h ?? '')))
  return i >= 0 ? i : COL_REFERENCIA
}

/**
 * Columna de la marca VENDIDO: cabecera "VENDIDO" si existe; si no, la
 * primera columna sin cabecera (headers.length). idx -1 = la pestaña no la tiene.
 */
export function indiceVendido(
  clave: ClavePestana,
  headers: string[]
): { idx: number; valor: 'VENDIDO' | 'SI' } {
  const valor = MARCA_VENDIDO[clave]
  if (!valor) return { idx: -1, valor: 'VENDIDO' }
  const i = headers.findIndex((h) => claveHeader(h) === 'VENDIDO')
  return { idx: i >= 0 ? i : headers.length, valor }
}

export interface ValorEsperado {
  col: number
  header: string
  valor: ValorCelda
  /** true para la marca VENDIDO: sólo se pone si la celda está vacía / distinta. */
  marcaVendido?: boolean
}

/** Valores NO vacíos que el CRM espera en la fila (referencia incluida). */
export function valoresEsperados(
  clave: ClavePestana,
  headers: string[],
  ctx: CtxVehiculoSheets
): ValorEsperado[] {
  const out: ValorEsperado[] = []
  const deny = new Set(NO_ESCRIBIR[clave])
  const mapeo = mapeoColumnas[clave]
  const refIdx = indiceReferencia(headers)
  const r = ref(ctx)
  if (r != null)
    out.push({ col: refIdx, header: String(headers[refIdx] ?? ''), valor: r })

  const vistas = new Set<string>()
  headers.forEach((h, col) => {
    if (col === refIdx) return
    const k = claveHeader(h)
    if (!k || deny.has(k) || vistas.has(k)) return
    const getter = mapeo[k]
    if (!getter) return
    vistas.add(k)
    const v = getter(ctx)
    if (v == null || v === '') return
    out.push({ col, header: String(h), valor: v })
  })

  const vend = indiceVendido(clave, headers)
  if (vend.idx >= 0 && normalizarEstado(ctx.vehiculo.estado) === 'VENDIDO') {
    out.push({
      col: vend.idx,
      header: String(headers[vend.idx] ?? ''),
      valor: vend.valor,
      marcaVendido: true,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Comparación y diff
// ---------------------------------------------------------------------------

/** "78.364" → 78364, "8.100" → 8100, "1.234,5" → 1234.5, "12" → 12; no numérico → null. */
export function parseNumeroCelda(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) {
    return Number(t.replace(/\./g, '').replace(',', '.'))
  }
  if (/^-?\d+(,\d+)?$/.test(t)) return Number(t.replace(',', '.'))
  if (/^-?\d+\.\d+$/.test(t)) return Number(t)
  return null
}

export function normalizarCelda(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'SI' : ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  const s = String(v).trim()
  if (!s) return ''
  const n = parseNumeroCelda(s)
  if (n != null) return String(n)
  // Texto: sin acentos ni mayúsculas ("Sí" = "SI", "opel" = "Opel", "no fue" = "NO FUE").
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function esFechaLarga(s: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(s)
}

/** ¿La celda ya dice lo que el CRM quiere escribir? */
export function iguales(
  actual: unknown,
  esperado: unknown,
  anioRef: number
): boolean {
  const a = normalizarCelda(actual)
  const e = normalizarCelda(esperado)
  if (a === e) return true
  if (!a || !e) return false
  if (typeof esperado === 'string' && esFechaLarga(e)) {
    const isoE = `${e.slice(6, 10)}-${e.slice(3, 5)}-${e.slice(0, 2)}`
    const isoA = interpretarFechaCorta(a, anioRef)
    if (isoA === isoE) return true
    // "30/5" sin año: basta día y mes.
    const corta = /^(\d{1,2})[/.-](\d{1,2})$/.exec(a)
    if (
      corta &&
      pad2(+corta[1]) === e.slice(0, 2) &&
      pad2(+corta[2]) === e.slice(3, 5)
    )
      return true
  }
  return false
}

export interface CeldaDiff {
  col: number
  letra: string
  header: string
  anterior: string
  nuevo: ValorCelda
}

export interface PlanUpsert {
  append: boolean
  celdas: CeldaDiff[]
}

export function planUpsert(
  headers: string[],
  filaActual: string[] | null,
  esperados: ValorEsperado[],
  anioRef: number
): PlanUpsert {
  if (!filaActual) return { append: true, celdas: [] }
  const celdas: CeldaDiff[] = []
  for (const e of esperados) {
    if (e.col >= headers.length && !e.marcaVendido) continue
    const actual = filaActual[e.col] ?? ''
    if (e.marcaVendido) {
      if (normalizarCelda(actual) === normalizarCelda(e.valor)) continue
      // Ventas/R: "SI" sólo si está vacía (puede tener el nombre del comprador).
      if (e.valor === 'SI' && normalizarCelda(actual)) continue
      celdas.push({
        col: e.col,
        letra: letraColumna(e.col),
        header: e.header,
        anterior: String(actual),
        nuevo: e.valor,
      })
      continue
    }
    if (iguales(actual, e.valor, anioRef)) continue
    celdas.push({
      col: e.col,
      letra: letraColumna(e.col),
      header: e.header,
      anterior: String(actual),
      nuevo: e.valor,
    })
  }
  return { append: false, celdas }
}

export function filaParaAppend(
  headers: string[],
  esperados: ValorEsperado[]
): ValorCelda[] {
  const max = esperados.reduce((m, e) => Math.max(m, e.col), headers.length - 1)
  const fila: ValorCelda[] = new Array(max + 1).fill('')
  for (const e of esperados) fila[e.col] = e.valor
  return fila
}

/** Referencia canónica de una celda de la columna A (o '#'+texto si no se interpreta). */
export function refDeCelda(cell: unknown, tipo: string | null): string | null {
  const t = texto(cell)
  if (!t) return null
  return normalizarReferencia(t, tipo) ?? `#${t.replace(/^#/, '')}`
}

/** Índice (0-based sobre `filas`) de la fila cuya referencia es `refCanon`, o -1. */
export function encontrarFila(
  filas: string[][],
  refIdx: number,
  refCanon: string,
  tipo: string | null
): number {
  for (let i = 0; i < filas.length; i++) {
    if (refDeCelda(filas[i]?.[refIdx], tipo) === refCanon) return i
  }
  return -1
}
