import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile, unlink, access } from 'fs/promises'
import { join } from 'path'
import { constants } from 'fs'
import { del, list } from '@vercel/blob'

const METADATA_FILE = 'archivos-metadata.json'
const USE_BLOB_STORAGE = process.env.VERCEL || process.env.VERCEL_ENV

async function loadMetadata(vehiculoId: number) {
  try {
    if (USE_BLOB_STORAGE) {
      // En producción, cargar desde Vercel Blob
      try {
        const prefix = `vehiculos/${vehiculoId}/`
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
          `📁 [VEHICULO DELETE] Archivos mapeados desde Blob:`,
          mappedBlobs.length
        )
        return mappedBlobs
      } catch (blobError: any) {
        console.error(
          '❌ [VEHICULO DELETE] Error cargando desde Vercel Blob:',
          {
            message: blobError?.message,
            code: blobError?.code,
          }
        )
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
    console.log(`📁 [VEHICULO DELETE] Buscando archivo con ID: ${fileId}`)
    console.log(
      `📁 [VEHICULO DELETE] Archivos disponibles:`,
      existingMetadata.map((f: any) => ({ id: f.id, name: f.name }))
    )

    const fileToDelete = existingMetadata.find(
      (f: any) => f.id === fileId || f.id.toString() === fileId.toString()
    )

    if (!fileToDelete) {
      console.error(
        '❌ [VEHICULO DELETE] Archivo no encontrado. ID buscado:',
        fileId
      )
      return NextResponse.json(
        { error: 'Archivo no encontrado' },
        { status: 404 }
      )
    }

    console.log(`📁 [VEHICULO DELETE] Archivo encontrado:`, fileToDelete)

    if (USE_BLOB_STORAGE) {
      // Producción: eliminar de Vercel Blob
      try {
        const blobUrl = fileToDelete.path
        await del(blobUrl)
        console.log(
          `✅ [VEHICULO DELETE] Archivo eliminado de Blob: ${blobUrl}`
        )
      } catch (blobError: any) {
        console.error('❌ [VEHICULO DELETE] Error eliminando de Vercel Blob:', {
          message: blobError?.message,
          code: blobError?.code,
        })

        // Si el archivo no existe en Blob o hay un error, continuar
        // (puede que ya haya sido eliminado o nunca existió)
        if (
          blobError?.message?.includes('not found') ||
          blobError?.status === 404
        ) {
          console.log(
            '⚠️ [VEHICULO DELETE] Archivo no encontrado en Blob, continuando...'
          )
        } else {
          throw blobError
        }
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

      // En desarrollo, también actualizar metadatos
      const fileIndex = existingMetadata.findIndex((f: any) => f.id === fileId)
      if (fileIndex !== -1) {
        existingMetadata.splice(fileIndex, 1)
        await saveMetadata(vehiculoId, existingMetadata)
        console.log(`✅ [VEHICULO DELETE] Metadatos actualizados`)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Archivo eliminado exitosamente',
    })
  } catch (error: any) {
    console.error('❌ [VEHICULO DELETE] Error completo:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Error al eliminar archivo',
        details: error?.message || 'Error desconocido',
      },
      { status: 500 }
    )
  }
}
