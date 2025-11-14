import { NextRequest, NextResponse } from 'next/server'
import { readFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { list } from '@vercel/blob'

const METADATA_FILE = 'inversores-documentos-metadata.json'
// Detectar si estamos en Vercel (producción)
const USE_BLOB_STORAGE = !!(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.BLOB_READ_WRITE_TOKEN
)

async function loadMetadata(inversorId: string) {
  try {
    if (USE_BLOB_STORAGE) {
      // En producción, cargar desde Vercel Blob
      try {
        console.log(
          `📥 [INVERSOR FILES API] Cargando desde Vercel Blob para inversor ${inversorId}`
        )
        const prefix = `inversores/${inversorId}/`
        const { blobs } = await list({ prefix })

        console.log(
          `📥 [INVERSOR FILES API] Encontrados ${blobs.length} archivos en Blob`
        )

        return blobs.map((blob) => {
          // Extraer el nombre del archivo desde la URL o pathname
          const blobPath =
            (blob as any).pathname || blob.url.split('/').pop() || ''
          const fileName = blobPath.split('/').pop() || 'unknown'
          const fileId = fileName.split('-')[0] || blob.uploadedAt.toString()
          const originalName = fileName.replace(/^\d+-/, '') || 'unknown'

          return {
            id: fileId,
            name: originalName,
            fileName: fileName,
            size: blob.size,
            type: (blob as any).contentType || 'application/octet-stream',
            uploadDate: blob.uploadedAt.toISOString(),
            path: blob.url,
          }
        })
      } catch (blobError) {
        console.error(
          '❌ [INVERSOR FILES API] Error al cargar desde Blob:',
          blobError
        )
        return []
      }
    } else {
      // En desarrollo, cargar desde filesystem
      const metadataDir = join(
        process.cwd(),
        'public',
        'uploads',
        'inversores',
        inversorId
      )
      await mkdir(metadataDir, { recursive: true })
      const metadataPath = join(metadataDir, METADATA_FILE)
      const data = await readFile(metadataPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Error loading metadata:', error)
    return []
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inversorId } = await params
    console.log(
      `📁 [INVERSOR FILES API] Obteniendo archivos para inversor ${inversorId}`
    )

    const metadata = await loadMetadata(inversorId)
    console.log(
      `📁 [INVERSOR FILES API] Archivos encontrados:`,
      metadata.length,
      `Blob Storage: ${USE_BLOB_STORAGE}`
    )
    if (metadata.length > 0) {
      console.log(`📁 [INVERSOR FILES API] Primer archivo:`, metadata[0])
    }

    return NextResponse.json(metadata, { status: 200 })
  } catch (error) {
    console.error('❌ [INVERSOR FILES API] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor al cargar archivos' },
      { status: 500 }
    )
  }
}
