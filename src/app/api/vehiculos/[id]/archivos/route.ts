import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile, unlink, access } from 'fs/promises'
import { join } from 'path'
import { constants } from 'fs'
import { put, list, del } from '@vercel/blob'

const METADATA_FILE = 'archivos-metadata.json'
const USE_BLOB_STORAGE = process.env.VERCEL || process.env.VERCEL_ENV

async function loadMetadata(vehiculoId: number) {
  try {
    if (USE_BLOB_STORAGE) {
      // En producción, cargar desde Vercel Blob
      try {
        const prefix = `vehiculos/${vehiculoId}/`
        console.log(
          `📁 [VEHICULO ARCHIVOS] Buscando archivos con prefijo: "${prefix}"`
        )
        const { blobs } = await list({ prefix })
        console.log(`📁 [VEHICULO ARCHIVOS] Blobs encontrados:`, blobs.length)
        console.log(
          `📁 [VEHICULO ARCHIVOS] Blobs:`,
          blobs.map((b) => b.path)
        )

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
          `📁 [VEHICULO ARCHIVOS] Archivos mapeados desde Blob:`,
          mappedBlobs.length
        )
        return mappedBlobs
      } catch (blobError: any) {
        console.error(
          '❌ [VEHICULO ARCHIVOS] Error cargando desde Vercel Blob:',
          {
            message: blobError?.message,
            code: blobError?.code,
          }
        )
        // Si falla Vercel Blob, devolver array vacío
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

      // Verificar si el archivo existe antes de leerlo
      try {
        await access(metadataPath, constants.F_OK)
        const data = await readFile(metadataPath, 'utf-8')
        return JSON.parse(data)
      } catch (accessError: any) {
        // Si el archivo no existe (ENOENT), devolver array vacío
        if (accessError.code === 'ENOENT') {
          return []
        }
        // Si es otro error, lanzarlo para que lo capture el catch externo
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
    console.log(
      `📁 [VEHICULO ARCHIVOS] Archivos:`,
      JSON.stringify(metadata, null, 2)
    )

    return NextResponse.json(metadata, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
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
    console.log(`🔍 [VEHICULO UPLOAD] Detección Vercel:`, {
      VERCEL: !!process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      USE_BLOB_STORAGE,
      BLOB_TOKEN_EXISTS: !!process.env.BLOB_READ_WRITE_TOKEN,
    })

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
          `📦 [VEHICULO UPLOAD] Intentando subir a Vercel Blob... Token disponible: ${!!process.env.BLOB_READ_WRITE_TOKEN}`
        )

        // Vercel Blob detecta automáticamente el token de las variables de entorno
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
      } catch (blobError: any) {
        console.error('❌ [VEHICULO UPLOAD] Error con Vercel Blob:', {
          message: blobError?.message,
          status: blobError?.status,
          statusText: blobError?.statusText,
          code: blobError?.code,
          name: blobError?.name,
        })

        // Si el error es de autenticación o configuración, dar un mensaje más claro
        if (
          blobError?.message?.includes('token') ||
          blobError?.message?.includes('authentication') ||
          blobError?.message?.includes('unauthorized') ||
          !process.env.BLOB_READ_WRITE_TOKEN
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                'Error de configuración: Vercel Blob Storage no está configurado correctamente. Verifica que BLOB_READ_WRITE_TOKEN esté configurado en Vercel.',
              details: blobError?.message || 'Token no encontrado',
            },
            { status: 500 }
          )
        }

        // Para otros errores, re-lanzar para que lo capture el catch externo
        throw blobError
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
  } catch (error: any) {
    console.error('❌ [VEHICULO UPLOAD] Error completo:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      code: error?.code,
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Error al subir archivo',
        details: error?.message || 'Error desconocido',
      },
      { status: 500 }
    )
  }
}
