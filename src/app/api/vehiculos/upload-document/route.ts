import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile, access } from 'fs/promises'
import { join } from 'path'
import { constants } from 'fs'
import { put, list } from '@vercel/blob'

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
          `📁 [UPLOAD DOCUMENT] Archivos mapeados desde Blob:`,
          mappedBlobs.length
        )
        return mappedBlobs
      } catch (blobError: any) {
        console.error(
          '❌ [UPLOAD DOCUMENT] Error cargando desde Vercel Blob:',
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

async function saveMetadata(vehiculoId: string, metadata: any[]) {
  try {
    const metadataDir = join(
      process.cwd(),
      'public',
      'uploads',
      'vehiculos',
      vehiculoId
    )
    await mkdir(metadataDir, { recursive: true })
    const metadataPath = join(metadataDir, METADATA_FILE)
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2))
  } catch (error) {
    console.error('Error saving metadata:', error)
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log(`🔍 [UPLOAD API] Iniciando subida de archivo`)

    const formData = await request.formData()
    const file = formData.get('file') as File
    const vehiculoId = formData.get('vehiculoId') as string

    if (!file || !vehiculoId) {
      return NextResponse.json(
        { error: 'Archivo y vehículo ID requeridos' },
        { status: 400 }
      )
    }

    console.log(
      `📁 [UPLOAD API] Archivo: ${file.name}, Vehículo: ${vehiculoId}, Blob: ${USE_BLOB_STORAGE}`
    )

    // Generar nombre único para el archivo
    const timestamp = Date.now()
    const uniqueFileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

    if (USE_BLOB_STORAGE) {
      // Producción: subir a Vercel Blob
      try {
        console.log(
          `📦 [UPLOAD DOCUMENT] Intentando subir a Vercel Blob... Token disponible: ${!!process.env.BLOB_READ_WRITE_TOKEN}`
        )

        // Vercel Blob detecta automáticamente el token de las variables de entorno
        const blob = await put(
          `vehiculos-documentos/${vehiculoId}/${uniqueFileName}`,
          file,
          {
            access: 'public',
            contentType: file.type,
          }
        )

        console.log(`✅ [UPLOAD DOCUMENT] Archivo subido a Blob: ${blob.url}`)

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
      } catch (blobError: any) {
        console.error('❌ [UPLOAD DOCUMENT] Error con Vercel Blob:', {
          message: blobError?.message,
          status: blobError?.status,
          code: blobError?.code,
        })

        return NextResponse.json(
          {
            success: false,
            error: 'Error al subir archivo a Vercel Blob Storage',
            details: blobError?.message || 'Error desconocido',
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
        vehiculoId
      )
      await mkdir(uploadDir, { recursive: true })
      const filePath = join(uploadDir, uniqueFileName)

      // Guardar archivo
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      await writeFile(filePath, buffer)

      console.log(`✅ [UPLOAD API] Archivo guardado en: ${filePath}`)

      // Cargar metadatos existentes
      const existingMetadata = await loadMetadata(vehiculoId)

      // Agregar nuevo archivo a metadatos
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

      console.log(`✅ [UPLOAD API] Metadatos actualizados`)

      return NextResponse.json({
        success: true,
        message: 'Archivo subido exitosamente',
        file: newFileMetadata,
      })
    }
  } catch (error) {
    console.error('❌ [UPLOAD API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al subir archivo',
      },
      { status: 500 }
    )
  }
}
