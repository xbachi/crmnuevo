import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import { put, list } from '@vercel/blob'

const METADATA_FILE = 'inversores-documentos-metadata.json'
// Detectar si estamos en Vercel (producción)
const USE_BLOB_STORAGE = !!(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.BLOB_READ_WRITE_TOKEN
)

async function loadMetadata(inversorId: string) {
  try {
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
  } catch (error) {
    return []
  }
}

async function saveMetadata(inversorId: string, metadata: any[]) {
  try {
    const metadataDir = join(
      process.cwd(),
      'public',
      'uploads',
      'inversores',
      inversorId
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
    console.log(`🔍 [INVERSOR UPLOAD API] Iniciando subida de archivo`)

    const formData = await request.formData()
    const file = formData.get('file') as File
    const inversorId = formData.get('inversorId') as string

    if (!file || !inversorId) {
      return NextResponse.json(
        { error: 'Archivo e inversor ID requeridos' },
        { status: 400 }
      )
    }

    console.log(
      `📁 [INVERSOR UPLOAD API] Archivo: ${file.name}, Inversor: ${inversorId}, Blob: ${USE_BLOB_STORAGE}`
    )

    // Generar nombre único para el archivo
    const timestamp = Date.now()
    const fileExtension = file.name.split('.').pop()
    const uniqueFileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

    if (USE_BLOB_STORAGE) {
      // Producción: subir a Vercel Blob
      try {
        console.log(
          `📤 [INVERSOR UPLOAD API] Subiendo a Vercel Blob Storage... Token presente: ${!!process.env.BLOB_READ_WRITE_TOKEN}`
        )

        const blob = await put(
          `inversores/${inversorId}/${uniqueFileName}`,
          file,
          {
            access: 'public',
            addRandomSuffix: true,
            contentType: file.type,
          }
        )

        console.log(
          `✅ [INVERSOR UPLOAD API] Archivo subido a Blob: ${blob.url}`
        )

        const newFileMetadata = {
          id: timestamp.toString(),
          name: file.name,
          fileName: blob.pathname.split('/').pop() ?? uniqueFileName,
          size: file.size,
          type: file.type,
          uploadDate: new Date().toISOString(),
          path: blob.url,
        }

        console.log(
          `✅ [INVERSOR UPLOAD API] Metadatos del archivo:`,
          newFileMetadata
        )

        return NextResponse.json({
          success: true,
          message: 'Archivo subido exitosamente',
          file: newFileMetadata,
        })
      } catch (blobError) {
        console.error(
          '❌ [INVERSOR UPLOAD API] Error al subir a Blob:',
          blobError
        )
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
        'inversores',
        inversorId
      )
      await mkdir(uploadDir, { recursive: true })
      const filePath = join(uploadDir, uniqueFileName)

      // Guardar archivo
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      await writeFile(filePath, buffer)

      console.log(`✅ [INVERSOR UPLOAD API] Archivo guardado en: ${filePath}`)

      // Cargar metadatos existentes
      const existingMetadata = await loadMetadata(inversorId)

      // Agregar nuevo archivo a metadatos
      const newFileMetadata = {
        id: timestamp.toString(),
        name: file.name,
        fileName: uniqueFileName,
        size: file.size,
        type: file.type,
        uploadDate: new Date().toISOString(),
        path: `/uploads/inversores/${inversorId}/${uniqueFileName}`,
      }

      existingMetadata.push(newFileMetadata)
      await saveMetadata(inversorId, existingMetadata)

      console.log(`✅ [INVERSOR UPLOAD API] Metadatos actualizados`)

      return NextResponse.json({
        success: true,
        message: 'Archivo subido exitosamente',
        file: newFileMetadata,
      })
    }
  } catch (error) {
    console.error('❌ [INVERSOR UPLOAD API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al subir archivo',
      },
      { status: 500 }
    )
  }
}
