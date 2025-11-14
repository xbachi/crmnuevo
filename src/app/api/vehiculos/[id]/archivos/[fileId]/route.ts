import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { del } from '@vercel/blob'
import { pool } from '@/lib/direct-database'

const METADATA_FILE = 'archivos-metadata.json'
// Detectar si estamos en Vercel (producción)
const USE_BLOB_STORAGE = !!(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.BLOB_READ_WRITE_TOKEN
)

// Función helper para obtener la matrícula del vehículo o usar el ID como fallback
async function getVehiculoFolderName(vehiculoId: number): Promise<string> {
  try {
    const result = await pool.query(
      'SELECT matricula FROM "Vehiculo" WHERE id = $1',
      [vehiculoId]
    )
    if (result.rows.length > 0 && result.rows[0].matricula) {
      const matricula = result.rows[0].matricula.trim()
      // Limpiar la matrícula para que sea válida como nombre de carpeta
      const cleanMatricula = matricula
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toUpperCase()
      return cleanMatricula || `vehiculo_${vehiculoId}`
    }
  } catch (error) {
    console.error('Error obteniendo matrícula del vehículo:', error)
  }
  // Fallback al ID si no hay matrícula o hay error
  return `vehiculo_${vehiculoId}`
}

async function loadMetadata(vehiculoId: number) {
  try {
    if (USE_BLOB_STORAGE) {
      // En producción, cargar desde Vercel Blob
      try {
        const { list } = await import('@vercel/blob')
        const folderName = await getVehiculoFolderName(vehiculoId)
        // Buscar tanto por matrícula como por ID para mantener compatibilidad
        const prefixMatricula = `vehiculos/${folderName}/`
        const prefixId = `vehiculos/${vehiculoId}/`

        const [blobsMatricula, blobsId] = await Promise.all([
          list({ prefix: prefixMatricula }).catch(() => ({ blobs: [] })),
          list({ prefix: prefixId }).catch(() => ({ blobs: [] })),
        ])

        // Combinar ambos resultados y eliminar duplicados
        const allBlobs = [...blobsMatricula.blobs, ...blobsId.blobs]
        const uniqueBlobs = allBlobs.filter(
          (blob, index, self) =>
            index === self.findIndex((b) => b.url === blob.url)
        )

        return uniqueBlobs.map((blob) => {
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

async function saveMetadata(
  vehiculoId: number,
  metadata: any[],
  folderName?: string
) {
  try {
    const finalFolderName =
      folderName || (await getVehiculoFolderName(vehiculoId))
    const metadataDir = join(
      process.cwd(),
      'public',
      'uploads',
      'vehiculos',
      finalFolderName
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
      const folderName = await getVehiculoFolderName(vehiculoId)
      await saveMetadata(vehiculoId, existingMetadata, folderName)
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
