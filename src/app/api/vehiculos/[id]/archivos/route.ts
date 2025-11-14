import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { put, list, del } from '@vercel/blob'
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
        const folderName = await getVehiculoFolderName(vehiculoId)
        console.log(
          `📥 [VEHICULO ARCHIVOS] Cargando desde Vercel Blob para vehículo ${vehiculoId} (carpeta: ${folderName})`
        )
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

        console.log(
          `📥 [VEHICULO ARCHIVOS] Encontrados ${uniqueBlobs.length} archivos en Blob`
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
        console.error(
          '❌ [VEHICULO ARCHIVOS] Error al cargar desde Blob:',
          blobError
        )
        // Si falla Blob, intentar cargar desde filesystem como fallback
        console.log(
          '⚠️ [VEHICULO ARCHIVOS] Intentando fallback a filesystem...'
        )
        throw blobError // Re-lanzar para que se maneje en el catch externo
      }
    } else {
      // En desarrollo, cargar desde filesystem
      const folderName = await getVehiculoFolderName(vehiculoId)
      // Buscar tanto por matrícula como por ID para mantener compatibilidad
      const metadataDirMatricula = join(
        process.cwd(),
        'public',
        'uploads',
        'vehiculos',
        folderName
      )
      const metadataDirId = join(
        process.cwd(),
        'public',
        'uploads',
        'vehiculos',
        vehiculoId.toString()
      )

      // Intentar cargar desde matrícula primero, luego desde ID
      try {
        await mkdir(metadataDirMatricula, { recursive: true })
        const metadataPath = join(metadataDirMatricula, METADATA_FILE)
        const data = await readFile(metadataPath, 'utf-8')
        return JSON.parse(data)
      } catch {
        // Fallback a ID si no existe por matrícula
        await mkdir(metadataDirId, { recursive: true })
        const metadataPath = join(metadataDirId, METADATA_FILE)
        try {
          const data = await readFile(metadataPath, 'utf-8')
          return JSON.parse(data)
        } catch {
          return []
        }
      }
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const vehiculoId = parseInt(id)

    console.log(
      `📁 [VEHICULO ARCHIVOS] Obteniendo archivos para vehículo ${vehiculoId}, Blob Storage: ${USE_BLOB_STORAGE}`
    )

    const metadata = await loadMetadata(vehiculoId)
    console.log(`📁 [VEHICULO ARCHIVOS] Archivos encontrados:`, metadata.length)
    if (metadata.length > 0) {
      console.log(`📁 [VEHICULO ARCHIVOS] Primer archivo:`, metadata[0])
    }

    return NextResponse.json(metadata, { status: 200 })
  } catch (error) {
    console.error('❌ [VEHICULO ARCHIVOS] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor al cargar archivos' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log(`🔍 [VEHICULO UPLOAD] Iniciando subida de archivo`)

    const { id } = await params
    const vehiculoId = parseInt(id)

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
    }

    console.log(
      `📁 [VEHICULO UPLOAD] Archivo: ${file.name}, Vehículo: ${vehiculoId}, Blob: ${USE_BLOB_STORAGE}`
    )

    const timestamp = Date.now()
    const fileExtension = file.name.split('.').pop()
    const uniqueFileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

    if (USE_BLOB_STORAGE) {
      // Producción: subir a Vercel Blob
      try {
        const folderName = await getVehiculoFolderName(vehiculoId)
        console.log(
          `📤 [VEHICULO UPLOAD] Subiendo a Vercel Blob Storage... Token presente: ${!!process.env.BLOB_READ_WRITE_TOKEN}, Carpeta: ${folderName}`
        )

        const blob = await put(
          `vehiculos/${folderName}/${uniqueFileName}`,
          file,
          {
            access: 'public',
            contentType: file.type,
          }
        )

        console.log(`✅ [VEHICULO UPLOAD] Archivo subido a Blob: ${blob.url}`)

        const newFileMetadata = {
          id: timestamp.toString(),
          name: file.name,
          fileName: uniqueFileName,
          size: file.size,
          type: file.type,
          uploadDate: new Date().toISOString(),
          path: blob.url,
        }

        // En Blob Storage, los archivos se listan automáticamente, no necesitamos guardar metadatos
        // Pero devolvemos el archivo para que el frontend pueda actualizarse inmediatamente
        console.log(
          `✅ [VEHICULO UPLOAD] Metadatos del archivo:`,
          newFileMetadata
        )

        return NextResponse.json({
          success: true,
          message: 'Archivo subido exitosamente',
          file: newFileMetadata,
        })
      } catch (blobError) {
        console.error('❌ [VEHICULO UPLOAD] Error al subir a Blob:', blobError)
        return NextResponse.json(
          {
            success: false,
            error: 'Error al subir archivo a Vercel Blob Storage',
            details:
              blobError instanceof Error
                ? blobError.message
                : 'Error desconocido',
          },
          { status: 500 }
        )
      }
    } else {
      // Desarrollo: guardar en filesystem
      const folderName = await getVehiculoFolderName(vehiculoId)
      const uploadDir = join(
        process.cwd(),
        'public',
        'uploads',
        'vehiculos',
        folderName
      )
      await mkdir(uploadDir, { recursive: true })
      const filePath = join(uploadDir, uniqueFileName)

      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      await writeFile(filePath, buffer)

      console.log(`✅ [VEHICULO UPLOAD] Archivo guardado en: ${filePath}`)

      const existingMetadata = await loadMetadata(vehiculoId)
      const newFileMetadata = {
        id: timestamp.toString(),
        name: file.name,
        fileName: uniqueFileName,
        size: file.size,
        type: file.type,
        uploadDate: new Date().toISOString(),
        path: `/uploads/vehiculos/${folderName}/${uniqueFileName}`,
      }

      existingMetadata.push(newFileMetadata)
      await saveMetadata(vehiculoId, existingMetadata, folderName)

      console.log(`✅ [VEHICULO UPLOAD] Metadatos actualizados`)

      return NextResponse.json({
        success: true,
        message: 'Archivo subido exitosamente',
        file: newFileMetadata,
      })
    }
  } catch (error) {
    console.error('❌ [VEHICULO UPLOAD] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al subir archivo',
      },
      { status: 500 }
    )
  }
}
