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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const { id, fileId } = await params
    const vehiculoId = parseInt(id)

    console.log(
      `🗑️ [VEHICULO DELETE] Eliminando archivo ${fileId} del vehículo ${vehiculoId}`
    )

    // Cargar metadatos existentes
    const existingMetadata = await loadMetadata(vehiculoId)

    // Buscar el archivo a eliminar
    const fileIndex = existingMetadata.findIndex((f: any) => f.id === fileId)
    if (fileIndex === -1) {
      console.error('❌ [VEHICULO DELETE] Archivo no encontrado en metadatos')
      return NextResponse.json(
        { error: 'Archivo no encontrado' },
        { status: 404 }
      )
    }

    const fileToDelete = existingMetadata[fileIndex]

    // Intentar eliminar el archivo físico
    try {
      const filePath = join(process.cwd(), 'public', fileToDelete.path)
      await unlink(filePath)
      console.log(`✅ [VEHICULO DELETE] Archivo físico eliminado: ${filePath}`)
    } catch (unlinkError) {
      console.warn(
        `⚠️ [VEHICULO DELETE] No se pudo eliminar el archivo físico:`,
        unlinkError
      )
      // Continuar con la eliminación de metadatos aunque falle la eliminación física
    }

    // Eliminar de metadatos
    existingMetadata.splice(fileIndex, 1)
    await saveMetadata(vehiculoId, existingMetadata)

    console.log(`✅ [VEHICULO DELETE] Archivo eliminado de metadatos`)

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
