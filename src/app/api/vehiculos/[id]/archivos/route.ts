import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { put, list, del } from '@vercel/blob'

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
        console.log(
          `📥 [VEHICULO ARCHIVOS] Cargando desde Vercel Blob para vehículo ${vehiculoId}`
        )
        const prefix = `vehiculos/${vehiculoId}/`
        const { blobs } = await list({ prefix })

        console.log(
          `📥 [VEHICULO ARCHIVOS] Encontrados ${blobs.length} archivos en Blob`
        )

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const vehiculoId = parseInt(id)

    console.log(
      `📁 [VEHICULO ARCHIVOS] Obteniendo archivos para vehículo ${vehiculoId}`
    )

    const metadata = await loadMetadata(vehiculoId)
    console.log(`📁 [VEHICULO ARCHIVOS] Archivos encontrados:`, metadata.length)

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
        console.log(
          `📤 [VEHICULO UPLOAD] Subiendo a Vercel Blob Storage... Token presente: ${!!process.env.BLOB_READ_WRITE_TOKEN}`
        )

        const blob = await put(
          `vehiculos/${vehiculoId}/${uniqueFileName}`,
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
      const uploadDir = join(
        process.cwd(),
        'public',
        'uploads',
        'vehiculos',
        vehiculoId.toString()
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
        path: `/uploads/vehiculos/${vehiculoId}/${uniqueFileName}`,
      }

      existingMetadata.push(newFileMetadata)
      await saveMetadata(vehiculoId, existingMetadata)

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
