import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { del, list } from '@vercel/blob'

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
        const prefix = `inversores/${inversorId}/`
        const { blobs } = await list({ prefix })

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
        console.error('Error loading metadata from Blob:', blobError)
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
      const metadataPath = join(metadataDir, METADATA_FILE)
      try {
        if (!existsSync(metadataPath)) {
          return []
        }
        const data = await readFile(metadataPath, 'utf-8')
        return JSON.parse(data)
      } catch (error) {
        console.error(
          `Error loading metadata for inversor ${inversorId}:`,
          error
        )
        return []
      }
    }
  } catch (error) {
    console.error(`Error loading metadata for inversor ${inversorId}:`, error)
    return []
  }
}

async function saveMetadata(inversorId: string, metadata: any[]) {
  const metadataDir = join(
    process.cwd(),
    'public',
    'uploads',
    'inversores',
    inversorId
  )
  const metadataPath = join(metadataDir, METADATA_FILE)

  try {
    // Crear directorio si no existe
    await mkdir(metadataDir, { recursive: true })

    // Guardar metadatos
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
    console.log(
      `✅ [INVERSOR DELETE] Metadatos guardados para inversor ${inversorId}`
    )
  } catch (error) {
    console.error(
      `❌ [INVERSOR DELETE] Error guardando metadatos para inversor ${inversorId}:`,
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
    const { id: inversorId, fileId } = await params

    console.log(
      `🗑️ [INVERSOR DELETE FILE] Eliminando archivo ${fileId} del inversor ${inversorId}`
    )

    // Cargar metadatos actuales
    const metadata = await loadMetadata(inversorId)
    console.log(
      `📁 [INVERSOR DELETE] Metadatos actuales: ${metadata.length} archivos`
    )

    // Encontrar el archivo a eliminar
    const fileIndex = metadata.findIndex((file: any) => file.id === fileId)

    if (fileIndex === -1) {
      console.log(
        `❌ [INVERSOR DELETE] Archivo ${fileId} no encontrado en metadatos`
      )
      return NextResponse.json(
        { error: 'Archivo no encontrado' },
        { status: 404 }
      )
    }

    const fileToDelete = metadata[fileIndex]
    console.log(`🔍 [INVERSOR DELETE] Archivo encontrado:`, fileToDelete)

    if (USE_BLOB_STORAGE) {
      // Producción: eliminar de Vercel Blob
      try {
        const blobUrl = fileToDelete.path
        console.log(
          `🗑️ [INVERSOR DELETE] Eliminando de Blob: ${blobUrl}, Token presente: ${!!process.env.BLOB_READ_WRITE_TOKEN}`
        )
        await del(blobUrl)
        console.log(
          `✅ [INVERSOR DELETE] Archivo eliminado de Blob: ${blobUrl}`
        )
      } catch (blobError) {
        console.error(
          '❌ [INVERSOR DELETE] Error al eliminar de Blob:',
          blobError
        )
        throw blobError
      }
    } else {
      // Desarrollo: eliminar de filesystem
      const filePath = join(process.cwd(), 'public', fileToDelete.path)
      try {
        if (existsSync(filePath)) {
          await unlink(filePath)
          console.log(
            `✅ [INVERSOR DELETE] Archivo físico eliminado: ${filePath}`
          )
        } else {
          console.log(
            `⚠️ [INVERSOR DELETE] Archivo físico no encontrado: ${filePath}`
          )
        }
      } catch (error) {
        console.error(
          `❌ [INVERSOR DELETE] Error eliminando archivo físico:`,
          error
        )
        // Continuar aunque falle la eliminación física
      }

      // Eliminar de metadatos solo en desarrollo (en producción no hay metadatos en filesystem)
      metadata.splice(fileIndex, 1)
      console.log(
        `📝 [INVERSOR DELETE] Archivo eliminado de metadatos. Quedan: ${metadata.length} archivos`
      )

      // Guardar metadatos actualizados solo en desarrollo
      await saveMetadata(inversorId, metadata)
    }

    console.log(`✅ [INVERSOR DELETE] Archivo ${fileId} eliminado exitosamente`)

    return NextResponse.json({
      success: true,
      message: 'Archivo eliminado correctamente',
      remainingFiles: metadata.length,
    })
  } catch (error) {
    console.error(`❌ [INVERSOR DELETE] Error eliminando archivo:`, error)
    return NextResponse.json(
      {
        error: 'Error interno del servidor al eliminar archivo',
      },
      { status: 500 }
    )
  }
}
