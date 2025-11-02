import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, unlink, mkdir, access } from 'fs/promises'
import { join } from 'path'
import { constants } from 'fs'
import { del, list } from '@vercel/blob'

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

        return mappedBlobs
      } catch (blobError: any) {
        console.error('❌ [DELETE] Error cargando desde Vercel Blob:', {
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
    console.error(`Error loading metadata for vehiculo ${vehiculoId}:`, error)
    return []
  }
}

async function saveMetadata(vehiculoId: string, metadata: any[]) {
  const metadataDir = join(
    process.cwd(),
    'public',
    'uploads',
    'vehiculos',
    vehiculoId
  )
  const metadataPath = join(metadataDir, METADATA_FILE)

  try {
    // Crear directorio si no existe
    await mkdir(metadataDir, { recursive: true })

    // Guardar metadatos
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
    console.log(`✅ [DELETE] Metadatos guardados para vehículo ${vehiculoId}`)
  } catch (error) {
    console.error(
      `❌ [DELETE] Error guardando metadatos para vehículo ${vehiculoId}:`,
      error
    )
    throw error
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const { id: vehiculoId, fileId } = await params

    console.log(
      `🗑️ [DELETE FILE] Eliminando archivo ${fileId} del vehículo ${vehiculoId}`
    )

    // Cargar metadatos actuales
    const metadata = await loadMetadata(vehiculoId)
    console.log(`📁 [DELETE] Metadatos actuales: ${metadata.length} archivos`)

    // Encontrar el archivo a eliminar
    const fileIndex = metadata.findIndex((file: any) => file.id === fileId)

    if (fileIndex === -1) {
      console.log(`❌ [DELETE] Archivo ${fileId} no encontrado en metadatos`)
      return NextResponse.json(
        { error: 'Archivo no encontrado' },
        { status: 404 }
      )
    }

    const fileToDelete = metadata[fileIndex]
    console.log(`🔍 [DELETE] Archivo encontrado:`, fileToDelete)

    if (USE_BLOB_STORAGE) {
      // Producción: eliminar de Vercel Blob
      try {
        const blobUrl = fileToDelete.path
        await del(blobUrl)
        console.log(`✅ [DELETE] Archivo eliminado de Blob: ${blobUrl}`)
      } catch (blobError: any) {
        console.error('❌ [DELETE] Error eliminando de Vercel Blob:', {
          message: blobError?.message,
          code: blobError?.code,
        })

        // Si el archivo no existe en Blob o hay un error, continuar
        if (
          blobError?.message?.includes('not found') ||
          blobError?.status === 404
        ) {
          console.log(
            '⚠️ [DELETE] Archivo no encontrado en Blob, continuando...'
          )
        } else {
          throw blobError
        }
      }
    } else {
      // Desarrollo: eliminar archivo físico
      const filePath = join(process.cwd(), 'public', fileToDelete.path)
      try {
        const { existsSync } = await import('fs')
        if (existsSync(filePath)) {
          await unlink(filePath)
          console.log(`✅ [DELETE] Archivo físico eliminado: ${filePath}`)
        } else {
          console.log(`⚠️ [DELETE] Archivo físico no encontrado: ${filePath}`)
        }
      } catch (error) {
        console.error(`❌ [DELETE] Error eliminando archivo físico:`, error)
        // Continuar aunque falle la eliminación física
      }

      // En desarrollo, también actualizar metadatos
      metadata.splice(fileIndex, 1)
      console.log(
        `📝 [DELETE] Archivo eliminado de metadatos. Quedan: ${metadata.length} archivos`
      )

      // Guardar metadatos actualizados
      await saveMetadata(vehiculoId, metadata)
    }

    console.log(`✅ [DELETE] Archivo ${fileId} eliminado exitosamente`)

    return NextResponse.json({
      success: true,
      message: 'Archivo eliminado correctamente',
      remainingFiles: metadata.length,
    })
  } catch (error) {
    console.error(`❌ [DELETE] Error eliminando archivo:`, error)
    return NextResponse.json(
      {
        error: 'Error interno del servidor al eliminar archivo',
      },
      { status: 500 }
    )
  }
}
