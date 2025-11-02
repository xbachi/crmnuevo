import { NextRequest, NextResponse } from 'next/server'
import { readFile, mkdir, access } from 'fs/promises'
import { join } from 'path'
import { constants } from 'fs'
import { list } from '@vercel/blob'

const METADATA_FILE = 'vehiculos-documentos-metadata.json'
const USE_BLOB_STORAGE = process.env.VERCEL || process.env.VERCEL_ENV

async function loadMetadata(vehiculoId: string) {
  try {
    if (USE_BLOB_STORAGE) {
      // En producción, cargar desde Vercel Blob
      try {
        const prefix = `vehiculos-documentos/${vehiculoId}/`
        const { blobs } = await list({ prefix })

        const mappedBlobs = blobs.map((blob) => {
          const fileName = blob.path.split('/').pop() || 'unknown'
          // Extraer el timestamp del inicio del nombre del archivo
          const timestampMatch = fileName.match(/^(\d+)-/)
          const id = timestampMatch
            ? timestampMatch[1]
            : blob.uploadedAt.toString()
          // Extraer el nombre original removiendo el timestamp y guiones
          const name = fileName.replace(/^\d+-/, '') || 'unknown'

          return {
            id,
            name,
            fileName,
            size: blob.size,
            type: blob.contentType || 'application/octet-stream',
            uploadDate: blob.uploadedAt.toISOString(),
            path: blob.url,
          }
        })

        console.log(
          `📁 [FILES API] Archivos mapeados desde Blob:`,
          mappedBlobs.length
        )
        return mappedBlobs
      } catch (blobError: any) {
        console.error('❌ [FILES API] Error cargando desde Vercel Blob:', {
          message: blobError?.message,
          code: blobError?.code,
        })
        return []
      }
    } else {
      // En desarrollo, cargar desde filesystem
      const metadataDir = join(
        process.cwd(),
        'public',
        'uploads',
        'vehiculos',
        vehiculoId
      )
      await mkdir(metadataDir, { recursive: true })
      const metadataPath = join(metadataDir, METADATA_FILE)

      try {
        await access(metadataPath, constants.F_OK)
        const data = await readFile(metadataPath, 'utf-8')
        return JSON.parse(data)
      } catch (accessError: any) {
        if (accessError.code === 'ENOENT') {
          return []
        }
        throw accessError
      }
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
    const { id: vehiculoId } = await params
    console.log(
      `📁 [FILES API] Obteniendo archivos para vehículo ${vehiculoId}`
    )

    const metadata = await loadMetadata(vehiculoId)
    console.log(`📁 [FILES API] Archivos encontrados:`, metadata.length)

    return NextResponse.json(metadata, { status: 200 })
  } catch (error) {
    console.error('❌ [FILES API] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor al cargar archivos' },
      { status: 500 }
    )
  }
}
