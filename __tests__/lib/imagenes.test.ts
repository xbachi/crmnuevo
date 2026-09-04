/**
 * @jest-environment node
 *
 * Compresión de fotos al subir (A9). Los tests de `comprimirImagen` generan la
 * imagen de prueba con el propio sharp; si el binario nativo no carga en este
 * entorno se saltan (ver `describeConSharp`) y quedan solo los tests puros.
 */

import {
  cambiarExtension,
  comprimirImagen,
  esImagenComprimible,
} from '@/lib/imagenes'

let sharpDisponible = false
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('sharp')
  sharpDisponible = true
} catch {
  sharpDisponible = false
}
const describeConSharp = sharpDisponible ? describe : describe.skip

describe('esImagenComprimible', () => {
  it('acepta jpeg, png y webp por tipo MIME', () => {
    expect(esImagenComprimible('image/jpeg', 'foto.jpg')).toBe(true)
    expect(esImagenComprimible('image/png', 'captura.png')).toBe(true)
    expect(esImagenComprimible('image/webp', 'foto.webp')).toBe(true)
  })

  it('rechaza pdf y otros documentos', () => {
    expect(esImagenComprimible('application/pdf', 'contrato.pdf')).toBe(false)
    expect(esImagenComprimible('text/plain', 'notas.txt')).toBe(false)
    expect(
      esImagenComprimible(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'ficha.docx'
      )
    ).toBe(false)
  })

  it('rechaza gif y svg aunque sean imágenes', () => {
    expect(esImagenComprimible('image/gif', 'anim.gif')).toBe(false)
    expect(esImagenComprimible('image/svg+xml', 'logo.svg')).toBe(false)
  })

  it('heic/heif son candidatos: si sharp no los decodifica, comprimirImagen devuelve null', () => {
    expect(esImagenComprimible('image/heic', 'IMG_0001.HEIC')).toBe(true)
    expect(esImagenComprimible('image/heif', 'IMG_0001.heif')).toBe(true)
  })

  it('sin tipo MIME decide por la extensión (insensible a mayúsculas)', () => {
    expect(esImagenComprimible('', 'FOTO.JPG')).toBe(true)
    expect(esImagenComprimible(undefined, 'foto.jpeg')).toBe(true)
    expect(esImagenComprimible('application/octet-stream', 'foto.png')).toBe(
      true
    )
    expect(esImagenComprimible('', 'contrato.pdf')).toBe(false)
    expect(esImagenComprimible('', 'sin_extension')).toBe(false)
    expect(esImagenComprimible(null, null)).toBe(false)
  })

  it('un tipo MIME no imagen manda sobre la extensión', () => {
    expect(esImagenComprimible('application/pdf', 'trampa.jpg')).toBe(false)
  })
})

describe('cambiarExtension', () => {
  it('sustituye la extensión conservando el nombre', () => {
    expect(cambiarExtension('foto.JPG', 'webp')).toBe('foto.webp')
    expect(cambiarExtension('IMG_0001.jpeg', 'webp')).toBe('IMG_0001.webp')
    expect(cambiarExtension('mi.foto.png', 'webp')).toBe('mi.foto.webp')
  })

  it('añade la extensión si el nombre no tiene', () => {
    expect(cambiarExtension('foto', 'webp')).toBe('foto.webp')
  })
})

describeConSharp('comprimirImagen (requiere el binario de sharp)', () => {
  const crearPng = async (ancho: number, alto: number): Promise<Buffer> => {
    const sharp = (await import('sharp')).default
    // Ruido para que el PNG pese de verdad y la comparación de bytes tenga sentido.
    const canales = 3
    const pixeles = Buffer.alloc(ancho * alto * canales)
    let semilla = 42
    for (let i = 0; i < pixeles.length; i++) {
      semilla = (semilla * 1103515245 + 12345) & 0x7fffffff
      pixeles[i] = semilla & 0xff
    }
    return sharp(pixeles, {
      raw: { width: ancho, height: alto, channels: canales },
    })
      .png()
      .toBuffer()
  }

  it('convierte a webp, limita el lado mayor a 1600 y reduce el peso', async () => {
    const png = await crearPng(3000, 2000)
    const resultado = await comprimirImagen(png)

    expect(resultado).not.toBeNull()
    expect(resultado!.contentType).toBe('image/webp')
    expect(resultado!.extension).toBe('webp')
    expect(resultado!.ancho).toBe(1600)
    expect(resultado!.alto).toBe(1067)
    expect(resultado!.bytesAntes).toBe(png.length)
    expect(resultado!.bytesDespues).toBe(resultado!.buffer.length)
    expect(resultado!.bytesDespues).toBeLessThan(resultado!.bytesAntes)

    const sharp = (await import('sharp')).default
    const meta = await sharp(resultado!.buffer).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(1600)
    expect(meta.height).toBe(1067)
  })

  it('respeta maxLado y no agranda imágenes pequeñas', async () => {
    const png = await crearPng(400, 300)
    const resultado = await comprimirImagen(png, { maxLado: 800 })
    expect(resultado!.ancho).toBe(400)
    expect(resultado!.alto).toBe(300)

    const reducido = await comprimirImagen(png, { maxLado: 200 })
    expect(reducido!.ancho).toBe(200)
    expect(reducido!.alto).toBe(150)
  })

  it('devuelve null con un buffer que no es una imagen', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const basura = Buffer.from(
        'esto no es una imagen, es un contrato en texto'
      )
      expect(await comprimirImagen(basura)).toBeNull()
      expect(await comprimirImagen(Buffer.alloc(0))).toBeNull()
    } finally {
      warn.mockRestore()
    }
  })
})
