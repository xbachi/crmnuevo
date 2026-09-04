/**
 * Compresión de fotos al subirlas: las fotos de móvil pesan 3-8 MB, llenan el
 * Blob y hacen que la ficha del vehículo cargue lenta. Se convierten a WebP con
 * un lado máximo de 1600 px respetando la orientación EXIF.
 *
 * Nunca bloquea la subida: si sharp no puede decodificar el archivo (formato
 * raro, HEIC sin libheif, buffer corrupto…) `comprimirImagen` devuelve `null`
 * y la ruta sube el original tal cual.
 */

const TIPOS_COMPRIMIBLES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

const EXTENSIONES_COMPRIMIBLES = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
])

export interface OpcionesCompresion {
  /** Lado mayor máximo en píxeles (no se agranda si la foto es menor). */
  maxLado?: number
  /** Calidad WebP 1-100. */
  calidad?: number
}

export interface ImagenComprimida {
  buffer: Buffer
  contentType: 'image/webp'
  extension: 'webp'
  ancho: number
  alto: number
  bytesAntes: number
  bytesDespues: number
}

/**
 * Solo fotos (jpeg/png/webp y heic/heif como candidatos). PDFs, GIF (perdería
 * la animación), SVG y cualquier otro tipo se suben sin tocar. Si el navegador
 * no informa el tipo MIME se decide por la extensión.
 */
export function esImagenComprimible(
  contentType: string | null | undefined,
  nombre?: string | null
): boolean {
  const tipo = (contentType || '').toLowerCase().split(';')[0].trim()
  if (TIPOS_COMPRIMIBLES.has(tipo)) return true
  if (tipo && tipo !== 'application/octet-stream') return false

  const partes = (nombre || '').toLowerCase().split('.')
  const extension = partes.length > 1 ? partes.pop() || '' : ''
  return EXTENSIONES_COMPRIMIBLES.has(extension)
}

/** `foto.JPG` → `foto.webp`; sin extensión → `foto.webp`. */
export function cambiarExtension(nombre: string, extension: string): string {
  const base = nombre.replace(/\.[^./\\]+$/, '')
  return `${base || nombre}.${extension}`
}

export async function comprimirImagen(
  entrada: Buffer,
  opts: OpcionesCompresion = {}
): Promise<ImagenComprimida | null> {
  const maxLado = opts.maxLado ?? 1600
  const calidad = opts.calidad ?? 80

  try {
    // Import dinámico: sharp carga un binario nativo y solo lo necesita esta ruta.
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(entrada)
      .rotate()
      .resize({
        width: maxLado,
        height: maxLado,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: calidad })
      .toBuffer({ resolveWithObject: true })

    return {
      buffer: data,
      contentType: 'image/webp',
      extension: 'webp',
      ancho: info.width,
      alto: info.height,
      bytesAntes: entrada.length,
      bytesDespues: data.length,
    }
  } catch (error) {
    console.warn(
      '⚠️ [IMAGENES] No se pudo comprimir la imagen, se sube el original:',
      error instanceof Error ? error.message : error
    )
    return null
  }
}
