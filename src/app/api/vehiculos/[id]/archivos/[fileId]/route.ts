import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { del } from '@vercel/blob'

const METADATA_FILE = 'archivos-metadata.json'
// Detectar si estamos en Vercel (producción)
const USE_BLOB_STORAGE = !!(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.BLOB_READ_WRITE_TOKEN
)

async function loadMetadata(vehiculoId: number) {
  try {
    if (USE_BLOB_STORAGE) {
      // En producción, cargar desde Vercel Blob
      try {
        const { list } = await import('@vercel/blob')
        const prefix = `vehiculos/${vehiculoId}/`
        const { blobs } = await list({ prefix })

        return blobs.map((blob) => ({
          id:
            blob.path.split('/').pop()?.split('-')[0] ||
            blob.uploadedAt.toString(),
          name: blob.path.split('/').pop()?.replace(/^\d+-/, '') || 'unknown',
          fileName: blob.path.split('/').pop() || 'unknown',
          size: blob.size,
          type: blob.contentType || 'application/octet-stream',
          uploadDate: blob.uploadedAt.toISOString(),
          path: blob.url,
        }))
      } catch (blobError) {
        console.error('Error loading metadata from Blob:', blobError)
        return []
      }
    } else {
      // En desarrollo, cargar desde filesystem
      const metadataDir = join(
        process.cwd(),
        'public',
        'uploads',
        'vehiculos',
        vehiculoId.toString()
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

async function saveMetadata(vehiculoId: number, metadata: any[]) {
  try {
    const metadataDir = join(
      process.cwd(),
      'public',
      'uploads',
      'vehiculos',
      vehiculoId.toString()
    )
    await mkdir(metadataDir, { recursive: true })
    const metadataPath = join(metadataDir, METADATA_FILE)
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2))
  } catch (error) {
    console.error('Error saving metadata:', error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const { id, fileId } = await params
    const vehiculoId = parseInt(id)

    console.log(
      `🗑️ [VEHICULO DELETE] Eliminando archivo ${fileId} del vehículo ${vehiculoId}, Blob: ${USE_BLOB_STORAGE}`
    )

    const existingMetadata = await loadMetadata(vehiculoId)
    const fileIndex = existingMetadata.findIndex((f: any) => f.id === fileId)

    if (fileIndex === -1) {
      console.error('❌ [VEHICULO DELETE] Archivo no encontrado')
      return NextResponse.json(
        { error: 'Archivo no encontrado' },
        { status: 404 }
      )
    }

    const fileToDelete = existingMetadata[fileIndex]

    if (USE_BLOB_STORAGE) {
      // Producción: eliminar de Vercel Blob
      try {
        const blobUrl = fileToDelete.path
        console.log(
          `🗑️ [VEHICULO DELETE] Eliminando de Blob: ${blobUrl}, Token presente: ${!!process.env.BLOB_READ_WRITE_TOKEN}`
        )
        await del(blobUrl)
        console.log(
          `✅ [VEHICULO DELETE] Archivo eliminado de Blob: ${blobUrl}`
        )
      } catch (blobError) {
        console.error(
          '❌ [VEHICULO DELETE] Error al eliminar de Blob:',
          blobError
        )
        throw blobError
      }
    } else {
      // Desarrollo: eliminar de filesystem
      try {
        const filePath = join(process.cwd(), 'public', fileToDelete.path)
        await unlink(filePath)
        console.log(`✅ [VEHICULO DELETE] Archivo eliminado: ${filePath}`)
      } catch (unlinkError) {
        console.warn(
          `⚠️ [VEHICULO DELETE] No se pudo eliminar archivo:`,
          unlinkError
        )
      }

      existingMetadata.splice(fileIndex, 1)
      await saveMetadata(vehiculoId, existingMetadata)
      console.log(`✅ [VEHICULO DELETE] Metadatos actualizados`)
    }

    return NextResponse.json({
      success: true,
      message: 'Archivo eliminado exitosamente',
    })
  } catch (error) {
    console.error('❌ [VEHICULO DELETE] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al eliminar archivo',
      },
      { status: 500 }
    )
  }
}
