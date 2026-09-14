/**
 * Subida del PDF del presupuesto a Vercel Blob. Mismas opciones que
 * documentStorage.saveDocument (público con sufijo aleatorio no adivinable),
 * sin tocar su union DocumentType.
 */
import { put } from '@vercel/blob'

export class BlobNoConfiguradoError extends Error {
  readonly code = 'BLOB_NO_CONFIGURADO'
  constructor() {
    super('Almacenamiento de documentos no configurado (BLOB_READ_WRITE_TOKEN)')
    this.name = 'BlobNoConfiguradoError'
  }
}

export async function subirPdfPresupuesto(
  nombreArchivo: string,
  pdf: Uint8Array
): Promise<{ url: string; pathname: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new BlobNoConfiguradoError()
  const res = await put(
    `documentos/presupuestos/${nombreArchivo}`,
    Buffer.from(pdf),
    { access: 'public', contentType: 'application/pdf', addRandomSuffix: true }
  )
  return { url: res.url, pathname: res.pathname }
}
