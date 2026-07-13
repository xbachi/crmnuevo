/**
 * Detección de documentos del expediente en la carpeta del coche (OneDrive).
 *
 * El nombre de archivo NO es fuente de verdad: hay facturas de compra llamadas
 * "FRA-compra.pdf" o "factura.pdf", typos ("Contrrato compra"), copias del
 * mismo PDF con dos nombres distintos... Por eso el orden de detección es:
 *
 *   1. HASH del contenido contra facturas_registro (md5, el mismo que ya usa
 *      el registro unificado de facturas) → identidad real del archivo.
 *   2. Nombre (regex), ampliado y tolerante a typos, sólo como respaldo.
 *   3. Lo que no se pueda clasificar queda como AMBIGUO (revisar a mano), nunca
 *      se da por bueno.
 *
 * Todo puro (sin pg): los registros de hash entran como argumento.
 */

import { checklistRequerida, type TipoOperacion } from '@/lib/expedienteChecklist'
import { normPlate } from '@/lib/facturasRegistro'

export interface DocsDetectados {
  facturaVenta: boolean
  facturaCompra: boolean
  contratoCompra: boolean
  contratoVenta: boolean
  contratoDeposito: boolean
}

export type DocClave = keyof DocsDetectados

/** clave de checklist → flag de DocsDetectados */
export const CLAVE_A_DOC: Record<string, DocClave> = {
  'factura-venta': 'facturaVenta',
  'factura-compra': 'facturaCompra',
  'contrato-compra': 'contratoCompra',
  'contrato-venta': 'contratoVenta',
  'contrato-deposito': 'contratoDeposito',
}

/** Archivo del snapshot de OneDrive. `hash` (md5) puede faltar (snapshots viejos). */
export interface ArchivoExpediente {
  nombre: string
  bytes?: number | null
  hash?: string | null
}

/** Fila mínima de facturas_registro para cruzar por contenido. */
export interface RegistroHash {
  hash: string // hash_contenido (md5 de los bytes)
  categoria: string // 'coche-compra' | 'coche-servicio' | 'gestoria'
  matricula?: string | null
}

/** hash → documento que ese contenido ES, según el registro de facturas. */
export type IndiceHash = Map<string, { doc: DocClave; matricula: string | null }>

// Sólo las categorías que corresponden a un documento de la checklist. La
// factura de VENTA todavía no se registra en facturas_registro (el CRM la emite
// y la guarda en Blob); cuando exista la categoría, el cruce sale gratis.
const CATEGORIA_A_DOC: Record<string, DocClave> = {
  'coche-compra': 'facturaCompra',
  'coche-venta': 'facturaVenta',
}

const normHash = (h: string | null | undefined): string | null => {
  const s = String(h ?? '').trim().toLowerCase()
  return s ? s : null
}

export function indexarRegistros(registros: RegistroHash[] | null | undefined): IndiceHash {
  const idx: IndiceHash = new Map()
  for (const r of registros ?? []) {
    const doc = CATEGORIA_A_DOC[r.categoria]
    const hash = normHash(r.hash)
    if (!doc || !hash) continue
    idx.set(hash, { doc, matricula: r.matricula ? normPlate(r.matricula) : null })
  }
  return idx
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

// "factura", "facturas", "fra", "fras" como palabra suelta ("FRA" = factura en
// la jerga del proveedor: "FRA-compra.pdf", "FRA.pdf").
const RE_FACTURA_TOK = /(^|[^a-z])(facturas?|fras?)([^a-z]|$)/
// Tolera el typo real "Contrrato" (y "conrato"): con + t? + r{1,2} + ato.
const RE_CONTRATO_TOK = /cont?r{1,2}at[o0]/
const RE_DEPOSITO = /deposito|consignacion/
const RE_COMPRADOR = /comprador/
const RE_VENDEDOR = /vendedor/
const RE_COMPRA = /compra/
const RE_VENTA = /venta/
// Números de factura de venta del CRM: "factura-iva-F-2026-4221.pdf",
// "factura-rebu-...", "factura-R-2026-026 compra venta.pdf" (el "compra venta"
// del final es la descripción de la operación, no un contrato).
const RE_FACTURA_VENTA_NUM = [/^factura-(rebu|iva|r-)/, /factura-[fr]-\d{4}/]
// Documentos que NO son de la checklist: no se clasifican ni se reportan.
const RE_IRRELEVANTE =
  /permiso|circulacion|ficha[-_ ]?tecnica|itv|dgt|tasa|transferencia|cambio[-_ ]?(de[-_ ]?)?nombre|garantia|seguro|reserva|checklist|mandato/

type Clasificacion = DocClave | 'ambiguo' | 'irrelevante'

/** Qué documento sugiere el NOMBRE del archivo (respaldo, no fuente de verdad). */
export function clasificarPorNombre(nombre: string): Clasificacion {
  const n = norm(nombre)

  if (RE_CONTRATO_TOK.test(n)) {
    if (RE_DEPOSITO.test(n)) return 'contratoDeposito'
    // "Contrato comprador" = contrato de VENTA firmado por el comprador;
    // "Contrato vendedor" = contrato de COMPRA (el que firma quien nos vende).
    if (RE_COMPRADOR.test(n)) return 'contratoVenta'
    if (RE_VENDEDOR.test(n)) return 'contratoCompra'
    // "CONTRATO COMPRA VENTA" (REBU de particular) cuenta como contrato de compra.
    if (RE_COMPRA.test(n)) return 'contratoCompra'
    if (RE_VENTA.test(n)) return 'contratoVenta'
    return 'ambiguo' // "Contrato.jpeg" a secas
  }

  const esVentaPorNumero = RE_FACTURA_VENTA_NUM.some((re) => re.test(n))
  if (esVentaPorNumero) return 'facturaVenta'

  if (RE_FACTURA_TOK.test(n)) {
    const compra = RE_COMPRA.test(n)
    const venta = RE_VENTA.test(n)
    if (compra && !venta) return 'facturaCompra'
    if (venta && !compra) return 'facturaVenta'
    return 'ambiguo' // "factura.pdf" / "FRA.pdf": compra o venta, no se sabe
  }

  if (RE_IRRELEVANTE.test(n)) return 'irrelevante'
  return 'ambiguo' // nombre sin ninguna pista → que no quede invisible
}

export interface AlertaDuplicado {
  hash: string
  nombres: string[]
}

export interface AlertaConflicto {
  hash: string
  nombres: string[]
  docs: DocClave[] // documentos DISTINTOS que sugieren esos nombres
}

export interface ArchivoAmbiguo {
  nombre: string
  motivo: string
}

/** Estado de un archivo concreto de la carpeta. Sólo `clasificado` es seguro de
 *  renombrar: el resto se toca a mano. */
export type EstadoArchivo = 'clasificado' | 'ambiguo' | 'irrelevante' | 'conflicto'

export interface ArchivoClasificado {
  nombre: string
  hash: string | null
  doc: DocClave | null
  /** de dónde salió la identificación (null si no se identificó) */
  fuente: 'hash' | 'nombre' | null
  estado: EstadoArchivo
  motivo?: string
}

export interface AnalisisCarpeta {
  docs: DocsDetectados
  /** mismo contenido guardado dos veces (mismo tipo de doc) */
  duplicados: AlertaDuplicado[]
  /** mismo contenido con nombres de documentos DISTINTOS → uno de los dos no existe */
  mismoArchivoDosNombres: AlertaConflicto[]
  /** no clasificable ni por hash ni por nombre → revisar a mano */
  ambiguos: ArchivoAmbiguo[]
  /** clasificación archivo por archivo (base del renombrado canónico) */
  archivos: ArchivoClasificado[]
}

export interface CtxDeteccion {
  hashes?: IndiceHash // índice de facturas_registro
  matricula?: string | null // matrícula de la carpeta (valida el cruce por hash)
}

const vacio = (): DocsDetectados => ({
  facturaVenta: false,
  facturaCompra: false,
  contratoCompra: false,
  contratoVenta: false,
  contratoDeposito: false,
})

const esDoc = (c: Clasificacion): c is DocClave => c !== 'ambiguo' && c !== 'irrelevante'

/**
 * Análisis completo de una carpeta: documentos presentes + alertas de
 * duplicados / mala clasificación / archivos sin clasificar.
 */
export function analizarCarpeta(
  archivos: ArchivoExpediente[],
  ctx: CtxDeteccion = {}
): AnalisisCarpeta {
  const docs = vacio()
  const duplicados: AlertaDuplicado[] = []
  const mismoArchivoDosNombres: AlertaConflicto[] = []
  const ambiguos: ArchivoAmbiguo[] = []
  const plate = ctx.matricula ? normPlate(ctx.matricula) : null

  // 1. Grupos por hash dentro de la carpeta (duplicados y conflictos).
  const porHash = new Map<string, ArchivoExpediente[]>()
  for (const a of archivos ?? []) {
    const h = normHash(a.hash)
    if (!h) continue
    if (!porHash.has(h)) porHash.set(h, [])
    porHash.get(h)!.push(a)
  }
  const enConflicto = new Set<string>()
  for (const [hash, grupo] of porHash) {
    if (grupo.length < 2) continue
    const nombres = grupo.map((a) => a.nombre)
    const docsNombre = [
      ...new Set(grupo.map((a) => clasificarPorNombre(a.nombre)).filter(esDoc)),
    ]
    if (docsNombre.length > 1) {
      // El mismo PDF nombrado como dos documentos distintos: uno de los dos NO
      // existe. No se puede confiar en ninguno de esos nombres.
      mismoArchivoDosNombres.push({ hash, nombres, docs: docsNombre })
      enConflicto.add(hash)
    } else {
      duplicados.push({ hash, nombres })
    }
  }

  // 2. Clasificación archivo por archivo: hash → nombre → ambiguo.
  const clasificados: ArchivoClasificado[] = []
  const CONFLICTO = 'mismo contenido que otro archivo con nombre de otro documento'
  for (const a of archivos ?? []) {
    const h = normHash(a.hash)
    const reg = h ? ctx.hashes?.get(h) : undefined
    // El hash sólo vale si es del mismo coche (o si alguno de los dos lados no
    // tiene matrícula): un PDF de otro coche en esta carpeta no la completa.
    if (reg && (!reg.matricula || !plate || reg.matricula === plate)) {
      docs[reg.doc] = true
      // Identificado por contenido, pero si además está en un grupo en conflicto
      // no se puede tocar: renombrarlo consolidaría un documento que no existe.
      clasificados.push(
        enConflicto.has(h!)
          ? { nombre: a.nombre, hash: h, doc: reg.doc, fuente: 'hash', estado: 'conflicto', motivo: CONFLICTO }
          : { nombre: a.nombre, hash: h, doc: reg.doc, fuente: 'hash', estado: 'clasificado' }
      )
      continue
    }
    if (h && enConflicto.has(h)) {
      ambiguos.push({ nombre: a.nombre, motivo: CONFLICTO })
      clasificados.push({
        nombre: a.nombre,
        hash: h,
        doc: null,
        fuente: null,
        estado: 'conflicto',
        motivo: CONFLICTO,
      })
      continue
    }
    const c = clasificarPorNombre(a.nombre)
    if (c === 'irrelevante') {
      clasificados.push({
        nombre: a.nombre,
        hash: h,
        doc: null,
        fuente: null,
        estado: 'irrelevante',
        motivo: 'documento que no es de la checklist',
      })
      continue
    }
    if (c === 'ambiguo') {
      const motivo = 'no se pudo clasificar por hash ni por nombre'
      ambiguos.push({ nombre: a.nombre, motivo })
      clasificados.push({ nombre: a.nombre, hash: h, doc: null, fuente: null, estado: 'ambiguo', motivo })
      continue
    }
    docs[c] = true
    clasificados.push({ nombre: a.nombre, hash: h, doc: c, fuente: 'nombre', estado: 'clasificado' })
  }

  return { docs, duplicados, mismoArchivoDosNombres, ambiguos, archivos: clasificados }
}

/** Qué documentos hay en la carpeta (atajo de analizarCarpeta). */
export function detectarDocs(
  archivos: ArchivoExpediente[],
  ctx: CtxDeteccion = {}
): DocsDetectados {
  return analizarCarpeta(archivos, ctx).docs
}

/**
 * Claves de checklist requeridas para el tipo de operación que NO se detectan
 * en la carpeta. Con tipo 'desconocido' (no hay expediente para la matrícula)
 * se exige lo mínimo defendible: factura de venta + justificante de compra
 * (factura O contrato de compra).
 */
export function docsFaltantes(
  tipoOperacion: TipoOperacion | 'desconocido',
  docs: DocsDetectados
): string[] {
  if (tipoOperacion === 'desconocido') {
    const faltan: string[] = []
    if (!docs.facturaVenta) faltan.push('factura-venta')
    if (!docs.facturaCompra && !docs.contratoCompra) faltan.push('factura-compra o contrato-compra')
    return faltan
  }
  return checklistRequerida(tipoOperacion)
    .filter((item) => item.requerido && !docs[CLAVE_A_DOC[item.clave]])
    .map((item) => item.clave)
}

/**
 * Matrícula extraída del nombre de una carpeta de expediente.
 *
 * Formato viejo con letra inicial (E9961BDJ del quad) sólo se acepta si la
 * letra NO viene pegada a otra letra en el nombre original — si no, compactar
 * "68-Kia-Xceed-0608NLF" daría "D0608NLF" (la D final de Xceed). Después se
 * busca el formato moderno 0000XXX sobre el nombre compactado (cubre
 * "79- Hyundai Kona-6935KYC" con espacios sueltos).
 */
export function matriculaFromCarpeta(carpeta: string): string | null {
  const upper = carpeta
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
  const conLetra = /(?:^|[^A-Z])([A-Z][\s.\-]*\d{4}[\s.\-]*[A-Z]{3})(?![A-Z0-9])/.exec(upper)
  if (conLetra) return conLetra[1].replace(/[\s.\-]/g, '')
  const compacto = upper.replace(/[\s.\-]/g, '')
  const sinLetra = /(\d{4}[A-Z]{3})(?![A-Z0-9])/.exec(compacto)
  return sinLetra ? sinLetra[1] : null
}
