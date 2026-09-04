import { promises as fs } from 'fs'
import path from 'path'
import { del, put } from '@vercel/blob'

/**
 * Capa de almacenamiento de los PDFs generados (contratos de reserva/venta…).
 *
 * Escritura: SIEMPRE a Vercel Blob. En Vercel el filesystem es efímero (cada
 * instancia tiene su disco temporal y se pierde en el siguiente deploy o cold
 * start), así que lo que se escribía en public/documents/ desaparecía. Mismo
 * patrón que uploadPdfToBlob en invoiceService.ts: la URL pública lleva sufijo
 * aleatorio (no adivinable) y la descarga real pasa por el endpoint
 * autenticado /api/documents/[dealId]/[documentType].
 *
 * Lectura/borrado: soporta los dos formatos que puede haber persistidos en el
 * deal:
 *   - `https://…`      → referencia a Blob (se descarga en servidor).
 *   - cualquier otro   → nombre de archivo legacy en public/documents/.
 */

export type DocumentType = 'contrato-reserva' | 'contrato-venta' | 'factura'

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'contrato-reserva',
  'contrato-venta',
  'factura',
]

export function isDocumentType(value: unknown): value is DocumentType {
  return (
    typeof value === 'string' &&
    (DOCUMENT_TYPES as readonly string[]).includes(value)
  )
}

export interface DocumentLocator {
  /** 0 = documento suelto (generador de reservas), sin deal. */
  dealId: number
  documentType: DocumentType
  dealNumber: string
}

export interface SavedDocument {
  url: string
  pathname: string
}

export const LEGACY_NOT_AVAILABLE_MESSAGE =
  'Documento no disponible: se generó antes de la migración a almacenamiento persistente; vuelve a generarlo'

export const BLOB_NOT_AVAILABLE_MESSAGE =
  'No se pudo recuperar el documento del almacenamiento persistente'

export class DocumentNotAvailableError extends Error {
  readonly code = 'DOCUMENT_NOT_AVAILABLE'

  constructor(
    message: string,
    /** true → referencia legacy (disco) que ya no existe; false → fallo al leer el Blob. */
    readonly legacy: boolean
  ) {
    super(message)
    this.name = 'DocumentNotAvailableError'
  }
}

const BLOB_PREFIX = 'documentos/'

// Solo lectura: directorio donde escribía la versión anterior de esta capa.
const LEGACY_DOCUMENTS_DIR = path.join(process.cwd(), 'public', 'documents')

export function isBlobRef(ref: unknown): ref is string {
  return typeof ref === 'string' && /^https?:\/\//i.test(ref)
}

function safeSegment(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'sin-numero'
}

export function buildBlobPath(
  locator: DocumentLocator,
  timestamp: number = Date.now()
): string {
  const folder = locator.dealId > 0 ? String(locator.dealId) : 'sueltos'
  const name = `${locator.documentType}-${safeSegment(locator.dealNumber)}-${timestamp}.pdf`
  return `${BLOB_PREFIX}${folder}/${name}`
}

export async function saveDocument(
  locator: DocumentLocator,
  pdf: Buffer | Uint8Array
): Promise<SavedDocument> {
  const blob = await put(buildBlobPath(locator), Buffer.from(pdf), {
    access: 'public',
    contentType: 'application/pdf',
    addRandomSuffix: true,
  })
  return { url: blob.url, pathname: blob.pathname }
}

function legacyDir(dealId: number): string {
  return dealId > 0
    ? path.join(LEGACY_DOCUMENTS_DIR, `deal-${dealId}`)
    : LEGACY_DOCUMENTS_DIR
}

/**
 * Rutas legacy candidatas, en orden: el nombre persistido en el deal (si lo
 * hay) y el nombre canónico `<tipo>-<numero>.pdf`. Siempre dentro del
 * directorio del deal: los valores vienen de la DB / query string y no deben
 * poder salir de él.
 */
function legacyCandidates(
  ref: string | null | undefined,
  locator: DocumentLocator
): string[] {
  const dir = legacyDir(locator.dealId)
  const names: string[] = []
  if (ref && !isBlobRef(ref)) {
    const base = path.basename(ref)
    if (base.toLowerCase().endsWith('.pdf')) names.push(base)
  }
  const canonical = path.basename(
    `${locator.documentType}-${locator.dealNumber}.pdf`
  )
  if (!names.includes(canonical)) names.push(canonical)

  return names
    .map((name) => path.join(dir, name))
    .filter((full) => full.startsWith(dir + path.sep))
}

function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/**
 * Devuelve el contenido del PDF. `ref` es lo persistido en el deal (URL de
 * Blob o nombre legacy; puede ser null → solo se prueba el nombre canónico).
 */
export async function readDocument(
  ref: string | null | undefined,
  locator: DocumentLocator
): Promise<Buffer> {
  if (isBlobRef(ref)) {
    const res = await fetch(ref)
    if (!res.ok) {
      throw new DocumentNotAvailableError(BLOB_NOT_AVAILABLE_MESSAGE, false)
    }
    return Buffer.from(await res.arrayBuffer())
  }

  for (const candidate of legacyCandidates(ref, locator)) {
    try {
      return await fs.readFile(candidate)
    } catch (error) {
      if (!isEnoent(error)) throw error
    }
  }
  throw new DocumentNotAvailableError(LEGACY_NOT_AVAILABLE_MESSAGE, true)
}

/** Borra el PDF en Blob o en disco legacy. Un legacy inexistente no es error. */
export async function deleteDocument(
  ref: string | null | undefined,
  locator: DocumentLocator
): Promise<void> {
  if (isBlobRef(ref)) {
    await del(ref)
    return
  }

  for (const candidate of legacyCandidates(ref, locator)) {
    try {
      await fs.unlink(candidate)
    } catch (error) {
      if (!isEnoent(error)) throw error
    }
  }
}
