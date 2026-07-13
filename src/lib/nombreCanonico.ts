/**
 * Convención canónica de nombres de archivo del expediente (OneDrive).
 *
 *   {Tipo-Doc}-{Marca}-{Modelo}-{Matricula}.{ext}
 *   Factura-Venta-Opel-Astra-8061KRN.pdf
 *   Contrato-Compra-Peugeot-206-1222BBL.pdf
 *
 * Reglas: sin acentos ni espacios (guiones), marca/modelo en Title-Case,
 * matrícula en mayúsculas sin separadores, extensión original en minúsculas.
 * Si falta marca o modelo se omite ese segmento (sin guiones dobles).
 *
 * Multipágina (un contrato escaneado en dos hojas): sufijo `-pag2`, `-pag3`…
 * DETERMINISTA — el orden lo fija el nombre original, nunca `(1)`.
 *
 * Módulo puro: no toca DB, ni red, ni fs.
 */

import type { DocClave } from '@/lib/expedienteDocs'

export const TIPO_DOC_NOMBRE: Record<DocClave, string> = {
  facturaVenta: 'Factura-Venta',
  facturaCompra: 'Factura-Compra',
  contratoCompra: 'Contrato-Compra',
  contratoVenta: 'Contrato-Venta',
  contratoDeposito: 'Contrato-Deposito',
}

export interface DatosCoche {
  marca?: string | null
  modelo?: string | null
  matricula?: string | null
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** "Citroën C4 picasso" → "Citroen-C4-Picasso"; vacío → "". */
export function segmento(raw?: string | null): string {
  const limpio = sinAcentos(String(raw ?? ''))
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
  if (!limpio) return ''
  return limpio
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('-')
}

/** "8061 KRN" / "8061-krn" → "8061KRN". */
export function matriculaCanonica(raw?: string | null): string {
  return sinAcentos(String(raw ?? ''))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/** Extensión (con punto) en minúsculas: "Factura (1).PDF" → ".pdf". Sin extensión → "". */
export function extensionDe(nombre: string): string {
  const base = String(nombre ?? '')
  const i = base.lastIndexOf('.')
  if (i <= 0 || i === base.length - 1) return ''
  const ext = base.slice(i + 1)
  // Un punto en medio del nombre ("Sevencars Motors S.L") no es una extensión:
  // las reales tienen 2..5 caracteres alfanuméricos (pdf, jpg, jpeg, heic…).
  if (!/^[A-Za-z0-9]{2,5}$/.test(ext)) return ''
  return `.${ext.toLowerCase()}`
}

/**
 * Nombre canónico para un documento. `nombreOriginal` sólo aporta la extensión.
 * `pagina` > 1 añade el sufijo -pagN (documento escaneado en varias hojas).
 */
export function nombreCanonico(
  doc: DocClave,
  coche: DatosCoche,
  nombreOriginal: string,
  pagina = 1
): string {
  const partes = [
    TIPO_DOC_NOMBRE[doc],
    segmento(coche.marca),
    segmento(coche.modelo),
    matriculaCanonica(coche.matricula),
  ].filter(Boolean)
  const sufijo = pagina > 1 ? `-pag${pagina}` : ''
  return `${partes.join('-')}${sufijo}${extensionDe(nombreOriginal)}`
}

/**
 * Nombre con el que se archiva una factura de venta recién emitida. Sin
 * matrícula (facturas sin coche) cae al número de factura, que siempre es
 * único: mejor `Factura-Venta-F-2026-030.pdf` que `Factura-Venta.pdf`.
 */
export function nombreFacturaVenta(
  coche: DatosCoche,
  numeroFactura: string,
  ext = '.pdf'
): string {
  if (!matriculaCanonica(coche.matricula)) {
    return `${TIPO_DOC_NOMBRE.facturaVenta}-${segmento(numeroFactura)}${ext}`
  }
  return nombreCanonico('facturaVenta', coche, `x${ext}`)
}

export interface ArchivoParaRenombrar {
  nombre: string
  doc: DocClave
  hash?: string | null
}

export interface Renombre {
  de: string
  a: string
}

export interface DuplicadoPlan {
  /** archivo a borrar: mismo contenido (hash) que `duplicadoDe` */
  nombre: string
  duplicadoDe: string
}

export interface PlanCarpeta {
  renombrar: Renombre[]
  /** ya tenían el nombre canónico */
  yaCanonicos: string[]
  /** mismo contenido guardado dos veces: sobra uno */
  duplicados: DuplicadoPlan[]
}

/** Orden estable por nombre original (no depende del locale). */
const porNombre = (a: ArchivoParaRenombrar, b: ArchivoParaRenombrar) =>
  a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0

/**
 * Plan de renombrado de una carpeta. Sólo entran archivos YA identificados con
 * certeza (el que llama filtra los ambiguos). Dentro de cada tipo de documento:
 * mismo hash = el mismo archivo dos veces (sobra uno), hashes distintos =
 * páginas del mismo documento (-pag2, -pag3…), en orden de nombre original.
 */
export function planNombresCarpeta(
  archivos: ArchivoParaRenombrar[],
  coche: DatosCoche
): PlanCarpeta {
  const renombrar: Renombre[] = []
  const yaCanonicos: string[] = []
  const duplicados: DuplicadoPlan[] = []

  const porDoc = new Map<DocClave, ArchivoParaRenombrar[]>()
  for (const a of archivos ?? []) {
    if (!porDoc.has(a.doc)) porDoc.set(a.doc, [])
    porDoc.get(a.doc)!.push(a)
  }

  for (const [, grupo] of porDoc) {
    const ordenados = [...grupo].sort(porNombre)
    const vistos = new Map<string, string>() // hash → primer nombre con ese contenido
    let pagina = 0
    for (const a of ordenados) {
      const hash = a.hash ? a.hash.trim().toLowerCase() : null
      const previo = hash ? vistos.get(hash) : undefined
      if (previo) {
        duplicados.push({ nombre: a.nombre, duplicadoDe: previo })
        continue
      }
      if (hash) vistos.set(hash, a.nombre)
      pagina++
      const propuesto = nombreCanonico(a.doc, coche, a.nombre, pagina)
      if (propuesto === a.nombre) yaCanonicos.push(a.nombre)
      else renombrar.push({ de: a.nombre, a: propuesto })
    }
  }

  return { renombrar, yaCanonicos, duplicados }
}
