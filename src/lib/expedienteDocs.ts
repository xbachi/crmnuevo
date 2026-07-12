/**
 * Detección de documentos del expediente a partir de los NOMBRES de archivo
 * de la carpeta del coche en OneDrive (pura, sin pg — testeable).
 *
 * Los nombres reales son inconsistentes (guiones/espacios/acentos/mayúsculas
 * mezclados: "Factura-Venta-F-2026-020.pdf", "Contrato depósito.jpeg",
 * "CONTRATO COMPRA VENTA.jpeg"...), así que todo se normaliza NFD sin
 * diacríticos y en minúsculas antes de aplicar las regex.
 */

import { checklistRequerida, type TipoOperacion } from '@/lib/expedienteChecklist'

export interface DocsDetectados {
  facturaVenta: boolean
  facturaCompra: boolean
  contratoCompra: boolean
  contratoVenta: boolean
  contratoDeposito: boolean
}

/** clave de checklist → flag de DocsDetectados */
export const CLAVE_A_DOC: Record<string, keyof DocsDetectados> = {
  'factura-venta': 'facturaVenta',
  'factura-compra': 'facturaCompra',
  'contrato-compra': 'contratoCompra',
  'contrato-venta': 'contratoVenta',
  'contrato-deposito': 'contratoDeposito',
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

// Factura de venta: "Factura-Venta-F-2026-020.pdf",
// "factura-rebu-factura-rebu-F-2026-019.pdf", "factura-iva-F-2026-4221.pdf",
// "factura-R-2026-026 compra venta.pdf" (el "compra venta" del final es la
// descripción, no un contrato).
const RE_FACTURA_VENTA = [/factura[-_ ]?venta/, /^factura-(rebu|iva|r-)/, /factura-[fr]-\d{4}/]
const RE_FACTURA_COMPRA = /factura[-_ ]?compra/
// "(?!dor)": "Contrato comprador.jpeg" es el contrato DE VENTA firmado por el
// comprador, no un contrato de compra. "CONTRATO COMPRA VENTA.jpeg" (REBU de
// particular) SÍ cuenta como contrato de compra.
const RE_CONTRATO_COMPRA = /contrato[-_ ]?compra(?!dor)/
// Pegado a "venta" (a lo sumo un separador): "contrato compra venta" no matchea.
const RE_CONTRATO_VENTA = [/contrato[-_ ]?venta/, /contrato[-_ ]?comprador/]
const RE_CONTRATO_DEPOSITO = /contrato[-_ ]?deposito/

/** Qué documentos hay en la carpeta, según los nombres de archivo. */
export function detectarDocs(archivos: { nombre: string }[]): DocsDetectados {
  const docs: DocsDetectados = {
    facturaVenta: false,
    facturaCompra: false,
    contratoCompra: false,
    contratoVenta: false,
    contratoDeposito: false,
  }
  for (const a of archivos) {
    const n = norm(a.nombre)
    if (RE_FACTURA_VENTA.some((re) => re.test(n))) docs.facturaVenta = true
    if (RE_FACTURA_COMPRA.test(n)) docs.facturaCompra = true
    if (RE_CONTRATO_COMPRA.test(n)) docs.contratoCompra = true
    if (RE_CONTRATO_VENTA.some((re) => re.test(n))) docs.contratoVenta = true
    if (RE_CONTRATO_DEPOSITO.test(n)) docs.contratoDeposito = true
  }
  return docs
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
