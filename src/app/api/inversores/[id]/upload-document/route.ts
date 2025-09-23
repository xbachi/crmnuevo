import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile } from 'fs/promises'
import { join } from 'path'

const METADATA_FILE = 'inversores-documentos-metadata.json'

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
      `📁 [INVERSOR UPLOAD API] Archivo: ${file.name}, Inversor: ${inversorId}`
    )

    // Crear directorio si no existe
    const uploadDir = join(
      process.cwd(),
      'public',
      'uploads',
      'inversores',
      inversorId
    )
    await mkdir(uploadDir, { recursive: true })

    // Generar nombre único para el archivo
    const timestamp = Date.now()
    const fileExtension = file.name.split('.').pop()
    const uniqueFileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
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
      id: Date.now().toString(),
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
