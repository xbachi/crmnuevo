import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { join } from 'path'

const METADATA_FILE = 'archivos-metadata.json'

async function loadMetadata(vehiculoId: number) {
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
    const data = await readFile(metadataPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
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
      `📁 [VEHICULO UPLOAD] Archivo: ${file.name}, Vehículo: ${vehiculoId}`
    )

    // Crear directorio si no existe
    const uploadDir = join(
      process.cwd(),
      'public',
      'uploads',
      'vehiculos',
      vehiculoId.toString()
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

    console.log(`✅ [VEHICULO UPLOAD] Archivo guardado en: ${filePath}`)

    // Cargar metadatos existentes
    const existingMetadata = await loadMetadata(vehiculoId)

    // Agregar nuevo archivo a metadatos
    const newFileMetadata = {
      id: Date.now().toString(),
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
